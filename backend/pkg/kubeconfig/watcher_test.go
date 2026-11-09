package kubeconfig_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
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
	"k8s.io/client-go/transport"
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

	// Perform initial load as done by the Headlamp server
	err := kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, path, kubeconfig.KubeConfig, nil)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel() // Ensure the watcher goroutine is stopped when the test ends

	go kubeconfig.LoadAndWatchFiles(ctx, kubeConfigStore, path, kubeconfig.KubeConfig, nil)

	// Test adding a context
	t.Run("Add context", func(t *testing.T) {
		// Read existing config
		config, err := clientcmd.LoadFromFile("./test_data/kubeconfig1")
		require.NoError(t, err)

		// Add new context
		config.Contexts["random-cluster-4"] = &clientcmdapi.Context{
			Cluster:  "docker-desktop", // reuse existing cluster
			AuthInfo: "docker-desktop", // reuse existing auth
		}

		// Periodically rewrite file until watcher detects event
		found := false

		for i := 0; i < 30; i++ {
			err = clientcmd.WriteToFile(*config, "./test_data/kubeconfig1")
			require.NoError(t, err)

			context, err := kubeConfigStore.GetContext("random-cluster-4")
			if err == nil && context != nil {
				found = true

				break
			}

			time.Sleep(200 * time.Millisecond)
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

// removalRecorder records the contexts removed from the store.
type removalRecorder struct {
	kubeconfig.ContextStore
	removed []string
}

func (r *removalRecorder) RemoveContext(name string) error {
	r.removed = append(r.removed, name)

	return r.ContextStore.RemoveContext(name)
}

// TestSyncContextsKeepsRenamedContext checks that a reload does not remove a
// context renamed in Headlamp, which is stored under its custom name.
func TestSyncContextsKeepsRenamedContext(t *testing.T) {
	kubeConfigPath := filepath.Join(t.TempDir(), "kubeconfig")
	require.NoError(t, os.WriteFile(kubeConfigPath, []byte(`apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://127.0.0.1:6443
users:
- name: test-user
  user:
    token: token
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user
    extensions:
    - name: headlamp_info
      extension:
        customName: renamed-context
`), 0o600))

	store := &removalRecorder{ContextStore: kubeconfig.NewContextStore()}
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	_, err := store.GetContext("renamed-context")
	require.NoError(t, err)

	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	require.Empty(t, store.removed, "the renamed context should not be removed and added again")

	_, err = store.GetContext("renamed-context")
	require.NoError(t, err)
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

	fsWatcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = fsWatcher.Close() }()

	watcher := kubeconfig.NewFileWatcher(fsWatcher)

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

// TestReAddMissingFilesReloadsRecreatedCredentialFile covers a remove-and-recreate
// credential rotation: once the replaced file's stale watch is dropped, re-adding
// the recreated file must reload the contexts so the new credentials apply.
func TestReAddMissingFilesReloadsRecreatedCredentialFile(t *testing.T) {
	tempDir := t.TempDir()

	tokenPath := filepath.Join(tempDir, "token")
	require.NoError(t, os.WriteFile(tokenPath, []byte("old-token"), 0o600))

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{TokenFile: tokenPath}
	config.Contexts["test-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}
	require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	fsWatcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = fsWatcher.Close() }()

	watcher := kubeconfig.NewFileWatcher(fsWatcher)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)
	require.Contains(t, watcher.WatchList(), tokenPath)

	// Rotate the token by removing and recreating it. The watcher drops the
	// removed file's watch when it handles the Remove event; fsnotify may have
	// dropped it already, so the error is ignored as in the watcher.
	require.NoError(t, os.Remove(tokenPath))

	_ = watcher.Remove(tokenPath)
	require.NoError(t, os.WriteFile(tokenPath, []byte("new-token"), 0o600))

	reloads := make(chan struct{}, 10)

	store.AddListener(func() {
		select {
		case reloads <- struct{}{}:
		default:
		}
	})

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	require.Contains(t, watcher.WatchList(), tokenPath, "the recreated file should be watched again")

	select {
	case <-reloads:
	default:
		t.Fatal("re-adding the recreated credential file should reload the contexts")
	}
}

// TestWatchAndLoadReferencedCredentialFiles checks the whole flow: the watcher
// sees the token file change, reloads the contexts, and the proxy then sends
// the new token.
func TestWatchAndLoadReferencedCredentialFiles(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	seen := make(chan string, 10)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.Header.Get("Authorization")
	}))
	t.Cleanup(server.Close)

	tokenPath := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenPath, []byte("initial-token"), 0o600))

	kubeConfigPath := writeKubeConfigForServer(t, server, &clientcmdapi.AuthInfo{TokenFile: tokenPath})

	kubeConfigStore := kubeconfig.NewContextStore()

	// Perform initial load as done by the Headlamp server
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, kubeConfigStore)
	require.Equal(t, "Bearer initial-token", <-seen)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	reloadChan := make(chan struct{}, 10)

	kubeConfigStore.AddListener(func() {
		select {
		case reloadChan <- struct{}{}:
		default:
		}
	})

	go kubeconfig.LoadAndWatchFiles(ctx, kubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, nil)

	// The watcher reloads once its files are watched, so after that reload a
	// write to the token file must cause another one.
	select {
	case <-reloadChan:
	case <-time.After(5 * time.Second):
		require.FailNow(t, "Timeout waiting for the watcher's startup reload")
	}

	require.NoError(t, os.WriteFile(tokenPath, []byte("updated-token"), 0o600))

	select {
	case <-reloadChan:
	case <-time.After(5 * time.Second):
		require.FailNow(t, "Timeout waiting for watcher to trigger reload on credential file change")
	}

	proxyThroughContext(t, kubeConfigStore)
	require.Equal(t, "Bearer updated-token", <-seen)
}

func TestRemoveContextWithSharedCluster(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	tempDir := t.TempDir()
	kubeconfigPath := filepath.Join(tempDir, "kubeconfig")
	config := clientcmdapi.NewConfig()
	config.Clusters["shared-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["user-1"] = &clientcmdapi.AuthInfo{Token: "token-1"}
	config.AuthInfos["user-2"] = &clientcmdapi.AuthInfo{Token: "token-2"}
	config.Contexts["ctx-1"] = &clientcmdapi.Context{Cluster: "shared-cluster", AuthInfo: "user-1"}
	config.Contexts["ctx-2"] = &clientcmdapi.Context{Cluster: "shared-cluster", AuthInfo: "user-2"}

	require.NoError(t, clientcmd.WriteToFile(*config, kubeconfigPath))

	kubeConfigStore := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, kubeconfigPath, kubeconfig.KubeConfig, nil))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go kubeconfig.LoadAndWatchFiles(ctx, kubeConfigStore, kubeconfigPath, kubeconfig.KubeConfig, nil)

	_, err1 := kubeConfigStore.GetContext("ctx-1")
	_, err2 := kubeConfigStore.GetContext("ctx-2")

	require.NoError(t, err1)
	require.NoError(t, err2)

	delete(config.Contexts, "ctx-1")

	removed := false

	for i := 0; i < 30; i++ {
		require.NoError(t, clientcmd.WriteToFile(*config, kubeconfigPath))

		if _, err := kubeConfigStore.GetContext("ctx-1"); err != nil {
			removed = true

			break
		}

		time.Sleep(200 * time.Millisecond)
	}

	require.True(t, removed, "ctx-1 should have been removed by watcher")

	_, err := kubeConfigStore.GetContext("ctx-2")
	require.NoError(t, err, "ctx-2 should still exist in store")
}

// TestReAddMissingFilesFollowsRetargetedCredentialSymlink covers a credential
// rotated by atomically retargeting a symlink while the old target stays on
// disk. The watch is attached to the old target, so no event fires; the
// periodic reconciliation must notice the new target, watch it and reload.
//
//nolint:funlen // Covers the full retarget -> reconcile -> watch flow.
func TestReAddMissingFilesFollowsRetargetedCredentialSymlink(t *testing.T) {
	tempDir := t.TempDir()

	oldTarget := filepath.Join(tempDir, "token-1")
	newTarget := filepath.Join(tempDir, "token-2")

	require.NoError(t, os.WriteFile(oldTarget, []byte("token-1"), 0o600))
	require.NoError(t, os.WriteFile(newTarget, []byte("token-2"), 0o600))

	tokenPath := filepath.Join(tempDir, "token")
	if err := os.Symlink(oldTarget, tokenPath); err != nil {
		t.Skipf("symlinks are not supported here: %v", err)
	}

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{TokenFile: tokenPath}
	config.Contexts["test-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}
	require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	fsWatcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = fsWatcher.Close() }()

	watcher := kubeconfig.NewFileWatcher(fsWatcher)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)
	require.Contains(t, watcher.WatchList(), tokenPath)

	// Retarget the symlink atomically, keeping the old target.
	tmpLink := filepath.Join(tempDir, "token.tmp")
	require.NoError(t, os.Symlink(newTarget, tmpLink))
	require.NoError(t, os.Rename(tmpLink, tokenPath))

	reloads := make(chan struct{}, 10)

	store.AddListener(func() {
		select {
		case reloads <- struct{}{}:
		default:
		}
	})

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	select {
	case <-reloads:
	default:
		t.Fatal("retargeting the credential symlink should reload the contexts")
	}

	// The watch must now follow the new target, so later writes are seen.
	require.NoError(t, os.WriteFile(newTarget, []byte("token-3"), 0o600))

	timeout := time.After(5 * time.Second)

	for {
		select {
		case event := <-watcher.Events:
			if event.Name == tokenPath && event.Has(fsnotify.Write) {
				return
			}
		case err := <-watcher.Errors:
			t.Fatalf("watcher error: %v", err)
		case <-timeout:
			t.Fatal("a write to the new symlink target should be watched")
		}
	}
}

// TestReAddMissingFilesRemovesContextsAfterKubeConfigSymlinkRetarget covers a
// kubeconfig rotated by atomically retargeting a symlink while the old target
// stays on disk. No event fires, so the periodic reconciliation is the only
// reload, and it must also drop the contexts the new kubeconfig no longer has.
func TestReAddMissingFilesRemovesContextsAfterKubeConfigSymlinkRetarget(t *testing.T) {
	tempDir := t.TempDir()

	writeKubeConfig := func(path string, contextNames ...string) {
		config := clientcmdapi.NewConfig()
		config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
		config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{Token: "token"}

		for _, name := range contextNames {
			config.Contexts[name] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}
		}

		require.NoError(t, clientcmd.WriteToFile(*config, path))
	}

	oldTarget := filepath.Join(tempDir, "kubeconfig-1")
	newTarget := filepath.Join(tempDir, "kubeconfig-2")

	writeKubeConfig(oldTarget, "kept-context", "dropped-context")
	writeKubeConfig(newTarget, "kept-context")

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	if err := os.Symlink(oldTarget, kubeConfigPath); err != nil {
		t.Skipf("symlinks are not supported here: %v", err)
	}

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	fsWatcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = fsWatcher.Close() }()

	watcher := kubeconfig.NewFileWatcher(fsWatcher)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	_, err = store.GetContext("dropped-context")
	require.NoError(t, err)

	// Retarget the symlink atomically, keeping the old target.
	tmpLink := filepath.Join(tempDir, "kubeconfig.tmp")
	require.NoError(t, os.Symlink(newTarget, tmpLink))
	require.NoError(t, os.Rename(tmpLink, kubeConfigPath))

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	_, err = store.GetContext("kept-context")
	require.NoError(t, err)

	_, err = store.GetContext("dropped-context")
	require.Error(t, err, "a context missing from the new kubeconfig should be removed")
}

// TestReAddMissingFilesRemovesContextsAfterKubeConfigSymlinkDeleted covers a
// kubeconfig symlink deleted while its target stays on disk. No event fires,
// so the periodic reconciliation must notice the path is gone and remove the
// kubeconfig's contexts.
func TestReAddMissingFilesRemovesContextsAfterKubeConfigSymlinkDeleted(t *testing.T) {
	tempDir := t.TempDir()

	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{Token: "token"}
	config.Contexts["test-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}

	target := filepath.Join(tempDir, "kubeconfig-1")
	require.NoError(t, clientcmd.WriteToFile(*config, target))

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	if err := os.Symlink(target, kubeConfigPath); err != nil {
		t.Skipf("symlinks are not supported here: %v", err)
	}

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	fsWatcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = fsWatcher.Close() }()

	watcher := kubeconfig.NewFileWatcher(fsWatcher)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	_, err = store.GetContext("test-context")
	require.NoError(t, err)

	require.NoError(t, os.Remove(kubeConfigPath))

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	_, err = store.GetContext("test-context")
	require.Error(t, err, "the deleted kubeconfig's context should be removed")
}

// TestLoadAndWatchFilesReloadsFilesChangedBeforeWatching checks that a token
// file rotated between the initial load and the watcher starting is reloaded,
// although no event fires for it.
func TestLoadAndWatchFilesReloadsFilesChangedBeforeWatching(t *testing.T) {
	seen := make(chan string, 100)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.Header.Get("Authorization")
	}))
	t.Cleanup(server.Close)

	tokenPath := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenPath, []byte("token-1"), 0o600))

	kubeConfigPath := writeKubeConfigForServer(t, server, &clientcmdapi.AuthInfo{TokenFile: tokenPath})

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, store)
	require.Equal(t, "Bearer token-1", <-seen)

	require.NoError(t, os.WriteFile(tokenPath, []byte("token-2"), 0o600))

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	go kubeconfig.LoadAndWatchFiles(ctx, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	require.Eventually(t, func() bool {
		proxyThroughContext(t, store)

		return <-seen == "Bearer token-2"
	}, 3*time.Second, 50*time.Millisecond)
}

// TestLoadAndWatchFilesRemovesContextsOfKubeConfigDeletedBeforeWatching checks
// that the contexts of a kubeconfig deleted between the initial load and the
// watcher starting are removed, although there is no file left to watch.
func TestLoadAndWatchFilesRemovesContextsOfKubeConfigDeletedBeforeWatching(t *testing.T) {
	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{Token: "token"}
	config.Contexts["test-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}

	kubeConfigPath := filepath.Join(t.TempDir(), "kubeconfig")
	require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	require.NoError(t, os.Remove(kubeConfigPath))

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	go kubeconfig.LoadAndWatchFiles(ctx, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	require.Eventually(t, func() bool {
		_, err := store.GetContext("test-context")

		return err != nil
	}, 3*time.Second, 50*time.Millisecond, "the deleted kubeconfig's context should be removed")
}

// TestRESTConfigKeepsClientCertificateFiles checks that RESTConfig leaves the
// client certificate and key as files. Long-lived clients built from it, such
// as the cache informers, rely on client-go reloading the files when they are
// rotated.
func TestRESTConfigKeepsClientCertificateFiles(t *testing.T) {
	tempDir := t.TempDir()
	certPath := filepath.Join(tempDir, "client.crt")
	keyPath := filepath.Join(tempDir, "client.key")
	writeClientCertificate(t, certPath, keyPath, "user-1")

	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{ClientCertificate: certPath, ClientKey: keyPath}
	config.Contexts["test-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	kContext, err := store.GetContext("test-context")
	require.NoError(t, err)

	restConf, err := kContext.RESTConfig()
	require.NoError(t, err)
	require.Equal(t, certPath, restConf.CertFile)
	require.Equal(t, keyPath, restConf.KeyFile)
	require.Empty(t, restConf.CertData)
	require.Empty(t, restConf.KeyData)
}

// writeKubeConfigForServer writes a kubeconfig with one context, test-context,
// for the given TLS server and user.
func writeKubeConfigForServer(t *testing.T, server *httptest.Server, user *clientcmdapi.AuthInfo) string {
	t.Helper()

	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{
		Server:                   server.URL,
		CertificateAuthorityData: pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}),
	}
	config.AuthInfos["test-user"] = user
	config.Contexts["test-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}

	path := filepath.Join(t.TempDir(), "kubeconfig")
	require.NoError(t, clientcmd.WriteToFile(*config, path))

	return path
}

// proxyThroughContext sends one request through test-context's proxy.
func proxyThroughContext(t *testing.T, store kubeconfig.ContextStore) {
	t.Helper()

	kContext, err := store.GetContext("test-context")
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/namespaces", nil)
	require.NoError(t, kContext.ProxyRequest(rr, req))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
}

// writeClientCertificate writes a self-signed client certificate for
// commonName and its key.
func writeClientCertificate(t *testing.T, certPath, keyPath, commonName string) {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)

	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: commonName},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)

	keyDER, err := x509.MarshalECPrivateKey(key)
	require.NoError(t, err)

	require.NoError(t, os.WriteFile(certPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER}), 0o600))
	require.NoError(t, os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0o600))
}

// TestCredentialReloadSendsRotatedToken checks that once the watcher reloads
// the contexts after a token file changes, the proxy sends the new token.
func TestCredentialReloadSendsRotatedToken(t *testing.T) {
	seen := make(chan string, 10)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.Header.Get("Authorization")
	}))
	t.Cleanup(server.Close)

	tokenPath := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenPath, []byte("token-1"), 0o600))

	kubeConfigPath := writeKubeConfigForServer(t, server, &clientcmdapi.AuthInfo{TokenFile: tokenPath})

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, store)
	require.Equal(t, "Bearer token-1", <-seen)

	require.NoError(t, os.WriteFile(tokenPath, []byte("token-2"), 0o600))

	// The watcher reloads the contexts like this when the token file changes.
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, store)
	require.Equal(t, "Bearer token-2", <-seen)
}

// TestCredentialReloadPresentsRotatedClientCertificate checks that once the
// watcher reloads the contexts after the client certificate and key change,
// the proxy presents the new certificate.
func TestCredentialReloadPresentsRotatedClientCertificate(t *testing.T) {
	seen := make(chan string, 10)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.TLS.PeerCertificates[0].Subject.CommonName
	}))
	server.TLS = &tls.Config{ClientAuth: tls.RequireAnyClientCert}
	server.StartTLS()
	t.Cleanup(server.Close)

	certPath := filepath.Join(t.TempDir(), "client.crt")
	keyPath := filepath.Join(t.TempDir(), "client.key")
	writeClientCertificate(t, certPath, keyPath, "user-1")

	kubeConfigPath := writeKubeConfigForServer(t, server,
		&clientcmdapi.AuthInfo{ClientCertificate: certPath, ClientKey: keyPath})

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, store)
	require.Equal(t, "user-1", <-seen)

	writeClientCertificate(t, certPath, keyPath, "user-2")

	// The watcher reloads the contexts like this when the files change.
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, store)
	require.Equal(t, "user-2", <-seen)
}

// TestCredentialReloadClientSetPresentsRotatedClientCertificate checks that a
// clientset kept per context, created again once the watcher reloads the
// context after its client certificate and key change, presents the new
// certificate rather than reusing the old clientset's connections.
func TestCredentialReloadClientSetPresentsRotatedClientCertificate(t *testing.T) {
	seen := make(chan string, 10)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.TLS.PeerCertificates[0].Subject.CommonName
	}))
	server.TLS = &tls.Config{ClientAuth: tls.RequireAnyClientCert}
	server.StartTLS()
	t.Cleanup(server.Close)

	certPath := filepath.Join(t.TempDir(), "client.crt")
	keyPath := filepath.Join(t.TempDir(), "client.key")
	writeClientCertificate(t, certPath, keyPath, "user-1")

	kubeConfigPath := writeKubeConfigForServer(t, server,
		&clientcmdapi.AuthInfo{ClientCertificate: certPath, ClientKey: keyPath})

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	request := func() string {
		kContext, err := store.GetContext("test-context")
		require.NoError(t, err)

		clientset, err := kContext.ClientSetWithOwnTransport("")
		require.NoError(t, err)

		_, err = clientset.Discovery().RESTClient().Get().AbsPath("/version").DoRaw(context.Background())
		require.NoError(t, err)

		return <-seen
	}

	require.Equal(t, "user-1", request())

	writeClientCertificate(t, certPath, keyPath, "user-2")
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	require.Equal(t, "user-2", request())
}

// TestCredentialReloadKeepsProxyWhenCertificateRotatesBeforeKey checks that a
// reload between writing a rotated certificate and its key still leaves a
// working proxy, which presents the new certificate once the key is written.
func TestCredentialReloadKeepsProxyWhenCertificateRotatesBeforeKey(t *testing.T) {
	seen := make(chan string, 100)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.TLS.PeerCertificates[0].Subject.CommonName
	}))
	server.TLS = &tls.Config{ClientAuth: tls.RequireAnyClientCert}
	server.StartTLS()
	t.Cleanup(server.Close)

	certPath := filepath.Join(t.TempDir(), "client.crt")
	keyPath := filepath.Join(t.TempDir(), "client.key")
	writeClientCertificate(t, certPath, keyPath, "user-1")

	newCertPath := filepath.Join(t.TempDir(), "client.crt")
	newKeyPath := filepath.Join(t.TempDir(), "client.key")
	writeClientCertificate(t, newCertPath, newKeyPath, "user-2")

	kubeConfigPath := writeKubeConfigForServer(t, server,
		&clientcmdapi.AuthInfo{ClientCertificate: certPath, ClientKey: keyPath})

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, store)
	require.Equal(t, "user-1", <-seen)

	// The watcher reloads on the certificate write, before the key is written.
	require.NoError(t, os.Rename(newCertPath, certPath))
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))
	require.NoError(t, os.Rename(newKeyPath, keyPath))

	kContext, err := store.GetContext("test-context")
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		rr := httptest.NewRecorder()
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/namespaces", nil)
		require.NoError(t, kContext.ProxyRequest(rr, req))

		return rr.Code == http.StatusOK && <-seen == "user-2"
	}, 10*time.Second, 200*time.Millisecond)
}

// TestProxyPresentsRotatedClientCertificateWithoutReload checks that a proxy
// keeps client-go's reloading of rotated client certificate files when its
// context is not reloaded: a dynamic cluster, which the watcher does not
// reload, or a kubeconfig context whose reload did not happen, for example
// because the watcher failed to start.
func TestProxyPresentsRotatedClientCertificateWithoutReload(t *testing.T) {
	// client-go reads this when the proxy's transport is created, and that
	// transport's reloader keeps polling the files after the test. Keep the
	// interval long enough not to flood the test output.
	refresh := transport.CertCallbackRefreshDuration
	transport.CertCallbackRefreshDuration = time.Second

	t.Cleanup(func() { transport.CertCallbackRefreshDuration = refresh })

	for name, source := range map[string]int{"dynamic": kubeconfig.DynamicCluster, "kubeconfig": kubeconfig.KubeConfig} {
		t.Run(name, func(t *testing.T) {
			seen := make(chan string, 100)
			server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seen <- r.TLS.PeerCertificates[0].Subject.CommonName
			}))
			server.TLS = &tls.Config{ClientAuth: tls.RequireAnyClientCert}
			server.StartTLS()
			t.Cleanup(server.Close)

			certPath := filepath.Join(t.TempDir(), "client.crt")
			keyPath := filepath.Join(t.TempDir(), "client.key")
			writeClientCertificate(t, certPath, keyPath, "user-1")

			kubeConfigPath := writeKubeConfigForServer(t, server,
				&clientcmdapi.AuthInfo{ClientCertificate: certPath, ClientKey: keyPath})

			store := kubeconfig.NewContextStore()
			require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, source, nil))

			proxyThroughContext(t, store)
			require.Equal(t, "user-1", <-seen)

			writeClientCertificate(t, certPath, keyPath, "user-2")

			require.Eventually(t, func() bool {
				proxyThroughContext(t, store)

				return <-seen == "user-2"
			}, 10*time.Second, 200*time.Millisecond)
		})
	}
}

// reloadCounter counts the contexts the store stores, so a test can check
// whether a call reloaded them.
func reloadCounter(store kubeconfig.ContextStore) func() int {
	var (
		mu    sync.Mutex
		count int
	)

	store.AddListener(func() {
		mu.Lock()
		count++
		mu.Unlock()
	})

	return func() int {
		mu.Lock()
		defer mu.Unlock()

		return count
	}
}

// TestLoadAndWatchFilesReloadsBeforeReturning checks that the startup reload
// is done when LoadAndWatchFiles returns. Headlamp loads the dynamic clusters
// after it, and they must still replace kubeconfig contexts of the same name,
// rather than race with the reload.
func TestLoadAndWatchFilesReloadsBeforeReturning(t *testing.T) {
	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{Token: "token"}
	config.Contexts["shared-name"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}
	config.Contexts["dropped-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}

	kubeConfigPath := filepath.Join(t.TempDir(), "kubeconfig")
	require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	// Changed after the contexts were loaded, so only the startup reload sees it.
	delete(config.Contexts, "dropped-context")
	require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	returned := make(chan struct{})

	go func() {
		kubeconfig.LoadAndWatchFiles(ctx, store, kubeConfigPath, kubeconfig.KubeConfig, nil)
		close(returned)
	}()

	select {
	case <-returned:
	case <-time.After(10 * time.Second):
		t.Fatal("LoadAndWatchFiles should return once it watches the files")
	}

	_, err := store.GetContext("dropped-context")
	require.Error(t, err, "the startup reload should be done when LoadAndWatchFiles returns")

	require.NoError(t, store.AddContext(&kubeconfig.Context{Name: "shared-name", Source: kubeconfig.DynamicCluster}))

	shared, err := store.GetContext("shared-name")
	require.NoError(t, err)
	require.Equal(t, kubeconfig.DynamicCluster, shared.Source)
}

// TestSyncContextsKeepsProxyWhileCredentialFileIsMissing checks that a reload
// while a token file is missing, as in a remove-and-recreate rotation, keeps
// the context and its working proxy, and that the reload once the file is
// back replaces it.
func TestSyncContextsKeepsProxyWhileCredentialFileIsMissing(t *testing.T) {
	seen := make(chan string, 10)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.Header.Get("Authorization")
	}))
	t.Cleanup(server.Close)

	tokenPath := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenPath, []byte("token-1"), 0o600))

	kubeConfigPath := writeKubeConfigForServer(t, server, &clientcmdapi.AuthInfo{TokenFile: tokenPath})

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	stored, err := store.GetContext("test-context")
	require.NoError(t, err)

	require.NoError(t, os.Remove(tokenPath))
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	kept, err := store.GetContext("test-context")
	require.NoError(t, err)
	require.Same(t, stored, kept, "the context should be kept while its token file is missing")

	proxyThroughContext(t, store)
	require.Equal(t, "Bearer token-1", <-seen)

	require.NoError(t, os.WriteFile(tokenPath, []byte("token-2"), 0o600))
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	proxyThroughContext(t, store)
	require.Equal(t, "Bearer token-2", <-seen)
}

// writeTokenFileKubeConfig writes a kubeconfig whose context uses tokenPath
// and, if customName is set, is renamed to it in Headlamp.
func writeTokenFileKubeConfig(t *testing.T, kubeConfigPath, tokenPath, customName string) {
	t.Helper()

	extensions := ""
	if customName != "" {
		extensions = `
    extensions:
    - name: headlamp_info
      extension:
        customName: ` + customName
	}

	require.NoError(t, os.WriteFile(kubeConfigPath, []byte(`apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://127.0.0.1:6443
users:
- name: test-user
  user:
    tokenFile: `+tokenPath+`
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user`+extensions+"\n"), 0o600))
}

// TestSyncContextsKeepsRenamedContextWhileCredentialFileIsMissing checks that
// a context renamed in Headlamp, which is stored under its custom name, is
// also kept while its token file is missing.
func TestSyncContextsKeepsRenamedContextWhileCredentialFileIsMissing(t *testing.T) {
	tempDir := t.TempDir()
	tokenPath := filepath.Join(tempDir, "token")
	require.NoError(t, os.WriteFile(tokenPath, []byte("token-1"), 0o600))

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	writeTokenFileKubeConfig(t, kubeConfigPath, tokenPath, "renamed-context")

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	stored, err := store.GetContext("renamed-context")
	require.NoError(t, err)

	require.NoError(t, os.Remove(tokenPath))
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	kept, err := store.GetContext("renamed-context")
	require.NoError(t, err)
	require.Same(t, stored, kept, "the renamed context should be kept while its token file is missing")
}

// TestSyncContextsKeepsContextOfLastKubeConfigWhileCredentialFileIsMissing
// checks two kubeconfigs with a context of the same name, where the one of
// the last kubeconfig is stored. While its token file is missing, it is kept,
// rather than replaced by the other kubeconfig's context.
func TestSyncContextsKeepsContextOfLastKubeConfigWhileCredentialFileIsMissing(t *testing.T) {
	tempDir := t.TempDir()

	names := []string{"first", "last"}
	kubeConfigPaths := make([]string, 0, len(names))
	tokenPaths := make([]string, 0, len(names))

	for _, name := range names {
		tokenPath := filepath.Join(tempDir, name+"-token")
		require.NoError(t, os.WriteFile(tokenPath, []byte(name), 0o600))

		kubeConfigPath := filepath.Join(tempDir, name+"-kubeconfig")
		writeTokenFileKubeConfig(t, kubeConfigPath, tokenPath, "")

		kubeConfigPaths = append(kubeConfigPaths, kubeConfigPath)
		tokenPaths = append(tokenPaths, tokenPath)
	}

	paths := strings.Join(kubeConfigPaths, string(os.PathListSeparator))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, paths, kubeconfig.KubeConfig, nil))

	stored, err := store.GetContext("test-context")
	require.NoError(t, err)
	require.Equal(t, tokenPaths[1], stored.AuthInfo.TokenFile)

	require.NoError(t, os.Remove(tokenPaths[1]))
	require.NoError(t, kubeconfig.SyncContexts(store, paths, kubeconfig.KubeConfig, nil))

	kept, err := store.GetContext("test-context")
	require.NoError(t, err)
	require.Same(t, stored, kept, "the last kubeconfig's context should be kept while its token file is missing")
}

// TestSyncContextsReplacesContextWithNewMissingCredentialFile checks that a
// context changed to use a credential file that does not exist yet is not
// kept on its old one. Only the stored context's files are watched, so the
// new file would never be noticed.
func TestSyncContextsReplacesContextWithNewMissingCredentialFile(t *testing.T) {
	tempDir := t.TempDir()
	oldTokenPath := filepath.Join(tempDir, "old-token")
	require.NoError(t, os.WriteFile(oldTokenPath, []byte("token-1"), 0o600))

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	writeTokenFileKubeConfig(t, kubeConfigPath, oldTokenPath, "")

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	newTokenPath := filepath.Join(tempDir, "new-token")
	writeTokenFileKubeConfig(t, kubeConfigPath, newTokenPath, "")
	require.NoError(t, kubeconfig.SyncContexts(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	reloaded, err := store.GetContext("test-context")
	require.NoError(t, err)
	require.Equal(t, newTokenPath, reloaded.AuthInfo.TokenFile)
}

// TestReAddMissingFilesCleansKubeConfigPath checks that a kubeconfig path that
// is absolute but not clean, which fsnotify cleans when watching it, is not
// watched again, and the contexts reloaded, on every reconciliation.
func TestReAddMissingFilesCleansKubeConfigPath(t *testing.T) {
	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{Token: "token"}
	config.Contexts["test-context"] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: "test-user"}

	tempDir := t.TempDir()
	require.NoError(t, clientcmd.WriteToFile(*config, filepath.Join(tempDir, "kubeconfig")))

	kubeConfigPath := tempDir + string(filepath.Separator) + string(filepath.Separator) + "kubeconfig"

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	fsWatcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = fsWatcher.Close() }()

	watcher := kubeconfig.NewFileWatcher(fsWatcher)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	reloads := reloadCounter(store)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)
	require.Zero(t, reloads(), "an unchanged kubeconfig should not be reloaded")
}

// TestReAddMissingFilesWatchesSymlinksToOneFile checks two credential paths
// that are symlinks to one file. On Linux they share one watch, which fsnotify
// lists under the first path only. That must not make every reconciliation
// watch the second path again and reload, and retargeting either symlink must
// still reload.
func TestReAddMissingFilesWatchesSymlinksToOneFile(t *testing.T) {
	tempDir := t.TempDir()

	target := filepath.Join(tempDir, "token")
	require.NoError(t, os.WriteFile(target, []byte("token"), 0o600))

	links := []string{filepath.Join(tempDir, "token-a"), filepath.Join(tempDir, "token-b")}
	for _, link := range links {
		if err := os.Symlink(target, link); err != nil {
			t.Skipf("symlinks are not supported here: %v", err)
		}
	}

	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://127.0.0.1:6443"}

	for i, link := range links {
		user := "user-" + string(rune('a'+i))
		config.AuthInfos[user] = &clientcmdapi.AuthInfo{TokenFile: link}
		config.Contexts["context-"+string(rune('a'+i))] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: user}
	}

	kubeConfigPath := filepath.Join(tempDir, "kubeconfig")
	require.NoError(t, clientcmd.WriteToFile(*config, kubeConfigPath))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, kubeConfigPath, kubeconfig.KubeConfig, nil))

	fsWatcher, err := fsnotify.NewWatcher()
	require.NoError(t, err)

	defer func() { _ = fsWatcher.Close() }()

	watcher := kubeconfig.NewFileWatcher(fsWatcher)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)

	reloads := reloadCounter(store)

	kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)
	require.Zero(t, reloads(), "unchanged credential files should not be reloaded")

	for _, link := range links {
		newTarget := link + "-target"
		require.NoError(t, os.WriteFile(newTarget, []byte("new-token"), 0o600))

		// Retarget the symlink atomically, keeping the old target.
		tmpLink := link + ".tmp"
		require.NoError(t, os.Symlink(newTarget, tmpLink))
		require.NoError(t, os.Rename(tmpLink, link))

		before := reloads()

		kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)
		require.Greater(t, reloads(), before, "retargeting %s should reload the contexts", link)

		before = reloads()

		kubeconfig.ReAddMissingFiles(watcher, store, kubeConfigPath, kubeconfig.KubeConfig, nil)
		require.Equal(t, before, reloads(), "%s should not be reloaded again after its retarget", link)
	}
}
