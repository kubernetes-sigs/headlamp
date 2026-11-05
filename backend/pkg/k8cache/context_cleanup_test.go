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
	"net/url"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testResponseKey(t *testing.T, contextKey, path string) string {
	t.Helper()

	u, err := url.Parse(path)
	require.NoError(t, err)

	key, err := k8cache.GenerateKey(u, contextKey)
	require.NoError(t, err)

	return key
}

func TestCacheKeyBelongsToContext(t *testing.T) {
	t.Parallel()

	tests := []struct {
		key        string
		contextKey string
		want       bool
	}{
		{testResponseKey(t, "minikube", "/api/v1/namespaces/default/pods"), "minikube", true},
		{testResponseKey(t, "prod+cluster", "/api/v1/namespaces/default/pods"), "prod+cluster", true},
		{testResponseKey(t, "prod%2Bcluster", "/api/v1/namespaces/default/pods"), "prod%2Bcluster", true},
		{testResponseKey(t, "prod+cluster", "/api/v1/namespaces/default/pods"), "prod%2Bcluster", false},
		{testResponseKey(t, "minikube", "/apis/apps/v1/namespaces/default/deployments"), "minikube", true},
		{testResponseKey(t, "other", "/api/v1/namespaces/default/pods"), "minikube", false},
		{"malformed", "minikube", false},
		{testResponseKey(t, "minikube", "/api/v1/namespaces/default/pods"), "", false},
	}

	for _, tt := range tests {
		assert.Equal(t, tt.want, k8cache.ExportedCacheKeyBelongsToContext(tt.key, tt.contextKey))
	}
}

func TestPurgeCacheForContext(t *testing.T) {
	t.Parallel()

	k8scache := cache.New[string]()
	ctx := context.Background()

	podsKey := testResponseKey(t, "minikube", "/api/v1/namespaces/default/pods")
	require.NoError(t, k8scache.Set(ctx, podsKey, "pods-data"))
	deployKey := testResponseKey(t, "minikube", "/apis/apps/v1/namespaces/default/deployments")
	require.NoError(t, k8scache.Set(ctx, deployKey, "deploy-data"))
	otherKey := testResponseKey(t, "other-cluster", "/api/v1/namespaces/default/pods")
	require.NoError(t, k8scache.Set(ctx, otherKey, "other-data"))

	k8cache.PurgeCacheForContext(k8scache, "minikube")

	_, err := k8scache.Get(ctx, podsKey)
	assert.Error(t, err)

	_, err = k8scache.Get(ctx, deployKey)
	assert.Error(t, err)

	val, err := k8scache.Get(ctx, otherKey)
	assert.NoError(t, err)
	assert.Equal(t, "other-data", val)
}

func TestPurgeCacheForContext_EscapedContextKey(t *testing.T) {
	t.Parallel()

	const contextKey = "prod+cluster"

	const podsPath = "/clusters/kind/api/v1/namespaces/default/pods"

	podsKey := testResponseKey(t, contextKey, podsPath)
	otherKey := testResponseKey(t, "other-cluster", podsPath)

	k8scache := cache.New[string]()
	ctx := context.Background()

	require.NoError(t, k8scache.Set(ctx, podsKey, "pods-data"))
	require.NoError(t, k8scache.Set(ctx, otherKey, "other-data"))

	k8cache.PurgeCacheForContext(k8scache, contextKey)

	_, err := k8scache.Get(ctx, podsKey)
	assert.Error(t, err)

	val, err := k8scache.Get(ctx, otherKey)
	assert.NoError(t, err)
	assert.Equal(t, "other-data", val)
}

func TestSyncWatchersDoesNotPurgeActiveContextWithPlusInName(t *testing.T) {
	const (
		activeContextKey  = "prod+cluster\x00user1"
		removedContextKey = "removed-cluster\x00user2"
	)

	const podsPath = "/clusters/kind/api/v1/namespaces/default/pods"

	activeCacheDataKey := testResponseKey(t, activeContextKey, podsPath)
	removedCacheDataKey := testResponseKey(t, removedContextKey, podsPath)

	k8cache.ResetForTesting()
	t.Cleanup(k8cache.ResetForTesting)

	k8scache := cache.New[string]()
	ctx := context.Background()

	require.NoError(t, k8scache.Set(ctx, activeCacheDataKey, "active-data"))
	require.NoError(t, k8scache.Set(ctx, removedCacheDataKey, "stale-data"))
	k8cache.SeedClientsetCache(removedContextKey+"\x00token", time.Now())

	k8cache.SyncWatchers(k8scache, []string{activeContextKey})

	val, err := k8scache.Get(ctx, activeCacheDataKey)
	assert.NoError(t, err)
	assert.Equal(t, "active-data", val)

	_, err = k8scache.Get(ctx, removedCacheDataKey)
	assert.Error(t, err)
}

func TestEvictClientsetsForCluster(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	k8cache.SeedClientsetCache("minikube\x00token-a", time.Now())
	k8cache.SeedClientsetCache("minikube\x00token-b", time.Now())
	k8cache.SeedClientsetCache("other\x00token-c", time.Now())

	assert.Equal(t, 3, k8cache.ClientsetCacheLen())

	k8cache.EvictClientsetsForCluster("minikube")

	assert.Equal(t, 1, k8cache.ClientsetCacheLen())
}

func TestEvictClientsetsForCluster_StatelessScope(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	const (
		removedUser = "minikube\x00user1"
		activeUser  = "minikube\x00user2"
	)

	k8cache.SeedClientsetCache(removedUser+"\x00token-a", time.Now())
	k8cache.SeedClientsetCache(activeUser+"\x00token-b", time.Now())

	assert.Equal(t, 2, k8cache.ClientsetCacheLen())

	k8cache.EvictClientsetsForCluster(removedUser)

	assert.Equal(t, 1, k8cache.ClientsetCacheLen())
}

func TestEvictClientsetsForCluster_KeepsPrefixBlocked(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	const removedContext = "minikube\x00user1"

	k8cache.EvictClientsetsForCluster(removedContext)

	assert.True(t, k8cache.ExportedClientsetPrefixBlocked(removedContext))
}

func TestEvictClientsetsForCluster_PrunesBlockedPrefixWithoutGetClientSet(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	const removedContext = "minikube\x00user1"

	k8cache.EvictClientsetsForCluster(removedContext)
	k8cache.SeedBlockedClientsetPrefix(removedContext, time.Now().Add(-11*time.Minute))

	k8cache.ManualEvictExpiredClientsets()

	assert.False(t, k8cache.ExportedClientsetPrefixBlocked(removedContext))
}

func TestSyncWatchersPurgesCacheWithoutWatcher(t *testing.T) {
	const (
		removedContextKey = "removed-cluster\x00user1"
		activeContextKey  = "active-cluster\x00user2"
	)

	removedCacheDataKey := testResponseKey(t, removedContextKey, "/api/v1/namespaces/default/pods")

	k8cache.ResetForTesting()
	t.Cleanup(k8cache.ResetForTesting)

	k8scache := cache.New[string]()
	ctx := context.Background()

	require.NoError(t, k8scache.Set(ctx, removedCacheDataKey, "stale-data"))
	k8cache.SeedClientsetCache(removedContextKey+"\x00token", time.Now())

	k8cache.SyncWatchers(k8scache, []string{activeContextKey})

	_, err := k8scache.Get(ctx, removedCacheDataKey)
	assert.Error(t, err)
	assert.Equal(t, 0, k8cache.ClientsetCacheLen())
}

func TestSyncWatchersPurgesContextWithOnlyInFlightClientset(t *testing.T) {
	const (
		removedContextKey = "removed-cluster\x00user1"
		activeContextKey  = "active-cluster\x00user2"
	)

	k8cache.ResetForTesting()
	t.Cleanup(k8cache.ResetForTesting)

	k8cache.SeedInFlightClientsetKey(removedContextKey + "\x00token")
	assert.Equal(t, 0, k8cache.ClientsetCacheLen())

	k8cache.SyncWatchers(nil, []string{activeContextKey})

	assert.True(t, k8cache.ExportedClientsetPrefixBlocked(removedContextKey))
}

func TestPruneBlockedClientsetPrefixes(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	const removedContext = "minikube\x00user1"

	k8cache.SeedBlockedClientsetPrefix(removedContext, time.Now().Add(-11*time.Minute))
	assert.True(t, k8cache.ExportedClientsetPrefixBlocked(removedContext))

	k8cache.ManualEvictExpiredClientsets()

	assert.False(t, k8cache.ExportedClientsetPrefixBlocked(removedContext))
}
