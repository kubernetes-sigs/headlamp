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
	"context"
	"fmt"
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

func makeTestContext(clusterName string) *kubeconfig.Context {
	return &kubeconfig.Context{
		ClusterID:   "/path+" + clusterName,
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: clusterName},
	}
}

// 1. Basic behavior: creation, reuse, token independence, context independence.
func TestClientsetCache_BasicBehavior(t *testing.T) {
	var createCount atomic.Int32

	cache := k8cache.NewClientsetCache(
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			createCount.Add(1)
			return &kubernetes.Clientset{}, nil
		}),
	)

	ctxA := makeTestContext("cluster-a")
	ctxB := makeTestContext("cluster-b")

	// First call creates a clientset
	cs1, err := cache.GetClientSet("cluster-a", ctxA, "token-1")
	require.NoError(t, err)
	assert.NotNil(t, cs1)
	assert.Equal(t, int32(1), createCount.Load())

	// Second call for the same context/token reuses it
	cs2, err := cache.GetClientSet("cluster-a", ctxA, "token-1")
	require.NoError(t, err)
	assert.Same(t, cs1, cs2, "expected reused clientset instance")
	assert.Equal(t, int32(1), createCount.Load())

	// Different tokens remain independent
	cs3, err := cache.GetClientSet("cluster-a", ctxA, "token-2")
	require.NoError(t, err)
	assert.NotNil(t, cs3)
	assert.NotSame(t, cs1, cs3)
	assert.Equal(t, int32(2), createCount.Load())

	// Different contexts remain independent
	cs4, err := cache.GetClientSet("cluster-b", ctxB, "token-1")
	require.NoError(t, err)
	assert.NotNil(t, cs4)
	assert.NotSame(t, cs1, cs4)
	assert.Equal(t, int32(3), createCount.Load())
}

// 2. Concurrency: same-key deduplication.
func TestClientsetCache_ConcurrencySameKey(t *testing.T) {
	const goroutines = 15

	var (
		createCount   atomic.Int32
		waiters       atomic.Int32
		readyToCreate = make(chan struct{})
	)

	cache := k8cache.NewClientsetCache(
		k8cache.WithInFlightWaitHook(func() {
			if waiters.Add(1) == int32(goroutines-1) {
				close(readyToCreate)
			}
		}),
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			<-readyToCreate
			createCount.Add(1)

			return &kubernetes.Clientset{}, nil
		}),
	)

	ctx := makeTestContext("cluster-conc")

	var wg sync.WaitGroup

	errs := make([]error, goroutines)
	clientsets := make([]*kubernetes.Clientset, goroutines)

	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()

			clientsets[idx], errs[idx] = cache.GetClientSet("cluster-conc", ctx, "same-token")
		}(i)
	}

	wg.Wait()

	for i, err := range errs {
		assert.NoError(t, err, "goroutine %d failed", i)
		assert.NotNil(t, clientsets[i])
		assert.Same(t, clientsets[0], clientsets[i], "all waiters must receive the same clientset")
	}

	assert.Equal(t, int32(1), createCount.Load())
	assert.Equal(t, 0, cache.InFlightLen())
}

// 2b. Concurrency: creator error propagation.
func TestClientsetCache_ConcurrencyCreatorError(t *testing.T) {
	const goroutines = 12

	var (
		createCount atomic.Int32
		waiters     atomic.Int32
		readyToFail = make(chan struct{})
	)

	expectedErr := fmt.Errorf("connection refused")

	cache := k8cache.NewClientsetCache(
		k8cache.WithInFlightWaitHook(func() {
			if waiters.Add(1) == int32(goroutines-1) {
				close(readyToFail)
			}
		}),
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			<-readyToFail
			createCount.Add(1)

			return nil, expectedErr
		}),
	)

	ctx := makeTestContext("cluster-err")

	var wg sync.WaitGroup

	errs := make([]error, goroutines)

	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()

			_, errs[idx] = cache.GetClientSet("cluster-err", ctx, "token-fail")
		}(i)
	}

	wg.Wait()

	assert.Equal(t, int32(1), createCount.Load())

	for i, err := range errs {
		assert.Error(t, err, "goroutine %d should have failed", i)
		assert.ErrorIs(t, err, expectedErr, "goroutine %d should have received expected error", i)
	}

	assert.Equal(t, 0, cache.InFlightLen(), "inFlight should be empty")
	assert.Equal(t, 0, cache.Len(), "cache should be empty")

	// Subsequent call can retry and succeed
	cache.SetInFlightWaitHook(nil)
	cache.SetClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
		return &kubernetes.Clientset{}, nil
	})

	cs, err := cache.GetClientSet("cluster-err", ctx, "token-fail")
	assert.NoError(t, err)
	assert.NotNil(t, cs)
}

// 3. Instance isolation: multiple cache instances never share state.
func TestClientsetCache_InstanceIsolation(t *testing.T) {
	cacheA := k8cache.NewClientsetCache()
	cacheB := k8cache.NewClientsetCache()

	ctx := makeTestContext("cluster-iso")

	cacheA.SetClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
		return &kubernetes.Clientset{}, nil
	})
	cacheB.SetClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
		return &kubernetes.Clientset{}, nil
	})

	// Populate cacheA
	csA, err := cacheA.GetClientSet("cluster-iso", ctx, "token-iso")
	require.NoError(t, err)
	assert.NotNil(t, csA)

	assert.Equal(t, 1, cacheA.Len())
	assert.Equal(t, 0, cacheB.Len(), "cacheB must not observe cacheA's cached state")

	// Block prefix on cacheA
	cacheA.EvictClientsetsForCluster("cluster-iso")
	assert.True(t, cacheA.IsPrefixBlocked("cluster-iso"))
	assert.False(t, cacheB.IsPrefixBlocked("cluster-iso"), "cacheB must not observe cacheA's blocked prefix")

	// Populate cacheB with the same key
	csB, err := cacheB.GetClientSet("cluster-iso", ctx, "token-iso")
	require.NoError(t, err)
	assert.NotNil(t, csB)
	assert.NotSame(t, csA, csB, "cacheA and cacheB must not share clientset instances")

	assert.Equal(t, 0, cacheA.Len(), "cacheA must remain 0 because cluster-iso is blocked")
	assert.Equal(t, 1, cacheB.Len(), "cacheB must have 1 entry")
}

// 4. Context removal: eviction, prefix blocking, reactivation, and stateless isolation.
func TestClientsetCache_ContextRemoval(t *testing.T) {
	cache := k8cache.NewClientsetCache(
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		}),
	)

	const (
		cluster1User1 = "cluster1\x00user1"
		cluster1User2 = "cluster1\x00user2"
	)

	ctx1 := makeTestContext(cluster1User1)
	ctx2 := makeTestContext(cluster1User2)

	// Create clientsets for two stateless users on cluster1
	cs1, err := cache.GetClientSet(cluster1User1, ctx1, "tok-1")
	require.NoError(t, err)
	assert.NotNil(t, cs1)

	cs2, err := cache.GetClientSet(cluster1User2, ctx2, "tok-2")
	require.NoError(t, err)
	assert.NotNil(t, cs2)

	assert.Equal(t, 2, cache.Len())

	// Evict user1
	cache.EvictClientsetsForCluster(cluster1User1)

	// User1 is evicted and blocked
	assert.Equal(t, 1, cache.Len(), "user2's clientset must remain")
	assert.True(t, cache.IsPrefixBlocked(cluster1User1))
	assert.False(t, cache.IsPrefixBlocked(cluster1User2))

	// Creating again for user1 returns a clientset, but does NOT cache it because user1 is blocked
	cs1New, err := cache.GetClientSet(cluster1User1, ctx1, "tok-1")
	require.NoError(t, err)
	assert.NotNil(t, cs1New)
	assert.Equal(t, 1, cache.Len(), "blocked user1 clientset must not be cached")

	// Reactivate user1
	cache.ClearBlockedClientsetPrefixesForActiveContexts([]string{cluster1User1})
	assert.False(t, cache.IsPrefixBlocked(cluster1User1), "block must be cleared")

	// Creating after unblock caches it
	cs1Reactivated, err := cache.GetClientSet(cluster1User1, ctx1, "tok-1")
	require.NoError(t, err)
	assert.NotNil(t, cs1Reactivated)
	assert.Equal(t, 2, cache.Len(), "user1 should now be cached again")
}

// 5. Removal during in-flight creation: waiters get clientset, but not cached, prefix blocked.
func TestClientsetCache_RemovalDuringInFlightCreation(t *testing.T) {
	creationStarted := make(chan struct{})
	allowCompletion := make(chan struct{})

	cache := k8cache.NewClientsetCache(
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			close(creationStarted)
			<-allowCompletion

			return &kubernetes.Clientset{}, nil
		}),
	)

	ctx := makeTestContext("cluster-inflight-rem")

	var (
		wg     sync.WaitGroup
		cs     *kubernetes.Clientset
		getErr error
	)

	wg.Add(1)
	go func() {
		defer wg.Done()

		cs, getErr = cache.GetClientSet("cluster-inflight-rem", ctx, "token-x")
	}()

	// Wait until creation starts
	<-creationStarted

	// Remove context while creation is in-flight
	cache.EvictClientsetsForCluster("cluster-inflight-rem")
	assert.True(t, cache.IsPrefixBlocked("cluster-inflight-rem"))

	// Now allow creation to complete
	close(allowCompletion)
	wg.Wait()

	// Waiter receives the clientset without error
	assert.NoError(t, getErr)
	assert.NotNil(t, cs)

	// But it must NOT be cached
	assert.Equal(t, 0, cache.Len(), "completed clientset must not be inserted into cache for removed context")
	assert.True(t, cache.IsPrefixBlocked("cluster-inflight-rem"), "prefix must remain blocked")
}

// 6. TTL: active, expired, mixed, and boundary behavior.
func TestClientsetCache_TTL(t *testing.T) {
	cache := k8cache.NewClientsetCache(
		k8cache.WithTTL(10 * time.Minute),
	)

	now := time.Now()

	// 1 active (used 2 min ago)
	cache.SeedClientset("active", now.Add(-2*time.Minute))
	// 1 expired (used 15 min ago)
	cache.SeedClientset("expired", now.Add(-15*time.Minute))
	// 1 at boundary (used 10m - 5s ago => active)
	cache.SeedClientset("at-boundary", now.Add(-10*time.Minute+5*time.Second))
	// 1 past boundary (used 10m + 5s ago => expired)
	cache.SeedClientset("past-boundary", now.Add(-10*time.Minute-5*time.Second))

	assert.Equal(t, 4, cache.Len())

	evicted := cache.EvictExpired(now)
	assert.Equal(t, 2, evicted, "expected 2 expired clientsets evicted")
	assert.Equal(t, 2, cache.Len(), "expected 2 active clientsets remaining")
}

// 7. Janitor lifecycle: cancellable context and clean shutdown without leaked goroutines.
func TestClientsetCache_JanitorLifecycle(t *testing.T) {
	t.Run("cancellation stops janitor without goroutine leak", func(t *testing.T) {
		cache := k8cache.NewClientsetCache(
			k8cache.WithJanitorInterval(10 * time.Millisecond),
		)

		ctx, cancel := context.WithCancel(context.Background())
		cache.Start(ctx)

		// Cancel context
		cancel()

		// Stop should return immediately because janitor exits on ctx.Done()
		stopped := make(chan struct{})

		go func() {
			cache.Stop()
			close(stopped)
		}()

		select {
		case <-stopped:
			// Success
		case <-time.After(2 * time.Second):
			t.Fatal("janitor failed to stop after context cancellation")
		}
	})

	t.Run("Stop stops janitor cleanly", func(t *testing.T) {
		cache := k8cache.NewClientsetCache(
			k8cache.WithJanitorInterval(10 * time.Millisecond),
		)

		cache.Start(context.Background())

		stopped := make(chan struct{})

		go func() {
			cache.Stop()
			close(stopped)
		}()

		select {
		case <-stopped:
			// Success
		case <-time.After(2 * time.Second):
			t.Fatal("janitor Stop timed out")
		}
	})
}

// 8. Atomic cache lookup and in-flight registration prevents duplicate creation.
func TestClientsetCache_AtomicCacheLookupAndInFlightRegistration(t *testing.T) {
	var createCount atomic.Int32

	cache := k8cache.NewClientsetCache(
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			createCount.Add(1)
			time.Sleep(10 * time.Millisecond)

			return &kubernetes.Clientset{}, nil
		}),
	)

	ctx := makeTestContext("cluster-atomic")

	const totalCallers = 20

	var wg sync.WaitGroup

	wg.Add(totalCallers)

	for i := 0; i < totalCallers; i++ {
		go func() {
			defer wg.Done()

			cs, err := cache.GetClientSet("cluster-atomic", ctx, "token-atomic")
			assert.NoError(t, err)
			assert.NotNil(t, cs)
		}()
	}

	wg.Wait()

	assert.Equal(t, int32(1), createCount.Load(), "exactly one clientset should have been created across all callers")
}

// 9. Completion boundary / second wave: arrival during creator completion does not duplicate creation.
//
//nolint:funlen // Multi-wave concurrent test covering completion boundary race.
func TestClientsetCache_CompletionBoundarySecondWave(t *testing.T) {
	var createCount atomic.Int32

	creatorUnblock := make(chan struct{})

	cache := k8cache.NewClientsetCache(
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			createCount.Add(1)
			<-creatorUnblock

			return &kubernetes.Clientset{}, nil
		}),
	)

	ctx := makeTestContext("cluster-wave")

	wave1Started := make(chan struct{})
	wave1Done := make(chan struct{})

	var (
		wave1CS  *kubernetes.Clientset
		wave1Err error
	)

	go func() {
		close(wave1Started)

		wave1CS, wave1Err = cache.GetClientSet("cluster-wave", ctx, "tok-wave")

		close(wave1Done)
	}()

	<-wave1Started
	require.Eventually(t, func() bool {
		return cache.InFlightLen() == 1
	}, 1*time.Second, 5*time.Millisecond)

	const wave2Count = 10

	var wg sync.WaitGroup

	wg.Add(wave2Count)

	wave2CS := make([]*kubernetes.Clientset, wave2Count)
	wave2Errs := make([]error, wave2Count)

	for i := 0; i < wave2Count; i++ {
		go func(idx int) {
			defer wg.Done()

			wave2CS[idx], wave2Errs[idx] = cache.GetClientSet("cluster-wave", ctx, "tok-wave")
		}(i)
	}

	close(creatorUnblock)
	wg.Wait()
	<-wave1Done

	require.NoError(t, wave1Err)
	assert.NotNil(t, wave1CS)
	assert.Equal(t, int32(1), createCount.Load(), "creator should only run once across both waves")

	for i := 0; i < wave2Count; i++ {
		assert.NoError(t, wave2Errs[i])
		assert.Same(t, wave1CS, wave2CS[i], "wave 2 callers must receive the exact same cached clientset")
	}
}

// 10. Repeated concurrent waves: verify consistent cleanup and single creation.
func TestClientsetCache_RepeatedConcurrentWaves(t *testing.T) {
	var createCount atomic.Int32

	cache := k8cache.NewClientsetCache(
		k8cache.WithClientsetCreator(func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			createCount.Add(1)

			return &kubernetes.Clientset{}, nil
		}),
	)

	ctx := makeTestContext("cluster-repeated")

	const (
		waves   = 5
		perWave = 10
	)

	for w := 0; w < waves; w++ {
		var wg sync.WaitGroup

		wg.Add(perWave)

		for i := 0; i < perWave; i++ {
			go func() {
				defer wg.Done()

				cs, err := cache.GetClientSet("cluster-repeated", ctx, "tok-repeated")
				assert.NoError(t, err)
				assert.NotNil(t, cs)
			}()
		}

		wg.Wait()
	}

	assert.Equal(t, int32(1), createCount.Load(), "creator must run exactly once across all repeated waves")
	assert.Equal(t, 0, cache.InFlightLen())
	assert.Equal(t, 1, cache.Len())
}
