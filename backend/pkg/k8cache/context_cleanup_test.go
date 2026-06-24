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
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCacheKeyBelongsToContext(t *testing.T) {
	t.Parallel()

	tests := []struct {
		key        string
		contextKey string
		want       bool
	}{
		{"+pods+default+minikube", "minikube", true},
		{"apps+deployments+default+minikube", "minikube", true},
		{"+pods+default+other", "minikube", false},
		{"malformed", "minikube", false},
		{"+pods+default+minikube", "", false},
	}

	for _, tt := range tests {
		assert.Equal(t, tt.want, k8cache.ExportedCacheKeyBelongsToContext(tt.key, tt.contextKey))
	}
}

func TestPurgeCacheForContext(t *testing.T) {
	t.Parallel()

	k8scache := cache.New[string]()
	ctx := context.Background()

	require.NoError(t, k8scache.Set(ctx, "+pods+default+minikube", "pods-data"))
	require.NoError(t, k8scache.Set(ctx, "apps+deployments+default+minikube", "deploy-data"))
	require.NoError(t, k8scache.Set(ctx, "+pods+default+other-cluster", "other-data"))

	k8cache.PurgeCacheForContext(k8scache, "minikube")

	_, err := k8scache.Get(ctx, "+pods+default+minikube")
	assert.Error(t, err)

	_, err = k8scache.Get(ctx, "apps+deployments+default+minikube")
	assert.Error(t, err)

	val, err := k8scache.Get(ctx, "+pods+default+other-cluster")
	assert.NoError(t, err)
	assert.Equal(t, "other-data", val)
}

func TestEvictClientsetsForCluster(t *testing.T) {
	t.Parallel()

	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	k8cache.SeedClientsetCache("minikube\x00token-a", time.Now())
	k8cache.SeedClientsetCache("minikube\x00token-b", time.Now())
	k8cache.SeedClientsetCache("other\x00token-c", time.Now())

	assert.Equal(t, 3, k8cache.ClientsetCacheLen())

	k8cache.EvictClientsetsForCluster("minikube")

	assert.Equal(t, 1, k8cache.ClientsetCacheLen())
}

func TestSyncWatchersPurgesCacheAndClientsetsForRemovedContext(t *testing.T) {
	const (
		clusterName         = "removed-cluster"
		removedContextKey   = clusterName + "\x00user1"
		activeContextKey    = "active-cluster\x00user2"
		removedCacheDataKey = "+pods+default+" + removedContextKey
	)

	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	k8scache := cache.New[string]()
	ctx := context.Background()

	require.NoError(t, k8scache.Set(ctx, removedCacheDataKey, "stale-data"))
	k8cache.SeedClientsetCache(clusterName+"\x00token", time.Now())

	canceled := make(map[string]bool)

	var mu sync.Mutex

	_, cancel := context.WithCancel(context.Background())
	wrappedCancel := func() {
		mu.Lock()
		canceled[removedContextKey] = true
		mu.Unlock()
		cancel()
	}

	k8cache.StoreTestContextCancel(removedContextKey, wrappedCancel)
	k8cache.StoreTestRegistry(activeContextKey, func() {})

	k8cache.SyncWatchers(k8scache, []string{activeContextKey})

	mu.Lock()
	assert.True(t, canceled[removedContextKey])
	mu.Unlock()

	_, err := k8scache.Get(ctx, removedCacheDataKey)
	assert.Error(t, err)
	assert.Equal(t, 0, k8cache.ClientsetCacheLen())
}
