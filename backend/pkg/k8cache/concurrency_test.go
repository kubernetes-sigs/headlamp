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

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd/api"
)

func runConcurrentCalls(cache *k8cache.ClientsetCache, ctx *kubeconfig.Context, n int) []error {
	var wg sync.WaitGroup

	errs := make([]error, n)

	wg.Add(n)

	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()

			_, errs[idx] = cache.GetClientSet("test-cluster", ctx, "same-token")
		}(i)
	}

	wg.Wait()

	return errs
}

// TestGetClientSet_InFlightDedup verifies that concurrent GetClientSet calls
// for the same cache key result in only a single clientset creation.
func TestGetClientSet_InFlightDedup(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	const goroutines = 10

	var (
		createCount   atomic.Int32
		waiters       atomic.Int32
		readyToCreate = make(chan struct{})
	)

	cache.SetInFlightWaitHook(func() {
		if waiters.Add(1) == int32(goroutines-1) {
			close(readyToCreate)
		}
	})

	cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			if goroutines > 1 {
				<-readyToCreate
			}

			createCount.Add(1)

			return &kubernetes.Clientset{}, nil
		},
	)

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	errs := runConcurrentCalls(cache, ctx, goroutines)

	for i, err := range errs {
		assert.NoError(t, err, "goroutine %d returned error", i)
	}

	assert.Equal(t, int32(1), createCount.Load(),
		"expected exactly 1 clientset creation, got %d", createCount.Load())
}

// TestGetClientSet_InFlightDedupDifferentKeys verifies that concurrent calls
// with different cache keys create separate clientsets.
func TestGetClientSet_InFlightDedupDifferentKeys(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	var createCount atomic.Int32

	cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			createCount.Add(1)

			return &kubernetes.Clientset{}, nil
		},
	)

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

			_, errs[idx] = cache.GetClientSet("test-cluster", ctx, token)
		}(i, tok)
	}

	wg.Wait()

	for i, err := range errs {
		assert.NoError(t, err, "goroutine %d (token %s) returned error", i, tokens[i])
	}

	assert.Equal(t, len(tokens), int(createCount.Load()),
		"each unique token should create its own clientset")
}

// TestGetClientSet_InFlightCreatorErrorReleasesWaiters verifies that creator failure
// releases all waiting callers with the error and leaves no stale in-flight state.
func TestGetClientSet_InFlightCreatorErrorReleasesWaiters(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	const goroutines = 10

	var (
		createCount   atomic.Int32
		waiters       atomic.Int32
		readyToCreate = make(chan struct{})
	)

	cache.SetInFlightWaitHook(func() {
		if waiters.Add(1) == int32(goroutines-1) {
			close(readyToCreate)
		}
	})

	expectedErr := assert.AnError

	cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			if goroutines > 1 {
				<-readyToCreate
			}

			createCount.Add(1)

			return nil, expectedErr
		},
	)

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	errs := runConcurrentCalls(cache, ctx, goroutines)

	assert.Equal(t, int32(1), createCount.Load())

	for i, err := range errs {
		assert.ErrorIs(t, err, expectedErr, "goroutine %d should have received expected error", i)
	}

	assert.Equal(t, 0, cache.InFlightLen())
	assert.Equal(t, 0, cache.Len())

	// Verify retry can succeed
	cache.SetInFlightWaitHook(nil)
	cache.SetClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
		return &kubernetes.Clientset{}, nil
	})

	cs, err := cache.GetClientSet("test-cluster", ctx, "same-token")
	assert.NoError(t, err)
	assert.NotNil(t, cs)
	assert.Equal(t, 1, cache.Len())
}
