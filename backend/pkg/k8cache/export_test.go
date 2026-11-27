/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package k8cache

import (
	"container/list"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
)

// ResetClientsetCache clears the clientset cache for test isolation.
func ResetClientsetCache() {
	mu.Lock()
	defer mu.Unlock()

	clientsetCache = make(map[string]*list.Element)
	clientsetLRUList = list.New()
	blockedClientsetPrefixes = make(map[string]blockedPrefixEntry)
	maxClientsets = defaultMaxClientsets
	maxClientsetsExplicit = false
}

// SeedClientsetCache populates the clientset cache with dummy entries for testing.
func SeedClientsetCache(key string, lastUsed time.Time) {
	mu.Lock()
	defer mu.Unlock()

	if oldElem, exists := clientsetCache[key]; exists {
		clientsetLRUList.Remove(oldElem)
	}

	cachedCS := &CachedClientSet{
		clientset: &kubernetes.Clientset{},
		lastUsed:  lastUsed,
	}
	entry := &lruEntry{
		key: key,
		cs:  cachedCS,
	}
	elem := clientsetLRUList.PushFront(entry)
	clientsetCache[key] = elem
}

// ManualEvictExpiredClientsets triggers the eviction logic immediately for testing.
func ManualEvictExpiredClientsets() {
	evictExpiredClientsets()
}

// SeedBlockedClientsetPrefix marks a prefix as blocked at the given time for testing.
func SeedBlockedClientsetPrefix(prefix string, blockedAt time.Time) {
	mu.Lock()
	defer mu.Unlock()

	blockedClientsetPrefixes[prefix] = blockedPrefixEntry{blockedAt: blockedAt}
}

// ClientsetCacheLen returns the current number of entries in the
// clientset cache. It is intended for use in tests.
func ClientsetCacheLen() int {
	mu.Lock()
	defer mu.Unlock()

	return len(clientsetCache)
}

// ClientsetLRULen returns the number of entries in the clientset LRU list,
// which should match ClientsetCacheLen. It is intended for use in tests.
func ClientsetLRULen() int {
	mu.Lock()
	defer mu.Unlock()

	return clientsetLRUList.Len()
}

// ResetInFlight clears the inFlight map for test isolation.
func ResetInFlight() {
	mu.Lock()
	defer mu.Unlock()

	inFlight = make(map[string]*inFlightEntry)
}

// SeedInFlightClientsetKey registers an in-flight clientset creation for testing.
func SeedInFlightClientsetKey(cacheKey string) {
	mu.Lock()
	defer mu.Unlock()

	inFlight[cacheKey] = &inFlightEntry{
		waitCh: make(chan struct{}),
	}
}

// SetClientsetCreator sets a custom clientset creator function for testing.
// It returns a function to restore the original creator.
func SetClientsetCreator(fn func(*kubeconfig.Context, string) (*kubernetes.Clientset, error)) func() {
	hookMu.Lock()
	original := clientsetCreator
	clientsetCreator = fn
	hookMu.Unlock()

	return func() {
		hookMu.Lock()
		clientsetCreator = original
		hookMu.Unlock()
	}
}

// SetTestingInFlightWait sets a custom wait hook for testing.
// It returns a function to restore the original hook.
func SetTestingInFlightWait(fn func()) func() {
	hookMu.Lock()
	original := testingInFlightWait
	testingInFlightWait = fn
	hookMu.Unlock()

	return func() {
		hookMu.Lock()
		testingInFlightWait = original
		hookMu.Unlock()
	}
}

// ExportedRedactContextKey exposes redactContextKey for testing.
func ExportedRedactContextKey(key string) string {
	return redactContextKey(key)
}

// ExportedRedactCacheKey exposes redactCacheKey for testing.
func ExportedRedactCacheKey(key string) string {
	return redactCacheKey(key)
}

// ExportedEncodeResponse exposes encodeResponse for testing.
func ExportedEncodeResponse(r *ResponseCapture) (string, error) {
	return encodeResponse(r, 0)
}

// ExportedInvalidateCacheKeysForResourceEvent exposes invalidateCacheKeysForResourceEvent for testing.
func ExportedInvalidateCacheKeysForResourceEvent(
	gvr schema.GroupVersionResource,
	namespace, name, contextKey string,
	k8scache cache.Cache[string],
) {
	invalidateCacheKeysForResourceEvent(gvr, namespace, name, contextKey, k8scache)
}

// ExportedCacheKeyBelongsToContext exposes cacheKeyBelongsToContext for testing.
func ExportedCacheKeyBelongsToContext(key, contextKey string) bool {
	return cacheKeyBelongsToContext(key, contextKey)
}

// ExportedClientsetPrefixBlocked reports whether clientset caching is blocked for a prefix.
func ExportedClientsetPrefixBlocked(prefix string) bool {
	mu.Lock()
	defer mu.Unlock()

	_, blocked := blockedClientsetPrefixes[prefix]

	return blocked
}

// SetMaxClientsetsForTesting sets maxClientsets and returns a restore function.
func SetMaxClientsetsForTesting(limit int) func() {
	mu.Lock()
	old := maxClientsets
	oldExplicit := maxClientsetsExplicit
	maxClientsets = limit
	maxClientsetsExplicit = true
	mu.Unlock()

	return func() {
		mu.Lock()
		maxClientsets = old
		maxClientsetsExplicit = oldExplicit
		mu.Unlock()
	}
}

// HasCachedClientset reports whether a key is currently in clientsetCache.
func HasCachedClientset(headlampContextKey, token string) bool {
	mu.Lock()
	defer mu.Unlock()

	exactKey := headlampContextKey + "\x00" + token
	if _, found := clientsetCache[exactKey]; found {
		return true
	}

	prefix := headlampContextKey + "\x00"
	suffix := "\x00" + token

	for key := range clientsetCache {
		if strings.HasPrefix(key, prefix) && strings.HasSuffix(key, suffix) {
			return true
		}
	}

	return false
}

// ExportedEvictClientsetIfMatch exposes evictClientsetIfMatch for testing.
func ExportedEvictClientsetIfMatch(headlampContextKey, token string, cs *kubernetes.Clientset) {
	evictClientsetIfMatch(headlampContextKey, token, cs)
}

// SeedClientsetCacheWithClientset populates the cache with a specific clientset for testing.
func SeedClientsetCacheWithClientset(key string, cs *kubernetes.Clientset, lastUsed time.Time) {
	mu.Lock()
	defer mu.Unlock()

	if oldElem, exists := clientsetCache[key]; exists {
		clientsetLRUList.Remove(oldElem)
	}

	cachedCS := &CachedClientSet{
		clientset: cs,
		lastUsed:  lastUsed,
	}
	entry := &lruEntry{
		key: key,
		cs:  cachedCS,
	}
	elem := clientsetLRUList.PushFront(entry)
	clientsetCache[key] = elem
}

// GetCachedClientsetForTesting returns the clientset pointer stored in clientsetCache, or nil.
func GetCachedClientsetForTesting(headlampContextKey, token string) *kubernetes.Clientset {
	mu.Lock()
	defer mu.Unlock()

	exactKey := headlampContextKey + "\x00" + token
	if elem, found := clientsetCache[exactKey]; found {
		return elem.Value.(*lruEntry).cs.clientset
	}

	prefix := headlampContextKey + "\x00"
	suffix := "\x00" + token

	for key, elem := range clientsetCache {
		if strings.HasPrefix(key, prefix) && strings.HasSuffix(key, suffix) {
			return elem.Value.(*lruEntry).cs.clientset
		}
	}

	return nil
}

// SetTestingBeforeFinishInFlight sets a hook called before finishInFlightClientset and returns a restore function.
func SetTestingBeforeFinishInFlight(fn func(cacheKey string)) func() {
	hookMu.Lock()
	original := testingBeforeFinishInFlight
	testingBeforeFinishInFlight = fn
	hookMu.Unlock()

	return func() {
		hookMu.Lock()
		testingBeforeFinishInFlight = original
		hookMu.Unlock()
	}
}

// FinishInFlightClientsetForTesting completes an in-flight entry registered via SeedInFlightClientsetKey.
func FinishInFlightClientsetForTesting(cacheKey string, cs *kubernetes.Clientset, err error) {
	mu.Lock()
	entry, ok := inFlight[cacheKey]
	mu.Unlock()

	if ok {
		finishInFlightClientset(cacheKey, entry, cs, err)
	}
}
