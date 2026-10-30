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

	// Rewrite the token file until the watcher, which may still be starting,
	// reloads the contexts.
	reloaded := false

	for i := 0; i < 30 && !reloaded; i++ {
		require.NoError(t, os.WriteFile(tokenPath, []byte("updated-token"), 0o600))

		select {
		case <-reloadChan:
			reloaded = true
		case <-time.After(200 * time.Millisecond):
		}
	}

	require.True(t, reloaded, "Timeout waiting for watcher to trigger reload on credential file change")

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
