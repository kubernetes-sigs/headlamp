package k8cache

import (
	"context"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
)

// ExportedRunWatcher exposes runWatcher for testing.
func ExportedRunWatcher(
	ctx context.Context,
	k8scache cache.Cache[string],
	contextKey string,
	kContext kubeconfig.Context,
) {
	val, _ := watcherRegistry.LoadOrStore(contextKey, &watcherState{})
	state := val.(*watcherState)
	runWatcher(ctx, k8scache, contextKey, kContext, state)
}

// ResetRegistries clears both registries for test isolation.
// If no keys are provided, it clears all entries.
func ResetRegistries(keys ...string) {
	if len(keys) == 0 {
		watcherRegistry.Range(func(key, val interface{}) bool {
			if state, ok := val.(*watcherState); ok {
				state.mu.Lock()
				if state.cancel != nil {
					state.cancel()
				}
				state.mu.Unlock()
			}

			watcherRegistry.Delete(key)

			return true
		})

		return
	}

	for _, k := range keys {
		if val, loaded := watcherRegistry.LoadAndDelete(k); loaded {
			if state, ok := val.(*watcherState); ok {
				state.mu.Lock()
				if state.cancel != nil {
					state.cancel()
				}
				state.mu.Unlock()
			}
		}
	}
}

// StoreTestRegistry populates registries for test setup.
func StoreTestRegistry(key string, cancel context.CancelFunc) {
	watcherRegistry.Store(key, &watcherState{
		running: true,
		cancel:  cancel,
	})
}

// StoreTestContextCancel stores a cancel function in the registry for tests.
func StoreTestContextCancel(contextKey string, cancel context.CancelFunc) {
	val, _ := watcherRegistry.LoadOrStore(contextKey, &watcherState{})
	state := val.(*watcherState)
	state.mu.Lock()
	state.cancel = cancel
	state.mu.Unlock()
}

// RegistryLoaded checks if a key exists in registries and its running state.
func RegistryLoaded(key string) (running, loaded bool) {
	val, ok := watcherRegistry.Load(key)
	if !ok {
		return false, false
	}

	state, ok := val.(*watcherState)
	if !ok {
		return false, false
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	return state.running, true
}

// ExportedWatcherInCooldown reports whether the context key is currently in cooldown.
func ExportedWatcherInCooldown(contextKey string) bool {
	val, ok := watcherRegistry.Load(contextKey)
	if !ok {
		return false
	}

	state, ok := val.(*watcherState)
	if !ok {
		return false
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	return time.Now().Before(state.retryAfter)
}

// ExportedExpireWatcherCooldown manually sets the retryAfter timestamp in the past for testing.
func ExportedExpireWatcherCooldown(contextKey string) {
	val, ok := watcherRegistry.Load(contextKey)
	if !ok {
		return
	}

	state, ok := val.(*watcherState)
	if !ok {
		return
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	state.retryAfter = time.Now().Add(-1 * time.Second)
}

// ExportedWatcherFailureCount returns failureCount for testing.
func ExportedWatcherFailureCount(contextKey string) int {
	val, ok := watcherRegistry.Load(contextKey)
	if !ok {
		return 0
	}

	state, ok := val.(*watcherState)
	if !ok {
		return 0
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	return state.failureCount
}

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

// ExportedFilterImportantResources exposes filterImportantResources for testing.
func ExportedFilterImportantResources(gvrList []schema.GroupVersionResource) []schema.GroupVersionResource {
	return filterImportantResources(gvrList)
}

// ExportedReturnGVRList exposes returnGVRList for testing.
func ExportedReturnGVRList(apiResourceLists []*metav1.APIResourceList) []schema.GroupVersionResource {
	return returnGVRList(apiResourceLists)
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
