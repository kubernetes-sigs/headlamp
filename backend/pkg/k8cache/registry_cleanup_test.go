package k8cache_test

import (
	"context"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
)

func TestRunWatcherEnforcesCooldownOnFailure(t *testing.T) {
	key := t.Name()
	// Ensure clean state before and after the test.
	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// An empty Context causes RESTConfig() to return an error,
	// which makes runWatcher exit on its first error path.
	k8cache.ExportedRunWatcher(ctx, nil, key, kubeconfig.Context{})

	// After early return on failure, watcher should no longer be running,
	// but must be in cooldown state to prevent per-HTTP-request goroutine churn.
	running, loaded := k8cache.RegistryLoaded(key)
	assert.True(t, loaded, "watcher state should remain registered during cooldown")
	assert.False(t, running, "watcher should not be running after error exit")
	assert.True(t, k8cache.ExportedWatcherInCooldown(key), "watcher should be in cooldown after failure")

	// Verify CheckForChanges does not spawn a new watcher while in cooldown
	k8cache.CheckForChanges(nil, key, kubeconfig.Context{})
	runningAfterCheck, loadedAfterCheck := k8cache.RegistryLoaded(key)
	assert.True(t, loadedAfterCheck)
	assert.False(t, runningAfterCheck, "CheckForChanges must not start watcher during cooldown")
}
