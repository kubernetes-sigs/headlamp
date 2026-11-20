package k8cache

import (
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

	clientsetCache = make(map[string]*CachedClientSet)
	blockedClientsetPrefixes = make(map[string]blockedPrefixEntry)
}

// SeedClientsetCache populates the clientset cache with dummy entries for testing.
func SeedClientsetCache(key string, lastUsed time.Time) {
	mu.Lock()
	defer mu.Unlock()

	clientsetCache[key] = &CachedClientSet{
		clientset: &kubernetes.Clientset{},
		lastUsed:  lastUsed,
	}
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
