/*
Copyright 2026 The Kubernetes Authors.

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
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterdiscovery"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestReadServiceAccountNamespace(t *testing.T) {
	ns, err := readServiceAccountNamespace()
	if err != nil {
		assert.Empty(t, ns)
		assert.ErrorIs(t, err, os.ErrNotExist)
	} else {
		assert.NotEmpty(t, ns)
	}
}

func TestGetOIDCLogoutProviderInsecureAndCustomIssuer(t *testing.T) {
	const customIssuer = "https://custom-issuer.example.com"

	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/openid-configuration" {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                                customIssuer,
			"authorization_endpoint":                customIssuer + "/auth",
			"token_endpoint":                        customIssuer + "/token",
			"jwks_uri":                              customIssuer + "/jwks",
			"end_session_endpoint":                  customIssuer + "/logout",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	}))
	defer srv.Close()

	cfg := newCmdTestConfig(t)
	cfg.Insecure = true
	cfg.OidcValidatorIdpIssuerURL = customIssuer

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/oidc/logout", nil)
	provider, err := getOIDCLogoutProvider(cfg, req, &kubeconfig.OidcConfig{
		IdpIssuerURL: srv.URL,
	})
	require.NoError(t, err)
	require.NotNil(t, provider)

	var claims struct {
		EndSessionEndpoint string `json:"end_session_endpoint"`
	}
	require.NoError(t, provider.Claims(&claims))
	assert.Equal(t, customIssuer+"/logout", claims.EndSessionEndpoint)
}

func TestStartClusterDiscoveryAndDiscoverySources(t *testing.T) {
	cfg := newCmdTestConfig(t)

	// No sources enabled -> no-op.
	require.NoError(t, startClusterDiscovery(context.Background(), cfg))

	sources := clusterdiscovery.BuiltinSources().Sources()
	require.NotEmpty(t, sources)
	sourceID := sources[0].Descriptor().ID

	// In-cluster mode without pod environment returns an error.
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")

	cfg.UseInCluster = true
	cfg.DiscoverySources = map[string]clusterdiscovery.Settings{
		sourceID: {Enabled: true},
	}
	err := startClusterDiscovery(context.Background(), cfg)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "in-cluster discovery config")

	// Out-of-cluster mode starts discovery runners and stops on context cancel.
	cfg.UseInCluster = false
	cfg.OidcClientID = "cid"
	cfg.OidcIdpIssuerURL = "https://idp.example.com"
	cfg.OidcScopes = []string{"openid"}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	require.NoError(t, startClusterDiscovery(ctx, cfg))
	cancel()
}

func TestSetupInClusterContext(t *testing.T) {
	t.Run("missing service account token does not add context", func(t *testing.T) {
		cfg := newCmdTestConfig(t)
		cfg.InClusterContextName = "in-cluster-missing"
		cfg.ServiceAccountTokenPath = filepath.Join(t.TempDir(), "missing-token")
		cfg.UnsafeUseServiceAccountToken = true

		setupInClusterContext(cfg)

		_, err := cfg.KubeConfigStore.GetContext("in-cluster-missing")
		require.Error(t, err)
	})

	t.Run("in-cluster env without pod token file logs error without adding context", func(t *testing.T) {
		t.Setenv("KUBERNETES_SERVICE_HOST", "127.0.0.1")
		t.Setenv("KUBERNETES_SERVICE_PORT", "6443")

		cfg := newCmdTestConfig(t)
		cfg.InClusterContextName = "in-cluster-test"
		cfg.ServiceAccountTokenPath = filepath.Join(t.TempDir(), "token")
		cfg.UnsafeUseServiceAccountToken = true

		setupInClusterContext(cfg)

		_, err := cfg.KubeConfigStore.GetContext("in-cluster-test")
		require.Error(t, err)
	})
}

func TestHandleClearToken(t *testing.T) {
	cfg := newCmdTestConfig(t)
	encoded := base64.RawURLEncoding.EncodeToString([]byte("minikube"))

	t.Run("rejects non-JSON content type", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/x/clear-token", nil)
		req = mux.SetURLVars(req, map[string]string{"encodedClusterName": encoded})
		rr := httptest.NewRecorder()

		cfg.handleClearToken(rr, req)
		assert.Equal(t, http.StatusUnsupportedMediaType, rr.Code)
	})

	t.Run("rejects invalid encoded cluster name", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/bad/clear-token", nil)
		req.Header.Set("Content-Type", "application/json")
		req = mux.SetURLVars(req, map[string]string{"encodedClusterName": "!!!"})
		rr := httptest.NewRecorder()

		cfg.handleClearToken(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("clears cookie on valid request", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/x/clear-token", nil)
		req.Header.Set("Content-Type", "application/json")
		req = mux.SetURLVars(req, map[string]string{"encodedClusterName": encoded})
		rr := httptest.NewRecorder()

		cfg.handleClearToken(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
		assert.NotEmpty(t, rr.Result().Cookies())
	})
}

func TestHandleSetTokenEdgeCases(t *testing.T) {
	cfg := newCmdTestConfig(t)

	t.Run("missing clusterName returns 400", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters//set-token",
			strings.NewReader(`{"token":"abc"}`))
		rr := httptest.NewRecorder()

		cfg.handleSetToken(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("empty token clears cookie and returns 200", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/dev/set-token",
			strings.NewReader(`{"token":""}`))
		req = mux.SetURLVars(req, map[string]string{"clusterName": "dev"})
		rr := httptest.NewRecorder()

		cfg.handleSetToken(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
		assert.NotEmpty(t, rr.Result().Cookies())
	})

	t.Run("oversized token returns 413", func(t *testing.T) {
		huge := strings.Repeat("a", 130000)
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/dev/set-token",
			strings.NewReader(`{"token":"`+huge+`"}`))
		req = mux.SetURLVars(req, map[string]string{"clusterName": "dev"})
		rr := httptest.NewRecorder()

		cfg.handleSetToken(rr, req)
		assert.Equal(t, http.StatusRequestEntityTooLarge, rr.Code)
	})
}

func TestGetClustersFilteringAndErrors(t *testing.T) {
	cfg := newCmdTestConfig(t)

	require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name:  "broken-ctx",
		Error: "bad kubeconfig",
	}))
	require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name:     "internal-ctx",
		Internal: true,
		Cluster:  &api.Cluster{Server: "https://internal.example.com"},
		KubeContext: &api.Context{
			Cluster: "internal-ctx",
		},
	}))
	require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "nil-kubecontext",
		Cluster:     &api.Cluster{Server: "https://nil.example.com"},
		KubeContext: nil,
	}))
	require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "valid-ctx",
		Cluster:     &api.Cluster{Server: "https://valid.example.com"},
		KubeContext: &api.Context{Cluster: "valid-ctx", Namespace: "default"},
	}))

	clusters := cfg.getClusters()
	require.Len(t, clusters, 2)

	byName := map[string]Cluster{}
	for _, cl := range clusters {
		byName[cl.Name] = cl
	}

	assert.Equal(t, "bad kubeconfig", byName["broken-ctx"].Error)
	assert.Equal(t, "https://valid.example.com", byName["valid-ctx"].Server)
	assert.NotContains(t, byName, "internal-ctx")
	assert.NotContains(t, byName, "nil-kubecontext")
}

func TestAddClusterHandlers(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "")

	t.Run("rejects request with invalid backend token", func(t *testing.T) {
		t.Setenv("HEADLAMP_BACKEND_TOKEN", "expected-secret")
		cfg := newCmdTestConfig(t)
		cfg.UseInCluster = false

		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/cluster",
			strings.NewReader(`{"name":"c1","server":"https://example.com"}`))
		rr := httptest.NewRecorder()

		cfg.addCluster(rr, req)
		assert.Equal(t, http.StatusForbidden, rr.Code)
	})

	t.Run("rejects invalid JSON body", func(t *testing.T) {
		cfg := newCmdTestConfig(t)

		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/cluster",
			strings.NewReader(`{invalid`))
		rr := httptest.NewRecorder()

		cfg.addCluster(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("rejects invalid base64 kubeconfig", func(t *testing.T) {
		cfg := newCmdTestConfig(t)
		body, err := json.Marshal(map[string]string{"kubeconfig": "not-valid-base64!!!"})
		require.NoError(t, err)

		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/cluster", bytes.NewReader(body))
		rr := httptest.NewRecorder()

		cfg.addCluster(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestAddClusterHandlerValidKubeconfig(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "")
	cfg := newCmdTestConfig(t)
	cfg.KubeConfigDir = t.TempDir()

	rawKubeconfig := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster.example.com
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: test-ctx
current-context: test-ctx
users:
- name: test-user
  user:
    token: tok
`
	encoded := base64.StdEncoding.EncodeToString([]byte(rawKubeconfig))
	body, err := json.Marshal(map[string]string{"kubeconfig": encoded})
	require.NoError(t, err)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/cluster", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	cfg.addCluster(rr, req)
	assert.Equal(t, http.StatusCreated, rr.Code)

	got, err := cfg.KubeConfigStore.GetContext("test-ctx")
	require.NoError(t, err)
	assert.Equal(t, "https://cluster.example.com", got.Cluster.Server)
}

func TestGetPathAndLoadKubeconfigAndRenameErrors(t *testing.T) {
	cfg := newCmdTestConfig(t)
	tempDir := t.TempDir()
	cfg.KubeConfigDir = tempDir

	// Invalid source returns error.
	_, _, err := cfg.getPathAndLoadKubeconfig("unknown_source", "c1")
	require.Error(t, err)

	// Missing kubeconfig file returns error.
	_, _, err = cfg.getPathAndLoadKubeconfig("dynamic_cluster", "c1")
	require.Error(t, err)

	// Valid kubeconfig file loads successfully.
	kcPath := filepath.Join(tempDir, "config")
	require.NoError(t, os.WriteFile(kcPath, []byte(`apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://example.com
  name: c1
contexts:
- context:
    cluster: c1
    user: u1
  name: c1
users:
- name: u1
  user: {}
`), 0o600))

	gotPath, apiCfg, err := cfg.getPathAndLoadKubeconfig("dynamic_cluster", "c1")
	require.NoError(t, err)
	assert.Equal(t, kcPath, gotPath)
	assert.Contains(t, apiCfg.Contexts, "c1")

	// handleClusterRename rejects non-renamable context.
	require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "in-cluster",
		Source:      kubeconfig.InCluster,
		KubeContext: &api.Context{Cluster: "in-cluster"},
	}))

	ctx := context.Background()
	spanReq := httptest.NewRequestWithContext(ctx, http.MethodPut, "/cluster/in-cluster", nil)

	_, span := telemetry.CreateSpan(ctx, spanReq, "test", "rename")
	defer span.End()

	rr := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(ctx, http.MethodPut, "/cluster/in-cluster", nil)
	err = cfg.handleClusterRename(rr, req, "in-cluster", RenameClusterRequest{
		NewClusterName: "renamed",
		Source:         "dynamic_cluster",
	}, ctx, span)
	require.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, rr.Code)

	// handleClusterRename returns 500 when kubeconfig source cannot be loaded.
	require.NoError(t, os.Remove(kcPath))

	rr2 := httptest.NewRecorder()
	err = cfg.handleClusterRename(rr2, req, "missing-ctx",
		RenameClusterRequest{NewClusterName: "renamed", Source: "unknown_source"}, ctx, span)
	require.ErrorIs(t, err, os.ErrNotExist)
	assert.Equal(t, http.StatusInternalServerError, rr2.Code)
}

func TestHandleNodeDrainAndStatusValidation(t *testing.T) {
	cfg := newCmdTestConfig(t)

	t.Run("drain rejects non-JSON when clusterName route var is set", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/c1/drain-node",
			strings.NewReader(`{}`))
		req = mux.SetURLVars(req, map[string]string{"clusterName": "c1"})
		rr := httptest.NewRecorder()

		cfg.handleNodeDrain(rr, req)
		assert.Equal(t, http.StatusUnsupportedMediaType, rr.Code)
	})

	t.Run("drain rejects missing nodeName and cluster", func(t *testing.T) {
		for _, body := range []string{`{"cluster":"c1"}`, `{"nodeName":"n1"}`} {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/drain-node",
				strings.NewReader(body))
			rr := httptest.NewRecorder()

			cfg.handleNodeDrain(rr, req)
			assert.Equal(t, http.StatusBadRequest, rr.Code)
		}
	})

	t.Run("drain returns 404 for unknown cluster", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/drain-node",
			strings.NewReader(`{"cluster":"missing","nodeName":"n1"}`))
		rr := httptest.NewRecorder()

		cfg.handleNodeDrain(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("drain returns 401 when user auth is required without token", func(t *testing.T) {
		require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
			Name:        "oidc-ctx",
			Cluster:     &api.Cluster{Server: "https://example.com"},
			KubeContext: &api.Context{Cluster: "oidc-ctx"},
			OidcConf:    &kubeconfig.OidcConfig{ClientID: "cid", IdpIssuerURL: "https://idp.example.com"},
		}))

		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/drain-node",
			strings.NewReader(`{"cluster":"oidc-ctx","nodeName":"n1"}`))
		rr := httptest.NewRecorder()

		cfg.handleNodeDrain(rr, req)
		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})
}

func TestHandleNodeDrainStatusValidation(t *testing.T) {
	cfg := newCmdTestConfig(t)
	statusURL := "/drain-node-status?cluster=c1&nodeName=n1"

	// Missing nodeName.
	req1 := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/drain-node-status?cluster=c1", nil)
	rr1 := httptest.NewRecorder()
	cfg.handleNodeDrainStatus(rr1, req1)
	assert.Equal(t, http.StatusBadRequest, rr1.Code)

	// Missing cluster.
	req2 := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/drain-node-status?nodeName=n1", nil)
	rr2 := httptest.NewRecorder()
	cfg.handleNodeDrainStatus(rr2, req2)
	assert.Equal(t, http.StatusBadRequest, rr2.Code)

	// Cache miss -> 404.
	req3 := httptest.NewRequestWithContext(context.Background(), http.MethodGet, statusURL, nil)
	rr3 := httptest.NewRecorder()
	cfg.handleNodeDrainStatus(rr3, req3)
	assert.Equal(t, http.StatusNotFound, rr3.Code)

	// Non-string cache value -> 500.
	badKey := drainCacheKey("n1", "c1")
	require.NoError(t, cfg.Cache.Set(context.Background(), badKey, 12345))
	req4 := httptest.NewRequestWithContext(context.Background(), http.MethodGet, statusURL, nil)
	rr4 := httptest.NewRecorder()
	cfg.handleNodeDrainStatus(rr4, req4)
	assert.Equal(t, http.StatusInternalServerError, rr4.Code)

	// Valid string cache value -> 200.
	cfg.setDrainStatus(context.Background(), badKey, drainStatusInProgress)
	req5 := httptest.NewRequestWithContext(context.Background(), http.MethodGet, statusURL, nil)
	rr5 := httptest.NewRecorder()
	cfg.handleNodeDrainStatus(rr5, req5)
	assert.Equal(t, http.StatusOK, rr5.Code)

	var resp struct {
		ID      string `json:"id"`
		Cluster string `json:"cluster"`
	}
	require.NoError(t, json.Unmarshal(rr5.Body.Bytes(), &resp))
	assert.Equal(t, drainStatusInProgress, resp.ID)
	assert.Equal(t, "c1", resp.Cluster)
}

func TestLoadOidcCACertAndCacheMiddleware(t *testing.T) {
	assert.Empty(t, loadOidcCACert(""))

	certFile := filepath.Join(t.TempDir(), "ca.crt")
	require.NoError(t, os.WriteFile(certFile, []byte("PEM-DATA"), 0o600))
	assert.Equal(t, "PEM-DATA", loadOidcCACert(certFile))

	cfg := newCmdTestConfig(t)
	cfg.CacheEnabled = true
	require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "c1",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		KubeContext: &api.Context{Cluster: "c1"},
	}))

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	handler := CacheMiddleWare(cfg)(next)
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/c1/api/v1/pods", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "c1"})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.True(t, called)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestClusterRequestHandlerErrorsAndHelmNilCache(t *testing.T) {
	cfg := newCmdTestConfig(t)
	h := clusterRequestHandler(cfg)

	t.Run("missing context returns 404", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/missing/api/v1/pods", nil)
		req = mux.SetURLVars(req, map[string]string{"clusterName": "missing", "api": "api/v1/pods"})
		rr := httptest.NewRecorder()

		h.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("context with error returns 400", func(t *testing.T) {
		require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
			Name:  "err-ctx",
			Error: "invalid cert",
		}))

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/err-ctx/api/v1/pods", nil)
		req = mux.SetURLVars(req, map[string]string{"clusterName": "err-ctx", "api": "api/v1/pods"})
		rr := httptest.NewRecorder()

		h.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("invalid upstream URL returns 404", func(t *testing.T) {
		require.NoError(t, cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
			Name:        "bad-url-ctx",
			Cluster:     &api.Cluster{Server: "://bad-url"},
			KubeContext: &api.Context{Cluster: "bad-url-ctx"},
		}))

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/bad-url-ctx/api/v1/pods", nil)
		req = mux.SetURLVars(req, map[string]string{"clusterName": "bad-url-ctx", "api": "api/v1/pods"})
		rr := httptest.NewRecorder()

		h.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("getHelmHandler returns handler", func(t *testing.T) {
		cfgHelm := newCmdTestConfig(t)

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/helm/releases/list", nil)
		req = mux.SetURLVars(req, map[string]string{"clusterName": "c1"})
		rr := httptest.NewRecorder()

		hh, err := getHelmHandler(cfgHelm, rr, req)
		require.NoError(t, err)
		assert.NotNil(t, hh)
	})
}
