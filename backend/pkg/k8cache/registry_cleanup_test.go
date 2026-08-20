package k8cache_test

import (
	"context"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
)

func TestRunWatcherCleansUpRegistryOnFailure(t *testing.T) {
	key := t.Name()

	// Ensure clean state before and after the test.
	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	// Simulate what CheckForChanges does before launching the goroutine.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	k8cache.StoreTestRegistry(key, cancel)

	// An empty Context causes RESTConfig() to return an error,
	// which makes runWatcher exit on its first error path.
	k8cache.ExportedRunWatcher(ctx, nil, key, kubeconfig.Context{})

	// After the early return, both registry entries must be cleaned up
	// so that a subsequent CheckForChanges call can start a new watcher.
	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)

	assert.False(t, watcherLoaded, "watcherRegistry entry should be removed after early exit")
	assert.False(t, cancelLoaded, "contextCancel entry should be removed after early exit")
}

func TestRunWatcherDoesNotRemoveReRegisteredWatcher(t *testing.T) {
	key := t.Name()

	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	// 1. Simulate initial watcher (watcher 1) registration.
	ctx1, cancel1 := context.WithCancel(context.Background())
	defer cancel1()

	k8cache.StoreTestRegistry(key, cancel1)

	token1 := k8cache.GetTestToken(key)

	// 2. Simulate SyncWatchers removing watcher 1 from registry and cancelling it.
	cancel1()
	k8cache.ResetRegistries(key)

	// 3. Simulate re-registration (watcher 2) before watcher 1's defer finishes.
	_, cancel2 := context.WithCancel(context.Background())
	defer cancel2()

	k8cache.StoreTestRegistry(key, cancel2)

	// 4. Now run watcher 1 (which exits due to error or cancellation),
	// passing token1 that watcher 1 originally received.
	// Its defer should NOT delete watcher 2's registry entries.
	k8cache.ExportedRunWatcher(ctx1, nil, key, kubeconfig.Context{}, token1)

	// 5. Verify watcher 2's entries remain intact in the registry.
	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)

	assert.True(t, watcherLoaded, "watcherRegistry entry for watcher 2 should remain loaded")
	assert.True(t, cancelLoaded, "contextCancel entry for watcher 2 should remain loaded")
}

func TestSyncWatchersCleansUpInactiveWatcher(t *testing.T) {
	key := t.Name()

	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	// Register a watcher token for the context.
	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	k8cache.StoreTestRegistry(key, cancel)

	// SyncWatchers runs without key in active contexts -> removes key.
	k8cache.SyncWatchers(nil, []string{"other-context"})

	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)

	assert.False(t, watcherLoaded, "watcherRegistry entry should be deleted by SyncWatchers")
	assert.False(t, cancelLoaded, "contextCancel entry should be deleted by SyncWatchers")
}
