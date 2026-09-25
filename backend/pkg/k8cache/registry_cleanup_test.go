package k8cache_test

import (
	"context"
	"errors"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
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
	k8cache.ExportedRunWatcher(ctx, cancel, nil, key, kubeconfig.Context{})

	// After the early return, both registry entries must be cleaned up
	// so that a subsequent CheckForChanges call can start a new watcher.
	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)
	assert.False(t, watcherLoaded, "watcherRegistry entry should be removed after early exit")
	assert.False(t, cancelLoaded, "contextCancel entry should be removed after early exit")
}

func TestRunWatcherCleansUpOnDiscoveryClientFailure(t *testing.T) {
	key := t.Name()

	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	k8cache.StoreTestRegistry(key, cancel)

	called := false
	restore := k8cache.SetDiscoveryClientCreator(func(c *rest.Config) (discovery.DiscoveryInterface, error) {
		called = true
		return nil, errors.New("simulated discovery client failure")
	})
	defer restore()

	validContext := kubeconfig.Context{
		Name: "test-context",
		KubeContext: &api.Context{
			Cluster:  "test-cluster",
			AuthInfo: "test-user",
		},
		Cluster: &api.Cluster{
			Server: "https://127.0.0.1:6443",
		},
		AuthInfo: &api.AuthInfo{
			Token: "dummy-token",
		},
	}

	assert.NotPanics(t, func() {
		k8cache.ExportedRunWatcher(ctx, cancel, nil, key, validContext)
	}, "runWatcher must not panic on discovery client creation failure")

	assert.True(t, called, "injected discoveryClientCreator should have been invoked")

	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)
	assert.False(t, watcherLoaded, "watcherRegistry entry should be removed after discovery failure")
	assert.False(t, cancelLoaded, "contextCancel entry should be removed after discovery failure")
	assert.Equal(t, context.Canceled, ctx.Err(), "watcher context should be canceled on exit")
}

func TestRunWatcherDoesNotCancelReplacementWatcher(t *testing.T) {
	key := t.Name()

	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	// Old watcher context
	ctxOld, cancelOld := context.WithCancel(context.Background())
	defer cancelOld()

	// A replacement watcher has already been stored for the same key
	ctxNew, cancelNew := context.WithCancel(context.Background())
	defer cancelNew()

	k8cache.StoreTestRegistry(key, cancelNew)

	// Old watcher exits (carrying its own cancelOld)
	k8cache.ExportedRunWatcherWithCancel(ctxOld, cancelOld, nil, key, kubeconfig.Context{})

	// The replacement watcher registry entries and context must NOT be canceled/deleted
	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)
	assert.True(t, watcherLoaded, "watcherRegistry should still contain replacement watcher")
	assert.True(t, cancelLoaded, "contextCancel should still contain replacement watcher")
	assert.Nil(t, ctxNew.Err(), "replacement watcher context should not be canceled")
}
