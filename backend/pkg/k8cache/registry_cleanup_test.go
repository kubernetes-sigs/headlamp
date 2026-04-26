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
