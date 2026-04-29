package kubeconfig_test

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd"
)

const clusterConf = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: dGVzdA==
    server: https://kubernetes.docker.internal:6443
  name: random-cluster-4
contexts:
- context:
    cluster: random-cluster-4
    user: random-cluster-4
  name: random-cluster-4
current-context: random-cluster-4
kind: Config
preferences: {}
users:
- name: random-cluster-4
  user:
  client-certificate-data: dGVzdA==
  client-key-data: dGVzdA==`

func TestWriteToFile(t *testing.T) {
	// create kubeconfig3 file that doesn't exist
	conf, err := clientcmd.Load([]byte(clusterConf))
	require.NoError(t, err)
	require.NotNil(t, conf)

	// write kubeconfig file
	err = kubeconfig.WriteToFile(*conf, "./test_data/")
	assert.NoError(t, err)

	// read kubeconfig file
	apiConf, err := clientcmd.LoadFromFile("./test_data/config")
	require.NoError(t, err)

	// check if the random-cluster-4 context exists
	_, ok := apiConf.Contexts["random-cluster-4"]
	assert.True(t, ok)

	// delete temp kubeconfig file and lock file
	err = os.Remove("./test_data/config")
	require.NoError(t, err)

	err = os.Remove("./test_data/config.lock")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		require.NoError(t, err)
	}
}

// TestWriteToFileMerge covers the merge branch of WriteToFile:
// when a config file already exists, the new config is merged into it.
func TestWriteToFileMerge(t *testing.T) {
	dir := t.TempDir()

	// Seed an initial config so the merge branch is taken.
	initial, err := clientcmd.Load([]byte(clusterConf))
	require.NoError(t, err)

	err = kubeconfig.WriteToFile(*initial, dir)
	require.NoError(t, err)

	// Write a second config with a different context.
	second, err := clientcmd.Load([]byte(`apiVersion: v1
clusters:
- cluster:
    server: https://second-cluster:6443
  name: second-cluster
contexts:
- context:
    cluster: second-cluster
    user: second-user
  name: second-context
current-context: second-context
kind: Config
users:
- name: second-user
  user:
    token: second-token`))
	require.NoError(t, err)

	err = kubeconfig.WriteToFile(*second, dir)
	require.NoError(t, err)

	// The resulting file must contain both contexts.
	merged, err := clientcmd.LoadFromFile(filepath.Join(dir, "config"))
	require.NoError(t, err)

	_, hasOriginal := merged.Contexts["random-cluster-4"]
	assert.True(t, hasOriginal, "expected original context to survive merge")

	_, hasSecond := merged.Contexts["second-context"]
	assert.True(t, hasSecond, "expected new context to be merged in")
}

// runConcurrentWriteConfig spawns the given number of goroutines, each writing
// a unique kubeconfig context via WriteToFile. A barrier ensures all goroutines
// start simultaneously to maximise contention on the file lock.
func runConcurrentWriteConfig(dir string, errs chan error, goroutines int) {
	// Use a barrier so all goroutines call WriteToFile at roughly the same
	// time, stressing concurrent callers and validating the lock/merge
	// behavior under contention.
	//
	// Each goroutine signals readiness via the "ready" WaitGroup, then
	// waits on startCh. Once all goroutines are ready, the main goroutine
	// closes startCh to release them at roughly the same time.
	var (
		wg    sync.WaitGroup
		ready sync.WaitGroup
	)

	startCh := make(chan struct{})

	ready.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			cfg, err := clientcmd.Load([]byte(fmt.Sprintf(`apiVersion: v1
clusters:
- cluster:
    server: https://concurrent-%d:6443
  name: concurrent-%d
contexts:
- context:
    cluster: concurrent-%d
    user: user-%d
  name: concurrent-%d
kind: Config
users:
- name: user-%d
  user:
    token: token-%d`, i, i, i, i, i, i, i)))

			// Signal readiness, then wait for the start signal.
			ready.Done()
			<-startCh

			if err != nil {
				errs <- err

				return
			}

			errs <- kubeconfig.WriteToFile(*cfg, dir)
		}(i)
	}

	// Wait until every goroutine is parked, then release simultaneously.
	ready.Wait()
	close(startCh)

	wg.Wait()
}

// TestWriteToFileConcurrentMerge verifies that concurrent callers can
// safely invoke WriteToFile and that all merged contexts are preserved.
// Writes are serialized by the file lock, so this validates merge
// correctness under concurrent callers rather than temp-file collisions.
func TestWriteToFileConcurrentMerge(t *testing.T) {
	dir := t.TempDir()

	// Seed an initial config so every goroutine takes the merge branch.
	initial, err := clientcmd.Load([]byte(clusterConf))
	require.NoError(t, err)

	err = kubeconfig.WriteToFile(*initial, dir)
	require.NoError(t, err)

	const goroutines = 5

	errs := make(chan error, goroutines)

	runConcurrentWriteConfig(dir, errs, goroutines)

	close(errs)

	for err := range errs {
		assert.NoError(t, err)
	}

	// Verify all contexts survived the concurrent merges.
	merged, err := clientcmd.LoadFromFile(filepath.Join(dir, "config"))
	require.NoError(t, err)

	_, hasSeed := merged.Contexts["random-cluster-4"]
	assert.True(t, hasSeed, "seed context must survive concurrent merges")

	for i := 0; i < goroutines; i++ {
		ctxName := fmt.Sprintf("concurrent-%d", i)
		_, hasCtx := merged.Contexts[ctxName]
		assert.Truef(t, hasCtx, "context %s must survive concurrent merges", ctxName)
	}
}

func TestRemoveContextFromFile(t *testing.T) {
	data, err := os.ReadFile("./test_data/kubeconfig1")
	require.NoError(t, err)
	require.NotNil(t, data)

	err = os.WriteFile("./test_data/config_copy", data, 0o600) //nolint:gosec
	require.NoError(t, err)

	// remove context from kubeconfig file
	err = kubeconfig.RemoveContextFromFile("minikube", "./test_data/config_copy")
	assert.NoError(t, err)

	apiConf, err := clientcmd.LoadFromFile("./test_data/config_copy")
	require.NoError(t, err)

	// check if the minikube context exists
	_, ok := apiConf.Contexts["minikube"]
	assert.False(t, ok)

	// delete temp kubeconfig file and lock file
	err = os.Remove("./test_data/config_copy")
	require.NoError(t, err)

	err = os.Remove("./test_data/config_copy.lock")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		require.NoError(t, err)
	}
}
