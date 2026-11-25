// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package k8cache_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestGetClientSet_InFlightConnectionReplacement(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(k8cache.ResetClientsetCache)

	oldContext := &kubeconfig.Context{
		Name: "cluster", KubeContext: &api.Context{Cluster: "cluster", AuthInfo: "cluster"},
		Cluster: &api.Cluster{Server: "https://old.example.com"}, AuthInfo: &api.AuthInfo{},
	}
	newContext := oldContext.Copy()
	newContext.Cluster.Server = "https://new.example.com"
	started, release := make(chan struct{}), make(chan struct{})

	var unblock sync.Once

	restore := k8cache.SetClientsetCreator(func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
		if k.Cluster.Server == oldContext.Cluster.Server {
			close(started)
			<-release
		}

		return k.ClientSetWithToken(token)
	})
	defer restore()
	defer unblock.Do(func() { close(release) })

	get := func(k *kubeconfig.Context, done chan<- *kubernetes.Clientset) {
		client, err := k8cache.GetClientSet("cluster", k, "user")
		assert.NoError(t, err)

		done <- client
	}

	oldDone, newDone := make(chan *kubernetes.Clientset, 1), make(chan *kubernetes.Clientset, 1)
	go get(oldContext, oldDone)

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("old client creation did not start")
	}

	go get(newContext, newDone)

	var current *kubernetes.Clientset

	select {
	case current = <-newDone:
	case <-time.After(5 * time.Second):
		t.Fatal("new connection waited for the old connection's client")
	}

	unblock.Do(func() { close(release) })

	old := <-oldDone
	cached, err := k8cache.GetClientSet("cluster", newContext, "user")
	require.NoError(t, err)
	require.NotSame(t, old, cached)
	require.Same(t, current, cached, "late client creation must not replace the current connection's client")
}

func TestGetClientSet_StatelessUserIsolation(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	kContext := &kubeconfig.Context{
		Name: "cluster", KubeContext: &api.Context{Cluster: "cluster", AuthInfo: "cluster"},
		Cluster: &api.Cluster{Server: "https://example.com"}, AuthInfo: &api.AuthInfo{},
	}
	first, err := k8cache.GetClientSet("cluster\x00user-a", kContext, "shared-token")
	require.NoError(t, err)
	second, err := k8cache.GetClientSet("cluster\x00user-b", kContext, "shared-token")
	require.NoError(t, err)
	require.NotSame(t, first, second)

	k8cache.EvictClientsetsForCluster("cluster\x00user-a")

	stillActive, err := k8cache.GetClientSet("cluster\x00user-b", kContext, "shared-token")
	require.NoError(t, err)
	require.Same(t, second, stillActive)

	recreated, err := k8cache.GetClientSet("cluster\x00user-a", kContext, "shared-token")
	require.NoError(t, err)
	require.NotSame(t, first, recreated)
}

// TestGetClientSet_InFlightDedup verifies that concurrent GetClientSet calls
// for the same cache key result in only a single clientset creation.
func TestGetClientSet_InFlightDedup(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()

	const goroutines = 10

	var (
		createCount   atomic.Int32
		wg            sync.WaitGroup
		waiters       atomic.Int32
		readyToCreate = make(chan struct{})
		errs          = make([]error, goroutines)
	)

	restoreWaitHook := k8cache.SetTestingInFlightWait(func() {
		if waiters.Add(1) == int32(goroutines-1) {
			close(readyToCreate)
		}
	})
	defer restoreWaitHook()

	restoreCreator := k8cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			if goroutines > 1 {
				<-readyToCreate
			}

			createCount.Add(1)

			return &kubernetes.Clientset{}, nil
		},
	)
	defer restoreCreator()

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()

			_, errs[idx] = k8cache.GetClientSet("test-cluster", ctx, "same-token")
		}(i)
	}

	wg.Wait()

	for i, err := range errs {
		assert.NoError(t, err, "goroutine %d returned error", i)
	}

	assert.Equal(t, int32(1), createCount.Load(),
		"expected exactly 1 clientset creation, got %d", createCount.Load())
}

// TestGetClientSet_InFlightDedupDifferentKeys verifies that concurrent calls
// with different cache keys create separate clientsets.
func TestGetClientSet_InFlightDedupDifferentKeys(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()

	var createCount atomic.Int32

	restoreCreator := k8cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			createCount.Add(1)

			return &kubernetes.Clientset{}, nil
		},
	)
	defer restoreCreator()

	tokens := []string{"token-a", "token-b", "token-c"}

	var wg sync.WaitGroup

	errs := make([]error, len(tokens))
	wg.Add(len(tokens))

	for i, tok := range tokens {
		go func(idx int, token string) {
			defer wg.Done()

			ctx := &kubeconfig.Context{
				ClusterID:   "/path+test-cluster",
				Cluster:     &api.Cluster{Server: "https://example.com"},
				AuthInfo:    &api.AuthInfo{Token: "test"},
				KubeContext: &api.Context{Cluster: "test-cluster"},
			}

			_, errs[idx] = k8cache.GetClientSet("test-cluster", ctx, token)
		}(i, tok)
	}

	wg.Wait()

	for i, err := range errs {
		assert.NoError(t, err, "goroutine %d (token %s) returned error", i, tokens[i])
	}

	assert.Equal(t, len(tokens), int(createCount.Load()),
		"each unique token should create its own clientset")
}
