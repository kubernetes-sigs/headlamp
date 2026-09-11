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

// twoContextKubeconfig is a kubeconfig with two independent contexts.
const twoContextKubeconfig = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster-a.example.com
  name: cluster-a
- cluster:
    server: https://cluster-b.example.com
  name: cluster-b
contexts:
- context:
    cluster: cluster-a
    user: user-a
  name: context-a
- context:
    cluster: cluster-b
    user: user-b
  name: context-b
current-context: context-a
users:
- name: user-a
  user:
    token: token-a
- name: user-b
  user:
    token: token-b
`

// partiallyWrittenKubeconfig is what twoContextKubeconfig looks like when it is
// read while being rewritten in place: context-b is there but the user entry it
// points at has not been written back yet.
const partiallyWrittenKubeconfig = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster-a.example.com
  name: cluster-a
- cluster:
    server: https://cluster-b.example.com
  name: cluster-b
contexts:
- context:
    cluster: cluster-a
    user: user-a
  name: context-a
- context:
    cluster: cluster-b
    user: user-b
  name: context-b
current-context: context-a
users:
- name: user-a
  user:
    token: token-a
`

// singleContextKubeconfig is twoContextKubeconfig with context-b genuinely removed.
const singleContextKubeconfig = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster-a.example.com
  name: cluster-a
contexts:
- context:
    cluster: cluster-a
    user: user-a
  name: context-a
current-context: context-a
users:
- name: user-a
  user:
    token: token-a
`

// writeKubeconfig writes contents to path, failing the test if it cannot.
func writeKubeconfig(t *testing.T, path, contents string) {
	t.Helper()

	require.NoError(t, os.WriteFile(path, []byte(contents), 0o600))
}

// storeWithBothContexts returns a store loaded from a kubeconfig holding both
// contexts, along with the path of that kubeconfig.
func storeWithBothContexts(t *testing.T) (kubeconfig.ContextStore, string) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "config")
	writeKubeconfig(t, path, twoContextKubeconfig)

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, path, kubeconfig.KubeConfig, nil))

	for _, name := range []string{"context-a", "context-b"} {
		_, err := store.GetContext(name)
		require.NoError(t, err, "%s should be loaded before syncing", name)
	}

	return store, path
}

// A context that fails to load is still in the kubeconfig, it just could not be
// parsed on this pass. Dropping it would leave it missing from the store until
// the next change event or a restart, so it has to survive the sync. See #7154.
func TestSyncContextsKeepsContextsThatFailedToLoad(t *testing.T) {
	store, path := storeWithBothContexts(t)

	writeKubeconfig(t, path, partiallyWrittenKubeconfig)

	err := kubeconfig.SyncContexts(store, path, kubeconfig.KubeConfig, nil)
	require.Error(t, err, "the partial kubeconfig should be reported as a load error")
	require.Contains(t, err.Error(), "context-b")

	_, err = store.GetContext("context-b")
	require.NoError(t, err, "context-b should be kept after failing to load")

	_, err = store.GetContext("context-a")
	require.NoError(t, err, "context-a should be untouched")
}

// Contexts that are really gone from the kubeconfig still have to be removed.
func TestSyncContextsRemovesDeletedContexts(t *testing.T) {
	store, path := storeWithBothContexts(t)

	writeKubeconfig(t, path, singleContextKubeconfig)

	require.NoError(t, kubeconfig.SyncContexts(store, path, kubeconfig.KubeConfig, nil))

	_, err := store.GetContext("context-b")
	require.Error(t, err, "context-b should be removed once it is gone from the kubeconfig")

	_, err = store.GetContext("context-a")
	require.NoError(t, err, "context-a should be untouched")
}

// renamedKubeconfig is twoContextKubeconfig with context-b renamed in Headlamp,
// so the store keys it by its custom name rather than the kubeconfig one.
const renamedKubeconfig = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster-a.example.com
  name: cluster-a
- cluster:
    server: https://cluster-b.example.com
  name: cluster-b
contexts:
- context:
    cluster: cluster-a
    user: user-a
  name: context-a
- context:
    cluster: cluster-b
    user: user-b
    extensions:
    - extension:
        customName: renamed-b
      name: headlamp_info
  name: context-b
current-context: context-a
users:
- name: user-a
  user:
    token: token-a
- name: user-b
  user:
    token: token-b
`

// partiallyWrittenRenamedKubeconfig is renamedKubeconfig caught mid-rewrite, with
// the user entry that context-b points at not written back yet.
const partiallyWrittenRenamedKubeconfig = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster-a.example.com
  name: cluster-a
- cluster:
    server: https://cluster-b.example.com
  name: cluster-b
contexts:
- context:
    cluster: cluster-a
    user: user-a
  name: context-a
- context:
    cluster: cluster-b
    user: user-b
    extensions:
    - extension:
        customName: renamed-b
      name: headlamp_info
  name: context-b
current-context: context-a
users:
- name: user-a
  user:
    token: token-a
`

// A renamed context is stored under its custom name, so a load failure reported
// against the kubeconfig name has to be matched by ClusterID instead. Otherwise
// the failure looks like a context that is gone and the rename gets dropped.
func TestSyncContextsKeepsRenamedContextThatFailedToLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	writeKubeconfig(t, path, renamedKubeconfig)

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, path, kubeconfig.KubeConfig, nil))

	_, err := store.GetContext("renamed-b")
	require.NoError(t, err, "the renamed context should be stored under its custom name")

	writeKubeconfig(t, path, partiallyWrittenRenamedKubeconfig)

	err = kubeconfig.SyncContexts(store, path, kubeconfig.KubeConfig, nil)
	require.Error(t, err, "the partial kubeconfig should be reported as a load error")

	_, err = store.GetContext("renamed-b")
	require.NoError(t, err, "the renamed context should be kept after failing to load")

	_, err = store.GetContext("context-a")
	require.NoError(t, err, "context-a should be untouched")
}

// sharedNameKubeconfig holds a context named like the one in twoContextKubeconfig,
// which kubeconfig supports across files.
const sharedNameKubeconfig = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster-c.example.com
  name: cluster-c
contexts:
- context:
    cluster: cluster-c
    user: user-c
  name: context-b
current-context: context-b
users:
- name: user-c
  user:
    token: token-c
`

// partiallyWrittenSharedNameKubeconfig is sharedNameKubeconfig caught mid-rewrite,
// with the user entry context-b points at not written back yet.
const partiallyWrittenSharedNameKubeconfig = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster-c.example.com
  name: cluster-c
contexts:
- context:
    cluster: cluster-c
    user: user-c
  name: context-b
current-context: context-b
users: []
`

// joinKubeConfigPaths joins paths the way the KUBECONFIG env var does.
func joinKubeConfigPaths(paths ...string) string {
	delimiter := ":"
	if runtime.GOOS == "windows" {
		delimiter = ";"
	}

	return strings.Join(paths, delimiter)
}

// A failure has to be matched against the file it came from. Two kubeconfigs can
// hold a context of the same name, and the stored one belongs to whichever file
// was read last; a failure in the other file says nothing about it, so it must
// not keep it alive once its own file has dropped it.
func TestSyncContextsRemovesDeletedContextDespiteSameNameFailingElsewhere(t *testing.T) {
	dir := t.TempDir()

	otherPath := filepath.Join(dir, "other-config")
	writeKubeconfig(t, otherPath, sharedNameKubeconfig)

	path := filepath.Join(dir, "config")
	writeKubeconfig(t, path, twoContextKubeconfig)

	paths := joinKubeConfigPaths(otherPath, path)

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, paths, kubeconfig.KubeConfig, nil))

	storedB, err := store.GetContext("context-b")
	require.NoError(t, err)
	require.Equal(t, kubeconfig.ContextClusterID(path, "context-b"), storedB.ClusterID,
		"the stored context-b should be the one from the file read last")

	// The other file's context-b fails to load, while the file the stored one
	// came from drops it for real.
	writeKubeconfig(t, otherPath, partiallyWrittenSharedNameKubeconfig)
	writeKubeconfig(t, path, singleContextKubeconfig)

	err = kubeconfig.SyncContexts(store, paths, kubeconfig.KubeConfig, nil)
	require.Error(t, err, "the partial kubeconfig should be reported as a load error")

	_, err = store.GetContext("context-b")
	require.Error(t, err, "context-b should be removed once the file holding it dropped it")

	_, err = store.GetContext("context-a")
	require.NoError(t, err, "context-a should be untouched")
}
