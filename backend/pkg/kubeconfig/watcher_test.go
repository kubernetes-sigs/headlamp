package kubeconfig_test

import (
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

//nolint:funlen
func TestWatchAndLoadFiles(t *testing.T) {
	paths := []string{"./test_data/kubeconfig1", "./test_data/kubeconfig2"}

	var path string
	if runtime.GOOS == "windows" {
		path = strings.Join(paths, ";")
	} else {
		path = strings.Join(paths, ":")
	}

	kubeConfigStore := kubeconfig.NewContextStore()

	go kubeconfig.LoadAndWatchFiles(kubeConfigStore, path, kubeconfig.KubeConfig, nil)

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
	t.Run("StopContextWatcher callback", func(t *testing.T) {
		// Sleep to ensure watcher is ready
		time.Sleep(2 * time.Second)

		stoppedContexts := make(map[string]int)

		var mu sync.Mutex

		callbackInvoked := make(chan string, 10)

		kubeconfig.StopContextWatcher = func(contextName string) {
			mu.Lock()
			stoppedContexts[contextName]++
			count := stoppedContexts[contextName]
			mu.Unlock()
			select {
			case callbackInvoked <- contextName:
			default:
			}

			t.Logf("StopContextWatcher called for context: %s (count: %d)", contextName, count)
		}
		defer func() {
			kubeconfig.StopContextWatcher = nil
		}()

		config, err := clientcmd.LoadFromFile("./test_data/kubeconfig1")
		require.NoError(t, err)

		testContextName := "test-context-for-callback"
		config.Contexts[testContextName] = &clientcmdapi.Context{
			Cluster:  "docker-desktop",
			AuthInfo: "docker-desktop",
		}

		err = clientcmd.WriteToFile(*config, "./test_data/kubeconfig1")
		require.NoError(t, err)

		// Wait for context to be added
		found := false

		for i := 0; i < 20; i++ {
			context, err := kubeConfigStore.GetContext(testContextName)
			if err == nil && context != nil {
				found = true

				t.Logf("Context %s found in store after %d attempts", testContextName, i+1)

				break
			}

			time.Sleep(500 * time.Millisecond)
		}

		require.True(t, found, "Context should have been added")

		time.Sleep(1 * time.Second)

		for len(callbackInvoked) > 0 {
			<-callbackInvoked
		}

		t.Logf("Removing context %s from kubeconfig file", testContextName)

		config, err = clientcmd.LoadFromFile("./test_data/kubeconfig1")
		require.NoError(t, err)
		delete(config.Contexts, testContextName)

		err = clientcmd.WriteToFile(*config, "./test_data/kubeconfig1")
		require.NoError(t, err)

		var removedContext string
		select {
		case removedContext = <-callbackInvoked:
			t.Logf("Received callback for context: %s", removedContext)
		case <-time.After(10 * time.Second):
			t.Fatal("Timeout waiting for StopContextWatcher callback")
		}

		require.Equal(t, testContextName,
			removedContext, "StopContextWatcher should have been called for the removed context")

		_, err = kubeConfigStore.GetContext(testContextName)
		require.Error(t, err, "Context should have been removed from store")

		mu.Lock()
		callCount := stoppedContexts[testContextName]
		mu.Unlock()
		t.Logf("StopContextWatcher was called %d time(s) for %s", callCount, testContextName)
		require.Greater(t, callCount, 0, "StopContextWatcher should have been called at least once")
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
