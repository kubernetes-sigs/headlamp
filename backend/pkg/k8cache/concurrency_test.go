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
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd/api"
)

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

// TestGetClientSet_ReplacedContext verifies that a context replaced in the
// store, for example by a kubeconfig reload with rotated credentials, gets a
// clientset created from it, not the one cached or being created for the old
// context.
//
//nolint:funlen // Covers both the cached and the in-flight clientset.
func TestGetClientSet_ReplacedContext(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()

	newContext := func(token string) *kubeconfig.Context {
		return &kubeconfig.Context{
			ClusterID:   "/path+test-cluster",
			Cluster:     &api.Cluster{Server: "https://example.com"},
			AuthInfo:    &api.AuthInfo{Token: token},
			KubeContext: &api.Context{Cluster: "test-cluster"},
		}
	}

	oldContext, reloadedContext := newContext("old"), newContext("new")

	var (
		mu      sync.Mutex
		created = map[*kubernetes.Clientset]*kubeconfig.Context{}
		// oldCreating blocks the creation for oldContext once it is set.
		oldCreating chan struct{}
		releaseOld  = make(chan struct{})
	)

	restoreCreator := k8cache.SetClientsetCreator(
		func(k *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			mu.Lock()
			block := oldCreating
			mu.Unlock()

			if k == oldContext && block != nil {
				close(block)
				<-releaseOld
			}

			cs := &kubernetes.Clientset{}

			mu.Lock()
			created[cs] = k
			mu.Unlock()

			return cs, nil
		},
	)
	defer restoreCreator()

	createdFrom := func(cs *kubernetes.Clientset) *kubeconfig.Context {
		mu.Lock()
		defer mu.Unlock()

		return created[cs]
	}

	cs, err := k8cache.GetClientSet("test-cluster", oldContext, "")
	assert.NoError(t, err)
	assert.Same(t, oldContext, createdFrom(cs))

	cached, err := k8cache.GetClientSet("test-cluster", oldContext, "")
	assert.NoError(t, err)
	assert.Same(t, cs, cached, "the clientset should be cached for the same context")

	cs, err = k8cache.GetClientSet("test-cluster", reloadedContext, "")
	assert.NoError(t, err)
	assert.Same(t, reloadedContext, createdFrom(cs), "a cached clientset of the old context was used")

	// A creation for the old context is still running when the reloaded
	// context asks for its clientset.
	k8cache.ResetClientsetCache()

	mu.Lock()
	oldCreating = make(chan struct{})
	mu.Unlock()

	oldDone := make(chan struct{})

	go func() {
		defer close(oldDone)

		_, _ = k8cache.GetClientSet("test-cluster", oldContext, "")
	}()

	<-oldCreating

	reloaded := make(chan *kubernetes.Clientset, 1)

	go func() {
		cs, err := k8cache.GetClientSet("test-cluster", reloadedContext, "")
		assert.NoError(t, err)

		reloaded <- cs
	}()

	select {
	case cs = <-reloaded:
		assert.Same(t, reloadedContext, createdFrom(cs))
	case <-time.After(5 * time.Second):
		t.Error("the reloaded context waited for the old context's clientset")
	}

	close(releaseOld)
	<-oldDone
}
