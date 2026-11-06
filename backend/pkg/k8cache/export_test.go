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

// WithInFlightWaitHook sets a wait hook invoked when a waiter begins blocking on in-flight creation for testing.
func WithInFlightWaitHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.inFlightWaitHook = hook
	}
}

// WithJanitorLoopHook sets an unexported testing hook invoked on each janitor tick for testing.
func WithJanitorLoopHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.janitorLoopHook = hook
	}
}

// WithJanitorStopHook sets an unexported testing hook invoked inside Stop() while holding janitorMu.
func WithJanitorStopHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.janitorStopHook = hook
	}
}

// SetJanitorStopHook allows setting or overriding the janitor stop hook for testing.
func (c *ClientsetCache) SetJanitorStopHook(hook func()) {
	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	c.janitorStopHook = hook
}

// WithJanitorStartHook sets an unexported testing hook invoked inside Start() before acquiring janitorMu.
func WithJanitorStartHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.janitorStartHook = hook
	}
}

// SetJanitorStartHook allows setting or overriding the janitor start hook for testing.
func (c *ClientsetCache) SetJanitorStartHook(hook func()) {
	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	c.janitorStartHook = hook
}

// JanitorDone returns the done channel of the current janitor goroutine for testing.
func (c *ClientsetCache) JanitorDone() <-chan struct{} {
	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	return c.janitorDone
}

// SetClientsetCreator allows setting or overriding the clientset creator on an existing cache instance for testing.
func (c *ClientsetCache) SetClientsetCreator(creator ClientsetCreatorFunc) {
	c.creator = creator
}

// SetInFlightWaitHook allows setting or overriding the in-flight wait hook on an existing cache instance for testing.
func (c *ClientsetCache) SetInFlightWaitHook(hook func()) {
	c.inFlightWaitHook = hook
}

// SeedClientset inserts a clientset directly into the appropriate shard for testing.
func (c *ClientsetCache) SeedClientset(key string, lastUsed time.Time, cs ...*kubernetes.Clientset) {
	prefix := clientsetCachePrefixFromCacheKey(key)
	shard := c.shardForPrefix(prefix)

	shard.mu.Lock()
	defer shard.mu.Unlock()

	var client *kubernetes.Clientset
	if len(cs) > 0 && cs[0] != nil {
		client = cs[0]
	} else {
		client = &kubernetes.Clientset{}
	}

	shard.clientsets[key] = &CachedClientSet{
		clientset: client,
		lastUsed:  lastUsed,
	}
}

// SeedBlockedPrefix marks a prefix as blocked at blockedAt for testing.
func (c *ClientsetCache) SeedBlockedPrefix(prefix string, blockedAt time.Time) {
	shard := c.shardForPrefix(prefix)

	shard.mu.Lock()
	defer shard.mu.Unlock()

	shard.blockedClientsetPrefixes[prefix] = blockedPrefixEntry{blockedAt: blockedAt}
}

// SeedInFlight registers an in-flight entry for testing.
func (c *ClientsetCache) SeedInFlight(cacheKey string) chan struct{} {
	prefix := clientsetCachePrefixFromCacheKey(cacheKey)
	shard := c.shardForPrefix(prefix)

	shard.mu.Lock()
	defer shard.mu.Unlock()

	waitCh := make(chan struct{})
	shard.inFlight[cacheKey] = &inFlightEntry{
		waitCh: waitCh,
	}

	return waitCh
}
