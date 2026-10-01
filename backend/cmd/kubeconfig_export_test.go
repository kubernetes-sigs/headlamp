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
	"os"
	"path/filepath"
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

func TestGetClusterKubeconfigManualClusterWithoutAuthInfo(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	// Manually added dynamic clusters are stored without a user stanza
	// (processManualConfig): the context has no user reference and the store
	// holds no AuthInfo. The export must still succeed and simply omit users.
	kubeContext := &kubeconfig.Context{
		Name: "manual-cluster",
		KubeContext: &api.Context{
			Cluster: "manual-cluster",
		},
		Cluster: &api.Cluster{
			Server: "https://manual.example.invalid",
		},
		AuthInfo: nil,
	}
	require.NoError(t, c.KubeConfigStore.AddContext(kubeContext))

	req := newKubeconfigExportRequest("manual-cluster", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	assert.Equal(t, "manual-cluster", exported.CurrentContext)
	assert.Contains(t, exported.Clusters, "manual-cluster")
	assert.Empty(t, exported.AuthInfos)

	// The context must not reference a user that was not exported.
	context := exported.Contexts["manual-cluster"]
	require.NotNil(t, context)
	assert.Empty(t, context.AuthInfo)
}

func TestGetClusterKubeconfigNilAuthInfoWithStaleUserReference(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	// The store may hold a context whose user stanza is missing while the
	// context still names it. The export must clear the dangling reference
	// instead of emitting a context pointing at a nonexistent user.
	kubeContext := &kubeconfig.Context{
		Name: "stale-user-cluster",
		KubeContext: &api.Context{
			Cluster:  "stale-cluster",
			AuthInfo: "missing-user",
		},
		Cluster: &api.Cluster{
			Server: "https://stale.example.invalid",
		},
		AuthInfo: nil,
	}
	require.NoError(t, c.KubeConfigStore.AddContext(kubeContext))

	req := newKubeconfigExportRequest("stale-user-cluster", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	assert.Empty(t, exported.AuthInfos)

	context := exported.Contexts["stale-user-cluster"]
	require.NotNil(t, context)
	assert.Empty(t, context.AuthInfo)
}

func TestGetClusterKubeconfigFlattensFileBackedPaths(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	// Simulate a file-backed context: resolveKubeconfigPaths rewrote the
	// relative CA and client cert/key paths into host-absolute ones, and the
	// token lives in a token file. The export must flatten all of them into
	// inline data so the kubeconfig works on another machine.
	caFile := filepath.Join(t.TempDir(), "ca.crt")
	certFile := filepath.Join(t.TempDir(), "client.crt")
	keyFile := filepath.Join(t.TempDir(), "client.key")
	tokenFile := filepath.Join(t.TempDir(), "token")

	require.NoError(t, os.WriteFile(caFile, []byte("CA-DATA"), 0o600))
	require.NoError(t, os.WriteFile(certFile, []byte("CERT-DATA"), 0o600))
	require.NoError(t, os.WriteFile(keyFile, []byte("KEY-DATA"), 0o600))
	require.NoError(t, os.WriteFile(tokenFile, []byte("TOKEN-DATA\n"), 0o600))

	kubeContext := &kubeconfig.Context{
		Name: "file-backed-cluster",
		KubeContext: &api.Context{
			Cluster:  "file-backed-cluster",
			AuthInfo: "file-backed-user",
		},
		Cluster: &api.Cluster{
			Server:               "https://filebacked.example.invalid",
			CertificateAuthority: caFile,
		},
		AuthInfo: &api.AuthInfo{
			ClientCertificate: certFile,
			ClientKey:         keyFile,
			TokenFile:         tokenFile,
		},
		Source: kubeconfig.KubeConfig,
	}
	require.NoError(t, c.KubeConfigStore.AddContext(kubeContext))

	req := newKubeconfigExportRequest("file-backed-cluster", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	cluster := exported.Clusters["file-backed-cluster"]
	require.NotNil(t, cluster)
	assert.Equal(t, []byte("CA-DATA"), cluster.CertificateAuthorityData)
	assert.Empty(t, cluster.CertificateAuthority)

	user := exported.AuthInfos["file-backed-user"]
	require.NotNil(t, user)
	assert.Equal(t, []byte("CERT-DATA"), user.ClientCertificateData)
	assert.Empty(t, user.ClientCertificate)
	assert.Equal(t, []byte("KEY-DATA"), user.ClientKeyData)
	assert.Empty(t, user.ClientKey)
	assert.Equal(t, "TOKEN-DATA", user.Token)
	assert.Empty(t, user.TokenFile)

	// The exported YAML must not reference any host paths.
	body := recorder.Body.String()
	assert.NotContains(t, body, caFile)
	assert.NotContains(t, body, certFile)
	assert.NotContains(t, body, keyFile)
	assert.NotContains(t, body, tokenFile)
}

func TestGetClusterKubeconfigKeepsPathsWhenFilesUnreadable(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	// Path-referenced material whose files are not readable on this host is
	// kept verbatim (matching what Headlamp itself loaded) rather than being
	// silently dropped from the export.
	kubeContext := &kubeconfig.Context{
		Name: "unreadable-cluster",
		KubeContext: &api.Context{
			Cluster:  "unreadable-cluster",
			AuthInfo: "unreadable-user",
		},
		Cluster: &api.Cluster{
			Server:               "https://unreadable.example.invalid",
			CertificateAuthority: "/does/not/exist/ca.crt",
		},
		AuthInfo: &api.AuthInfo{
			ClientCertificate: "/does/not/exist/client.crt",
			ClientKey:         "/does/not/exist/client.key",
			TokenFile:         "/does/not/exist/token",
		},
		Source: kubeconfig.KubeConfig,
	}
	require.NoError(t, c.KubeConfigStore.AddContext(kubeContext))

	req := newKubeconfigExportRequest("unreadable-cluster", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	cluster := exported.Clusters["unreadable-cluster"]
	require.NotNil(t, cluster)
	assert.Equal(t, "/does/not/exist/ca.crt", cluster.CertificateAuthority)

	user := exported.AuthInfos["unreadable-user"]
	require.NotNil(t, user)
	assert.Equal(t, "/does/not/exist/client.crt", user.ClientCertificate)
	assert.Equal(t, "/does/not/exist/client.key", user.ClientKey)
	assert.Equal(t, "/does/not/exist/token", user.TokenFile)
}

func TestGetClusterKubeconfigKeepsExecCredentialsUntouched(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	// Exec-based credentials are not path-referenced on this host; the export
	// must keep them verbatim so they keep working wherever the plugin is
	// installed.
	execConfig := &api.ExecConfig{
		Command:         "aws",
		Args:            []string{"eks", "get-token"},
		APIVersion:      "client.authentication.k8s.io/v1",
		InteractiveMode: api.NeverExecInteractiveMode,
	}
	kubeContext := &kubeconfig.Context{
		Name: "exec-cluster",
		KubeContext: &api.Context{
			Cluster:  "exec-cluster",
			AuthInfo: "exec-user",
		},
		Cluster: &api.Cluster{
			Server: "https://exec.example.invalid",
		},
		AuthInfo: &api.AuthInfo{
			Exec: execConfig,
		},
	}
	require.NoError(t, c.KubeConfigStore.AddContext(kubeContext))

	req := newKubeconfigExportRequest("exec-cluster", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	user := exported.AuthInfos["exec-user"]
	require.NotNil(t, user)
	require.NotNil(t, user.Exec)
	assert.Equal(t, "aws", user.Exec.Command)
	assert.Equal(t, []string{"eks", "get-token"}, user.Exec.Args)
}

func TestGetClusterKubeconfigDoesNotFlattenClientSuppliedPaths(t *testing.T) {
	c := newKubeconfigExportTestConfig()

	// Regression test: a client-supplied (stateless/dynamic) context must never
	// have its path references read from this host. Otherwise a requester could
	// submit certificate-authority: /etc/passwd and receive the file inlined as
	// certificate-authority-data. The path must be exported verbatim instead.
	secretFile := filepath.Join(t.TempDir(), "secret")
	require.NoError(t, os.WriteFile(secretFile, []byte("HOST-FILE-CONTENTS"), 0o600))

	kubeContext := &kubeconfig.Context{
		Name: "stateless-cluster",
		KubeContext: &api.Context{
			Cluster:  "stateless-cluster",
			AuthInfo: "stateless-user",
		},
		Cluster: &api.Cluster{
			Server:               "https://stateless.example.invalid",
			CertificateAuthority: secretFile,
		},
		AuthInfo: &api.AuthInfo{
			ClientCertificate: secretFile,
			ClientKey:         secretFile,
			TokenFile:         secretFile,
		},
		Source: kubeconfig.DynamicCluster,
	}
	require.NoError(t, c.KubeConfigStore.AddContext(kubeContext))

	req := newKubeconfigExportRequest("stateless-cluster", "", "")
	recorder := httptest.NewRecorder()

	c.getClusterKubeconfig(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	// The readable host file must not be inlined anywhere in the export.
	assert.NotContains(t, recorder.Body.String(), "HOST-FILE-CONTENTS")

	exported, err := clientcmd.Load(recorder.Body.Bytes())
	require.NoError(t, err)

	cluster := exported.Clusters["stateless-cluster"]
	require.NotNil(t, cluster)
	assert.Empty(t, cluster.CertificateAuthorityData)
	assert.Equal(t, secretFile, cluster.CertificateAuthority)

	user := exported.AuthInfos["stateless-user"]
	require.NotNil(t, user)
	assert.Empty(t, user.ClientCertificateData)
	assert.Equal(t, secretFile, user.ClientCertificate)
	assert.Empty(t, user.ClientKeyData)
	assert.Equal(t, secretFile, user.ClientKey)
	assert.Empty(t, user.Token)
	assert.Equal(t, secretFile, user.TokenFile)
}
