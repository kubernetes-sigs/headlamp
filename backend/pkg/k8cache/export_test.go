package k8cache

import (
	"context"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
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
