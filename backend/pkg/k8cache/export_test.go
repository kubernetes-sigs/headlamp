package k8cache

import (
	"context"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"k8s.io/client-go/kubernetes"
)

// ExportedRunWatcher exposes runWatcher for testing.
func ExportedRunWatcher(
	ctx context.Context,
	k8scache cache.Cache[string],
	contextKey string,
	kContext kubeconfig.Context,
) {
	runWatcher(ctx, k8scache, contextKey, kContext)
}

// ResetRegistries clears both registries for test isolation.
// If no keys are provided, it clears all entries.
func ResetRegistries(keys ...string) {
	if len(keys) == 0 {
		watcherRegistry.Range(func(key, _ interface{}) bool {
			watcherRegistry.Delete(key)
			return true
		})
		contextCancel.Range(func(key, _ interface{}) bool {
			contextCancel.Delete(key)
			return true
		})

		return
	}

	for _, k := range keys {
		watcherRegistry.Delete(k)
		contextCancel.Delete(k)
	}
}

// StoreTestRegistry populates both registries for test setup.
func StoreTestRegistry(key string, cancel func()) {
	watcherRegistry.Store(key, struct{}{})
	contextCancel.Store(key, cancel)
}

// RegistryLoaded checks if a key exists in both registries.
func RegistryLoaded(key string) (watcher, cancel bool) {
	_, watcher = watcherRegistry.Load(key)
	_, cancel = contextCancel.Load(key)

	return
}

// ResetClientsetCache clears the clientset cache for test isolation.
func ResetClientsetCache() {
	mu.Lock()
	defer mu.Unlock()

	clientsetCache = make(map[string]*CachedClientSet)
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
