package kubeconfig_test

import (
	"os"
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

	// check if the minikube context exists
	_, ok := apiConf.Contexts["random-cluster-4"]
	assert.True(t, ok)

	// delete temp kubeconfig file
	err = os.Remove("./test_data/config")
	require.NoError(t, err)
}

func TestRemoveContextFromFile(t *testing.T) {
	data, err := os.ReadFile("./test_data/kubeconfig1")
	require.NoError(t, err)
	require.NotNil(t, data)

	err = os.WriteFile("./test_data/config_copy", data, 0o600)
	require.NoError(t, err)

	// remove context from kubeconfig file
	err = kubeconfig.RemoveContextFromFile("minikube", "./test_data/config_copy")
	assert.NoError(t, err)

	apiConf, err := clientcmd.LoadFromFile("./test_data/config_copy")
	require.NoError(t, err)

	// check if the minikube context exists
	_, ok := apiConf.Contexts["minikube"]
	assert.False(t, ok)

	// delete temp kubeconfig file
	err = os.Remove("./test_data/config_copy")
	require.NoError(t, err)
}
