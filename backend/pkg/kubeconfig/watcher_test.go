package kubeconfig_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

//nolint:funlen
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

//nolint:funlen
func TestWatchAndLoadReferencedCredentialFiles(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	// Create a temp directory for the test files
	tempDir, err := os.MkdirTemp("", "headlamp-watcher-test")
	require.NoError(t, err)

	defer func() { _ = os.RemoveAll(tempDir) }()

	// Create a mock token file
	tokenPath := filepath.Join(tempDir, "token")
	err = os.WriteFile(tokenPath, []byte("initial-token"), 0o600)
	require.NoError(t, err)

	// Create a mock kubeconfig referencing the token file
	kubeconfigPath := filepath.Join(tempDir, "kubeconfig")
	config := clientcmdapi.NewConfig()
	config.Clusters["test-cluster"] = &clientcmdapi.Cluster{
		Server: "https://127.0.0.1:6443",
	}
	config.AuthInfos["test-user"] = &clientcmdapi.AuthInfo{
		TokenFile: tokenPath,
	}
	config.Contexts["test-context"] = &clientcmdapi.Context{
		Cluster:  "test-cluster",
		AuthInfo: "test-user",
	}
	config.CurrentContext = "test-context"

	err = clientcmd.WriteToFile(*config, kubeconfigPath)
	require.NoError(t, err)

	kubeConfigStore := kubeconfig.NewContextStore()

	// Perform initial load as done by the Headlamp server
	err = kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, kubeconfigPath, kubeconfig.KubeConfig, nil)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go kubeconfig.LoadAndWatchFiles(ctx, kubeConfigStore, kubeconfigPath, kubeconfig.KubeConfig, nil)

	// Verify context exists
	_, err = kubeConfigStore.GetContext("test-context")
	require.NoError(t, err)

	// Add listener to track notifications
	reloadChan := make(chan struct{}, 10)

	kubeConfigStore.AddListener(func() {
		select {
		case reloadChan <- struct{}{}:
		default:
		}
	})

	// Modify the referenced token file with retry sync until reload triggers
	reloaded := false

	for i := 0; i < 30; i++ {
		err = os.WriteFile(tokenPath, []byte("updated-token"), 0o600)
		require.NoError(t, err)

		select {
		case <-reloadChan:
			reloaded = true
		case <-time.After(200 * time.Millisecond):
		}

		if reloaded {
			break
		}
	}

	require.True(t, reloaded, "Timeout waiting for watcher to trigger reload on credential file change")
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
