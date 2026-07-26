package k8cache_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	api "k8s.io/client-go/tools/clientcmd/api"
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

func TestRunWatcherResetsFailureCountOnSuccess(t *testing.T) {
	key := t.Name()
	k8cache.ResetRegistries(key)

	defer k8cache.ResetRegistries(key)

	// 1. Simulate a prior failure to set failureCount > 0 and put watcher in cooldown
	ctxFail, cancelFail := context.WithCancel(context.Background())
	k8cache.ExportedRunWatcher(ctxFail, nil, key, kubeconfig.Context{})
	cancelFail()

	assert.Equal(t, 1, k8cache.ExportedWatcherFailureCount(key))
	assert.True(t, k8cache.ExportedWatcherInCooldown(key))

	// 2. Set up mock API server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/api":
			_, _ = w.Write([]byte(`{"kind":"APIVersions","versions":["v1"]}`))
		case "/apis":
			_, _ = w.Write([]byte(`{"kind":"APIGroupList","groups":[]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	// 3. Build a valid Context pointing to the mock server
	kContext := kubeconfig.Context{
		Name: "test-context",
		KubeContext: &api.Context{
			Cluster:  "test-cluster",
			AuthInfo: "test-auth",
		},
		Cluster: &api.Cluster{
			Server: server.URL,
		},
		AuthInfo: &api.AuthInfo{},
	}

	// 4. Expire the cooldown and call CheckForChanges with the valid context
	k8cache.ExportedExpireWatcherCooldown(key)

	// Direct call to CheckForChanges spawns the runWatcher goroutine.
	k8cache.CheckForChanges(nil, key, kContext)

	// 5. Verify that failureCount is reset to 0 once runWatcher successfully initializes.
	assert.Eventually(t, func() bool {
		return k8cache.ExportedWatcherFailureCount(key) == 0
	}, 3*time.Second, 50*time.Millisecond, "failure count should be reset to 0 after successful watcher initialization")

	// Ensure it is running
	running, loaded := k8cache.RegistryLoaded(key)
	assert.True(t, loaded)
	assert.True(t, running, "watcher should be running")

	// Clean up by syncing (cancels the active watcher)
	k8cache.SyncWatchers(nil, []string{})
}
