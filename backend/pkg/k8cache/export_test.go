package k8cache

import (
	"context"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
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
func StoreTestRegistry(key string, cancel context.CancelFunc) {
	watcherRegistry.Store(key, struct{}{})
	contextCancel.Store(key, cancel)
}

// StoreTestContextCancel stores a cancel function in the registry for tests.
func StoreTestContextCancel(contextKey string, cancel context.CancelFunc) {
	contextCancel.Store(contextKey, cancel)
}

// RegistryLoaded checks if a key exists in both registries.
func RegistryLoaded(key string) (watcher, cancel bool) {
	_, watcher = watcherRegistry.Load(key)
	_, cancel = contextCancel.Load(key)

	return
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
