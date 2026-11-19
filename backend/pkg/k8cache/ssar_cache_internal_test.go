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

package k8cache

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
)

func resetSSARCache() {
	ssarMu.Lock()
	ssarCache = make(map[string]*ssarCacheEntry)
	ssarMu.Unlock()
}

var buildSSARCacheKeyTests = []struct {
	name        string
	contextKey  string
	token       string
	attrs       *authorizationv1.ResourceAttributes
	expectedKey string
}{
	{
		name:       "core resource list",
		contextKey: "kind-cluster",
		token:      "tok-abc",
		attrs: &authorizationv1.ResourceAttributes{
			Group: "", Resource: "pods", Verb: "list", Namespace: "default",
		},
		expectedKey: "kind-cluster\x00tok-abc\x00/pods//list/default/",
	},
	{
		name:       "named API resource get",
		contextKey: "prod-cluster",
		token:      "tok-xyz",
		attrs: &authorizationv1.ResourceAttributes{
			Group: "apps", Resource: "deployments", Verb: "get", Namespace: "kube-system", Name: "frontend",
		},
		expectedKey: "prod-cluster\x00tok-xyz\x00apps/deployments//get/kube-system/frontend",
	},
	{
		name:       "cluster-scoped resource",
		contextKey: "dev",
		token:      "t1",
		attrs: &authorizationv1.ResourceAttributes{
			Group: "", Resource: "namespaces", Verb: "list", Namespace: "",
		},
		expectedKey: "dev\x00t1\x00/namespaces//list//",
	},
	{
		name:       "subresource produces distinct key",
		contextKey: "dev",
		token:      "t1",
		attrs: &authorizationv1.ResourceAttributes{
			Resource: "pods", Subresource: "log", Verb: "get", Namespace: "default", Name: "nginx",
		},
		expectedKey: "dev\x00t1\x00/pods/log/get/default/nginx",
	},
}

func TestBuildSSARCacheKey(t *testing.T) {
	for _, tc := range buildSSARCacheKeyTests {
		t.Run(tc.name, func(t *testing.T) {
			key := buildSSARCacheKey(tc.contextKey, tc.token, tc.attrs)
			assert.Equal(t, tc.expectedKey, key)
		})
	}
}

func TestSSARCacheStoreAndRetrieve(t *testing.T) {
	resetSSARCache()

	key := "ctx\x00token\x00/pods/list/default"

	// Initially not found.
	_, found := getSSARCacheResult(key)
	assert.False(t, found)

	// Store allowed=true.
	storeSSARCacheResult(key, true)

	allowed, found := getSSARCacheResult(key)
	require.True(t, found)
	assert.True(t, allowed)

	// Store allowed=false for a different key.
	key2 := "ctx\x00token\x00apps/deployments/get/kube-system"
	storeSSARCacheResult(key2, false)

	allowed2, found2 := getSSARCacheResult(key2)
	require.True(t, found2)
	assert.False(t, allowed2)

	// Original key is still allowed.
	allowed, found = getSSARCacheResult(key)
	require.True(t, found)
	assert.True(t, allowed)
}

func TestSSARCacheExpiry(t *testing.T) {
	resetSSARCache()

	key := "ctx\x00token\x00/pods/list/default"

	// Store with a very short expiry by directly manipulating the entry.
	ssarMu.Lock()
	ssarCache[key] = &ssarCacheEntry{
		allowed:   true,
		expiresAt: time.Now().Add(-1 * time.Second), // already expired
	}
	ssarMu.Unlock()

	_, found := getSSARCacheResult(key)
	assert.False(t, found, "expired entry should not be returned")
}

func TestSSARCacheEvictionForPrefix(t *testing.T) {
	resetSSARCache()

	// Store entries for two different clusters.
	storeSSARCacheResult("cluster-a\x00tok\x00/pods/list/default", true)
	storeSSARCacheResult("cluster-a\x00tok\x00apps/deployments/get/ns", false)
	storeSSARCacheResult("cluster-b\x00tok\x00/pods/list/default", true)

	// Evict cluster-a.
	evictSSARCacheForPrefix("cluster-a")

	ssarMu.RLock()
	assert.Equal(t, 1, len(ssarCache), "only cluster-b entry should remain")
	ssarMu.RUnlock()

	// cluster-b entry still valid.
	allowed, found := getSSARCacheResult("cluster-b\x00tok\x00/pods/list/default")
	require.True(t, found)
	assert.True(t, allowed)
}

func TestSSARCacheJanitorSweep(t *testing.T) {
	resetSSARCache()

	now := time.Now()

	// One expired, one still valid.
	ssarMu.Lock()
	ssarCache["expired\x00tok\x00/pods/list/"] = &ssarCacheEntry{
		allowed:   true,
		expiresAt: now.Add(-10 * time.Second),
	}
	ssarCache["valid\x00tok\x00/pods/list/"] = &ssarCacheEntry{
		allowed:   true,
		expiresAt: now.Add(30 * time.Second),
	}
	ssarMu.Unlock()

	evictExpiredSSARResults(now)

	ssarMu.RLock()
	assert.Equal(t, 1, len(ssarCache))
	_, exists := ssarCache["valid\x00tok\x00/pods/list/"]
	assert.True(t, exists)
	ssarMu.RUnlock()
}

func TestSSARCacheDifferentTokensSameResource(t *testing.T) {
	resetSSARCache()

	attrs := &authorizationv1.ResourceAttributes{
		Resource: "pods", Verb: "list", Namespace: "default",
	}

	key1 := buildSSARCacheKey("ctx", "user-token-1", attrs)
	key2 := buildSSARCacheKey("ctx", "user-token-2", attrs)

	assert.NotEqual(t, key1, key2, "different tokens must produce different cache keys")

	storeSSARCacheResult(key1, true)
	storeSSARCacheResult(key2, false)

	allowed1, found1 := getSSARCacheResult(key1)
	require.True(t, found1)
	assert.True(t, allowed1)

	allowed2, found2 := getSSARCacheResult(key2)
	require.True(t, found2)
	assert.False(t, allowed2)
}

func TestIsSSARCacheable(t *testing.T) {
	tests := []struct {
		verb     string
		expected bool
	}{
		{"get", true},
		{"list", true},
		{"watch", true},
		{"unknown", false},
		{"create", false},
		{"update", false},
		{"delete", false},
		{"patch", false},
		{"", false},
	}

	for _, tc := range tests {
		t.Run(tc.verb, func(t *testing.T) {
			assert.Equal(t, tc.expected, isSSARCacheable(tc.verb))
		})
	}
}
