package kubeconfig_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

//nolint:funlen // Integration test function covering file watcher events across multiple kubeconfigs.
func TestWatchAndLoadFiles(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	paths := []string{"./test_data/kubeconfig1", "./test_data/kubeconfig2"}

	var path string
	if runtime.GOOS == "windows" {
		path = strings.Join(paths, ";")
	} else {
		path = strings.Join(paths, ":")
	}

	kubeConfigStore := kubeconfig.NewContextStore()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel() // Ensure the watcher goroutine is stopped when the test ends

	go kubeconfig.LoadAndWatchFiles(ctx, kubeConfigStore, path, kubeconfig.KubeConfig, nil)

	// Test adding a context
	t.Run("Add context", func(t *testing.T) {
		// Sleep to ensure watcher is ready
		time.Sleep(2 * time.Second)

		// Read existing config
		config, err := clientcmd.LoadFromFile("./test_data/kubeconfig1")
		require.NoError(t, err)

		// Add new context
		config.Contexts["random-cluster-4"] = &clientcmdapi.Context{
			Cluster:  "docker-desktop", // reuse existing cluster
			AuthInfo: "docker-desktop", // reuse existing auth
		}

		// Write back to file
		err = clientcmd.WriteToFile(*config, "./test_data/kubeconfig1")
		require.NoError(t, err)

		// Wait for context to be added
		found := false

		for i := 0; i < 20; i++ {
			context, err := kubeConfigStore.GetContext("random-cluster-4")
			if err == nil && context != nil {
				found = true
				break
			}

			time.Sleep(500 * time.Millisecond)
		}

		require.True(t, found, "Context should have been added")
	})

	// Test removing a context
	t.Run("Remove context", func(t *testing.T) {
		// Verify context exists before removal
		context, err := kubeConfigStore.GetContext("random-cluster-4")
		require.NoError(t, err)
		require.NotNil(t, context)

		// Read existing config
		config, err := clientcmd.LoadFromFile("./test_data/kubeconfig1")
		require.NoError(t, err)

		// Remove context
		delete(config.Contexts, "random-cluster-4")

		// Write back to file
		err = clientcmd.WriteToFile(*config, "./test_data/kubeconfig1")
		require.NoError(t, err)

		// Wait for context to be removed
		removed := false

		for i := 0; i < 20; i++ {
			_, err = kubeConfigStore.GetContext("random-cluster-4")
			if err != nil {
				removed = true
				break
			}

			time.Sleep(500 * time.Millisecond)
		}

		require.True(t, removed, "Context should have been removed")
	})

	// Cleanup in case test fails
	defer func() {
		config, err := clientcmd.LoadFromFile("./test_data/kubeconfig1")
		if err == nil {
			delete(config.Contexts, "random-cluster-4")

			err = clientcmd.WriteToFile(*config, "./test_data/kubeconfig1")
			require.NoError(t, err)
		}
	}()
}

// TestWatchFileRemovalRemovesContexts verifies that deleting a watched kubeconfig
// file removes the contexts it provided, while contexts from other sources stay.
// The watcher skips watched files that do not exist, so its sync treats the
// deletion like a file with every context removed.
//
//nolint:funlen // Integration test covering the full watch -> remove -> sync flow.
func TestWatchFileRemovalRemovesContexts(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	src, err := os.ReadFile("./test_data/kubeconfig1")
	require.NoError(t, err)

	kubeConfigPath := filepath.Join(t.TempDir(), "config")
	//nolint:gosec // Test helper writing a fixture copy into t.TempDir().
	require.NoError(t, os.WriteFile(kubeConfigPath, src, 0o600))

	store := kubeconfig.NewContextStore()

	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	for _, name := range []string{"minikube", "docker-desktop"} {
		_, err := store.GetContext(name)
		require.NoError(t, err, "context %q should be loaded from the kubeconfig file", name)
	}

	const dynamicName = "dynamic-cluster"

	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:   dynamicName,
		Source: kubeconfig.DynamicCluster,
	}))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go kubeconfig.LoadAndWatchFiles(ctx, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	// LoadAndWatchFiles gives no readiness signal, so make a write and wait for
	// it to be picked up before removing the file.
	config, err := clientcmd.LoadFromFile(kubeConfigPath)
	require.NoError(t, err)

	const readyName = "watcher-ready"

	config.Contexts[readyName] = &clientcmdapi.Context{
		Cluster:  "docker-desktop",
		AuthInfo: "docker-desktop",
	}

	// Keep writing until the watcher reports the change: a single write can land
	// before the watcher goroutine has added the file, and then no event fires.
	require.Eventually(t, func() bool {
		if _, err := store.GetContext(readyName); err == nil {
			return true
		}

		require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

		return false
	}, 15*time.Second, 500*time.Millisecond, "watcher should pick up the file write")

	require.NoError(t, os.Remove(kubeConfigPath))

	require.Eventually(t, func() bool {
		for _, name := range []string{"minikube", "docker-desktop", readyName} {
			if _, err := store.GetContext(name); err == nil {
				return false
			}
		}

		return true
	}, 15*time.Second, 200*time.Millisecond, "contexts from the removed kubeconfig should be removed")

	dynamicCtx, err := store.GetContext(dynamicName)
	require.NoError(t, err, "contexts from other sources must survive kubeconfig removal")
	require.Equal(t, kubeconfig.DynamicCluster, dynamicCtx.Source)
}

// TestSyncContextsMissingFile verifies that syncing a kubeconfig file that no
// longer exists removes its contexts instead of failing, and keeps contexts
// from other sources.
func TestSyncContextsMissingFile(t *testing.T) {
	src, err := os.ReadFile("./test_data/kubeconfig1")
	require.NoError(t, err)

	kubeConfigPath := filepath.Join(t.TempDir(), "config")
	//nolint:gosec // Test helper writing a fixture copy into t.TempDir().
	require.NoError(t, os.WriteFile(kubeConfigPath, src, 0o600))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	const dynamicName = "dynamic-cluster"

	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:   dynamicName,
		Source: kubeconfig.DynamicCluster,
	}))

	require.NoError(t, os.Remove(kubeConfigPath))

	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	contexts, err := store.GetContexts()
	require.NoError(t, err)
	require.Len(t, contexts, 1)
	require.Equal(t, dynamicName, contexts[0].Name)
}

// captureErrorLogs records the messages logged at error level until the test ends.
func captureErrorLogs(t *testing.T) func() []string {
	t.Helper()

	var (
		mu   sync.Mutex
		msgs []string
	)

	originalLogFunc := logger.SetLogFunc(func(level uint, _ map[string]string, _ interface{}, msg string) {
		if level != logger.LevelError {
			return
		}

		mu.Lock()
		defer mu.Unlock()

		msgs = append(msgs, msg)
	})

	t.Cleanup(func() { logger.SetLogFunc(originalLogFunc) })

	return func() []string {
		mu.Lock()
		defer mu.Unlock()

		return append([]string(nil), msgs...)
	}
}

// TestLoadAndWatchFilesEmptyPath verifies that the watcher does not run when no
// kubeconfig is set, as in in-cluster mode with plugin watching enabled.
func TestLoadAndWatchFilesEmptyPath(t *testing.T) {
	errorLogs := captureErrorLogs(t)

	done := make(chan struct{})

	go func() {
		kubeconfig.LoadAndWatchFiles(context.Background(), kubeconfig.NewContextStore(), "", kubeconfig.KubeConfig, nil)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("LoadAndWatchFiles should return when no kubeconfig path is set")
	}

	require.Empty(t, errorLogs())
}

// TestLoadAndWatchFilesMissingFile verifies that watching a kubeconfig file that
// does not exist yet is not logged as an error.
func TestLoadAndWatchFilesMissingFile(t *testing.T) {
	errorLogs := captureErrorLogs(t)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		kubeconfig.LoadAndWatchFiles(ctx, kubeconfig.NewContextStore(), filepath.Join(t.TempDir(), "config"),
			kubeconfig.KubeConfig, nil)
		close(done)
	}()

	time.Sleep(500 * time.Millisecond)
	cancel()
	<-done

	require.Empty(t, errorLogs())
}

// TestReAddMissingFilesLoadsCreatedFile verifies that a watched kubeconfig file
// that was missing gets watched and loaded once it is created.
func TestReAddMissingFilesLoadsCreatedFile(t *testing.T) {
	src, err := os.ReadFile("./test_data/kubeconfig1")
	require.NoError(t, err)

	kubeConfigPath := filepath.Join(t.TempDir(), "config")

	watcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = watcher.Close() }()

	store := kubeconfig.NewContextStore()

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	contexts, err := store.GetContexts()
	require.NoError(t, err)
	require.Empty(t, contexts, "nothing should load while the file is missing")
	require.Empty(t, watcher.WatchList())

	//nolint:gosec // Test helper writing a fixture copy into t.TempDir().
	require.NoError(t, os.WriteFile(kubeConfigPath, src, 0o600))

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	require.Len(t, watcher.WatchList(), 1)

	for _, name := range []string{"minikube", "docker-desktop"} {
		_, err := store.GetContext(name)
		require.NoError(t, err, "context %q should be loaded once the file exists", name)
	}

	// Once every file is watched, a retry does nothing.
	require.NoError(t, store.RemoveContext("minikube"))

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	_, err = store.GetContext("minikube")
	require.Error(t, err, "a retry should not reload when no file was missing")
}
