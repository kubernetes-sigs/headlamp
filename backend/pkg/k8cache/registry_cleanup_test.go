package k8cache_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	api "k8s.io/client-go/tools/clientcmd/api"
)

func TestRunWatcherCleansUpRegistryOnFailure(t *testing.T) {
	key := t.Name()

	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	k8cache.StoreTestRegistry(key, cancel)

	k8cache.ExportedRunWatcher(ctx, nil, key, kubeconfig.Context{})

	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)

	assert.False(t, watcherLoaded, "watcherRegistry entry should be removed after early exit")
	assert.False(t, cancelLoaded, "contextCancel entry should be removed after early exit")
}

func TestRunWatcherDoesNotRemoveReRegisteredWatcher(t *testing.T) {
	key := t.Name()

	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	ctx1, cancel1 := context.WithCancel(context.Background())
	defer cancel1()

	k8cache.StoreTestRegistry(key, cancel1)
	token1 := k8cache.GetTestToken(key)

	cancel1()
	k8cache.ResetRegistries(key)

	_, cancel2 := context.WithCancel(context.Background())
	defer cancel2()

	k8cache.StoreTestRegistry(key, cancel2)

	k8cache.ExportedRunWatcher(ctx1, nil, key, kubeconfig.Context{}, token1)

	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)

	assert.True(t, watcherLoaded, "watcherRegistry entry for watcher 2 should remain loaded")
	assert.True(t, cancelLoaded, "contextCancel entry for watcher 2 should remain loaded")
}

func TestSyncWatchersCleansUpInactiveWatcher(t *testing.T) {
	key := t.Name()

	k8cache.ResetRegistries(key)
	defer k8cache.ResetRegistries(key)

	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	k8cache.StoreTestRegistry(key, cancel)

	k8cache.SyncWatchers(nil, []string{"other-context"})

	watcherLoaded, cancelLoaded := k8cache.RegistryLoaded(key)

	assert.False(t, watcherLoaded, "watcherRegistry entry should be deleted by SyncWatchers")
	assert.False(t, cancelLoaded, "contextCancel entry should be deleted by SyncWatchers")
}

func setupCheckForChangesMock(t *testing.T) (*httptest.Server, *kubeconfig.Context, chan struct{}) {
	blockCh := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) { <-blockCh }))

	t.Cleanup(func() {
		close(blockCh)
		ts.Close()
	})

	validKContext := &kubeconfig.Context{
		Cluster:  &api.Cluster{Server: ts.URL},
		AuthInfo: &api.AuthInfo{Token: "test-token"},
	}

	return ts, validKContext, blockCh
}

func TestCheckForChangesStaleRequestRejection(t *testing.T) {
	k8cache.ResetRegistries()
	defer k8cache.ResetRegistries()

	_, validKContext, _ := setupCheckForChangesMock(t)
	ctx1, ctx2 := "context-1", "context-2"
	active := map[string]bool{ctx1: true, ctx2: true}

	var mu sync.Mutex

	isActive := func(ctx string) bool {
		mu.Lock()
		defer mu.Unlock()

		return active[ctx]
	}

	c1Block, c1Done, c2Done := make(chan struct{}), make(chan struct{}), make(chan struct{})

	go func() {
		k8cache.CheckForChanges(nil, ctx1, validKContext, func() bool {
			<-c1Block
			return isActive(ctx1)
		})
		close(c1Done)
	}()

	time.Sleep(50 * time.Millisecond)

	go func() {
		k8cache.CheckForChanges(nil, ctx2, validKContext, func() bool { return isActive(ctx2) })
		close(c2Done)
	}()

	time.Sleep(50 * time.Millisecond)

	mu.Lock()
	active[ctx2] = false
	mu.Unlock()

	close(c1Block)
	<-c1Done
	<-c2Done

	c2Loaded, _ := k8cache.RegistryLoaded(ctx2)
	assert.False(t, c2Loaded, "Stale request C2 should be rejected")

	c1Loaded, _ := k8cache.RegistryLoaded(ctx1)
	assert.True(t, c1Loaded, "Genuine request C1 should register")

	mu.Lock()
	active[ctx2] = true
	mu.Unlock()

	k8cache.CheckForChanges(nil, ctx2, validKContext, func() bool { return isActive(ctx2) })
	c2Readded, _ := k8cache.RegistryLoaded(ctx2)
	assert.True(t, c2Readded, "Re-added context should register")
}
