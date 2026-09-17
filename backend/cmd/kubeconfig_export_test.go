/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// newKubeconfigExportTestConfig builds a HeadlampConfig with an empty context store
// and dynamic clusters enabled, ready for getClusterKubeconfig tests.
func newKubeconfigExportTestConfig() *HeadlampConfig {
	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				EnableDynamicClusters: true,
				KubeConfigStore:       kubeconfig.NewContextStore(),
			},
			Cache: cache.New[interface{}](),
		},
	}
}

// newKubeconfigExportRequest builds a GET /clusters/{clusterName}/kubeconfig request
// with the stateless headers (base64 kubeconfig + user id) optionally set.
func newKubeconfigExportRequest(clusterName, kubeconfigB64, userID string) *http.Request {
	req := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/clusters/"+clusterName+"/kubeconfig",
		nil,
	)
	req = mux.SetURLVars(req, map[string]string{"clusterName": clusterName})

	if kubeconfigB64 != "" {
		req.Header.Set("KUBECONFIG", kubeconfigB64)
	}

	if userID != "" {
		req.Header.Set("X-HEADLAMP-USER-ID", userID)
	}

	return req
}

// statelessTestKubeconfig is a kubeconfig with one context whose headlamp_info
// extension renames it to "my-display-name".
const statelessTestKubeconfig = `apiVersion: v1
kind: Config
clusters:
- name: real-cluster
  cluster:
    server: https://example.invalid
contexts:
- name: raw-context
  context:
    cluster: real-cluster
    user: real-user
    extensions:
    - name: headlamp_info
      extension:
        customName: my-display-name
users:
- name: real-user
  user:
    token: test-token
current-context: raw-context
`

func TestGetClusterKubeconfigStatelessClusterWithCustomName(t *testing.T) {
	c := newKubeconfigExportTestConfig()
	kubeconfigB64 := base64.StdEncoding.EncodeToString([]byte(statelessTestKubeconfig))

	// The frontend only knows the cluster by its custom (display) name.
	req := newKubeconfigExportRequest("my-display-name", kubeconfigB64, "user-a")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	// The exported kubeconfig must be a standalone, single-context config that
	// points at the original cluster and user, regardless of the custom name.
	assert.Equal(t, "my-display-name", exported.CurrentContext)
	assert.Len(t, exported.Contexts, 1)
	assert.Len(t, exported.Clusters, 1)
	assert.Len(t, exported.AuthInfos, 1)
	assert.Contains(t, exported.Clusters, "real-cluster")
	assert.Contains(t, exported.AuthInfos, "real-user")

	// The stored stateless context is Internal; it must still be exportable by
	// the user that owns it.
	assert.Equal(t, "https://example.invalid", exported.Clusters["real-cluster"].Server)
}

func TestGetClusterKubeconfigFileBackedCluster(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	// Simulate a context loaded from a kubeconfig file on disk (renamed via
	// headlamp_info, so the store key differs from the original context name).
	kubeContext := &kubeconfig.Context{
		Name: "renamed-cluster",
		KubeContext: &api.Context{
			Cluster:  "file-cluster",
			AuthInfo: "file-user",
		},
		Cluster: &api.Cluster{
			Server: "https://file.example.invalid",
		},
		AuthInfo: &api.AuthInfo{
			Token: "file-token",
		},
	}
	require.NoError(t, c.KubeConfigStore.AddContext(kubeContext))

	req := newKubeconfigExportRequest("renamed-cluster", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	assert.Equal(t, "renamed-cluster", exported.CurrentContext)
	assert.Len(t, exported.Contexts, 1)
	assert.Contains(t, exported.Clusters, "file-cluster")
	assert.Equal(t, "https://file.example.invalid", exported.Clusters["file-cluster"].Server)
}

func TestGetClusterKubeconfigClusterNotFound(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	req := newKubeconfigExportRequest("does-not-exist", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	assert.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestGetClusterKubeconfigIsolatedPerUser(t *testing.T) {
	c := newKubeconfigExportTestConfig()
	kubeconfigB64 := base64.StdEncoding.EncodeToString([]byte(statelessTestKubeconfig))

	// user-a registers the stateless context under their own key.
	req := newKubeconfigExportRequest("my-display-name", kubeconfigB64, "user-a")
	recorder := httptest.NewRecorder()
	c.getClusterKubeconfig(recorder, req)
	require.Equal(t, http.StatusOK, recorder.Code)

	// user-b sends a request for the same cluster name without providing a
	// kubeconfig header: no context is registered under their key, so the export
	// must not leak user-a's credentials.
	reqUserB := newKubeconfigExportRequest("my-display-name", "", "user-b")
	recorderUserB := httptest.NewRecorder()

	c.getClusterKubeconfig(recorderUserB, reqUserB)

	assert.Equal(t, http.StatusNotFound, recorderUserB.Code)
	assert.NotContains(t, recorderUserB.Body.String(), "test-token")
}

func TestGetClusterKubeconfigMalformedKubeconfigHeader(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	req := newKubeconfigExportRequest("some-cluster", "not-valid-base64-kubeconfig!!", "user-a")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	assert.Equal(t, http.StatusNotFound, recorder.Code)
	assert.False(t, strings.Contains(recorder.Body.String(), "token"))
}
