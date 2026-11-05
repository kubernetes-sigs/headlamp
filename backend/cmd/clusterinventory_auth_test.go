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
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestRejectedBackendCredentialsDoNotChangeContexts(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "desktop-token")

	for _, token := range []string{"", "wrong-token"} {
		t.Run("token="+token, func(t *testing.T) {
			cfg := newDrainAuthConfig(t, &kubeconfig.Context{Name: "unrelated"})
			cfg.UseInCluster = false
			cfg.EnableDynamicClusters = true
			cfg.KubeConfigDir = t.TempDir()
			cfg.KubeConfigPath = filepath.Join(cfg.KubeConfigDir, "missing")
			handler := createHeadlampHandler(newTestHandlerCtx(t), cfg)
			config := userKubeconfigFor(t, "user-context", "https://127.0.0.1:1")
			key := statelessContextKey("user-context", "user")
			reject := func() {
				req := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
					"/clusters/user-context/api/v1/pods", nil)
				req.Header.Set("KUBECONFIG", base64.StdEncoding.EncodeToString(config))
				req.Header.Set("X-HEADLAMP-USER-ID", "user")

				if token != "" {
					req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", token)
				}

				response := httptest.NewRecorder()
				handler.ServeHTTP(response, req)
				require.Equal(t, http.StatusForbidden, response.Code, response.Body.String())
			}

			reject()

			_, err := cfg.KubeConfigStore.GetContext(key)
			assert.Error(t, err, "a rejected request must not register a context")
			require.NoError(t, cfg.KubeConfigStore.AddContextWithKeyAndTTL(&kubeconfig.Context{
				Name: "user-context", KubeContext: &api.Context{}, AuthInfo: &api.AuthInfo{},
			}, key, 250*time.Millisecond))
			reject()
			require.Eventually(t, func() bool {
				_, err := cfg.KubeConfigStore.GetContext(key)
				return err != nil
			}, 2*time.Second, 25*time.Millisecond, "a rejected request must not extend the context lifetime")
		})
	}
}

func TestInventoryRoutesRequireUserAuthentication(t *testing.T) {
	provider := newSigningOIDCTestServer(t)
	handler, cluster := newOIDCTestHandler(t, provider, func(c *HeadlampConfig) {
		ctx, err := c.KubeConfigStore.GetContext("oidc-char-test")
		require.NoError(t, err)

		ctx.Source = kubeconfig.ClusterInventory
		c.UnsafeUseServiceAccountToken = true
		c.CacheEnabled = true
	})

	for _, path := range []string{
		"api/v1/pods", "version", "helm/releases/list", "serviceproxy/default/api",
		"portforward/list", "drain-node-status",
	} {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/"+cluster+"/"+path, nil)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			require.Equal(t, http.StatusUnauthorized, response.Code, response.Body.String())
		})
	}
}

func TestInventoryProxyUsesEachUsersToken(t *testing.T) {
	var received []string

	apiServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = append(received, r.Header.Get("Authorization"))
		assert.Empty(t, r.Header.Get("Cookie"))

		if r.Header.Get("Authorization") == "Bearer user-b" {
			w.WriteHeader(http.StatusForbidden)
		}
	}))
	t.Cleanup(apiServer.Close)

	cfg := newDrainAuthConfig(t, &kubeconfig.Context{
		Name: "inventory", Source: kubeconfig.ClusterInventory,
		KubeContext: &api.Context{Cluster: "inventory", AuthInfo: "inventory"},
		Cluster:     &api.Cluster{Server: apiServer.URL, InsecureSkipTLSVerify: true},
		AuthInfo:    &api.AuthInfo{}, OidcConf: &kubeconfig.OidcConfig{ClientID: "headlamp"},
	})
	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	for _, tc := range []struct {
		name, token, cookie, protocol string
		status                        int
	}{
		{name: "anonymous", status: 401},
		{name: "user a", token: "user-a", status: 200},
		{name: "user b RBAC denial", token: "user-b", status: 403},
		{name: "cookie", cookie: "user-a", status: 200},
		{name: "header wins over stale cookie", token: "user-a", cookie: "user-b", status: 200},
		{name: "websocket", protocol: "user-a", status: 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/inventory/api/v1/pods", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}

			if tc.cookie != "" {
				req.AddCookie(&http.Cookie{
					Name: "headlamp-auth-inventory.0", Value: tc.cookie,
					Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode,
				})
			}

			if tc.protocol != "" {
				req.Header.Set("Upgrade", "websocket")
				req.Header.Set("Sec-WebSocket-Protocol",
					"base64url.bearer.authorization.k8s.io."+base64.RawURLEncoding.EncodeToString([]byte(tc.protocol)))
			}

			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			require.Equal(t, tc.status, response.Code, response.Body.String())
		})
	}

	require.Equal(t, []string{
		"Bearer user-a", "Bearer user-b", "Bearer user-a", "Bearer user-a", "Bearer user-a",
	}, received)
}

func TestInventoryOIDCLoginForwardsTheSignedInUser(t *testing.T) {
	provider := newSigningOIDCTestServer(t)

	var forwardedToken string

	apiServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forwardedToken = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")

		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(apiServer.Close)

	handler, cluster := newOIDCTestHandler(t, provider, func(c *HeadlampConfig) {
		ctx, err := c.KubeConfigStore.GetContext("oidc-char-test")
		require.NoError(t, err)

		ctx.Source = kubeconfig.ClusterInventory
		ctx.Cluster = &api.Cluster{Server: apiServer.URL, InsecureSkipTLSVerify: true}
		c.OidcUseCookie = true
		c.SessionTTL = 3600
	})
	state := extractState(t, driveOIDCStart(t, handler, cluster))
	callback := callOIDCCallback(t, handler, "state="+state+"&code=code")
	require.Equal(t, http.StatusSeeOther, callback.Code, callback.Body.String())

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/"+cluster+"/api/v1/pods", nil)
	for _, cookie := range callback.Result().Cookies() {
		req.AddCookie(cookie)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.Len(t, strings.Split(forwardedToken, "."), 3)
}

func TestInventoryMultiplexerRejectsMissingCredentialsOnReusedConnection(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "inventory", Source: kubeconfig.ClusterInventory,
		OidcConf: &kubeconfig.OidcConfig{ClientID: "headlamp"},
	}))
	m := NewMultiplexer(store, true)
	message := Message{ClusterID: "inventory", UserID: "user-a", Path: "/api/v1/pods"}
	m.connections[m.createConnectionKey(message.ClusterID, message.Path, message.UserID)] = &Connection{}

	for _, token := range []*string{nil, new(string)} {
		_, err := m.getOrCreateConnection(message, nil, token)
		require.ErrorContains(t, err, "user authentication is required")
	}

	require.NoError(t, store.AddContext(&kubeconfig.Context{Name: "inventory", Source: kubeconfig.KubeConfig}))

	_, err := m.getOrCreateConnection(message, nil, nil)
	require.NoError(t, err)
}

func TestRenameRejectsContextsWithoutPersistentOrigin(t *testing.T) {
	for _, source := range []int{
		kubeconfig.ClusterInventory, kubeconfig.DiscoveredCluster, kubeconfig.KubeConfig, kubeconfig.DynamicCluster,
	} {
		cfg := newDrainAuthConfig(t, &kubeconfig.Context{Name: "memory", Source: source})

		for _, stateless := range []bool{false, true} {
			body := fmt.Sprintf(`{"newClusterName":"renamed","source":"kubeconfig","stateless":%t}`, stateless)
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/cluster/memory", strings.NewReader(body))
			req = mux.SetURLVars(req, map[string]string{"name": "memory"})
			response := httptest.NewRecorder()
			cfg.renameCluster(response, req)
			require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())

			_, err := cfg.KubeConfigStore.GetContext("memory")
			require.NoError(t, err, "a rejected rename must not remove the generated connection")
		}
	}
}

func TestInventoryLegacyDrainStatusRequiresUserAuthentication(t *testing.T) {
	provider := newSigningOIDCTestServer(t)
	handler, cluster := newOIDCTestHandler(t, provider, func(c *HeadlampConfig) {
		ctx, err := c.KubeConfigStore.GetContext("oidc-char-test")
		require.NoError(t, err)

		ctx.Source = kubeconfig.ClusterInventory
	})

	for _, tc := range []struct {
		name, token string
		status      int
	}{
		{name: "anonymous", status: http.StatusUnauthorized},
		// No drain was recorded, so a signed-in user reaches the handler's cache lookup.
		{name: "signed in user", token: "user-a", status: http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
				"/drain-node-status?cluster="+cluster+"&nodeName=node-1", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			require.Equal(t, tc.status, response.Code, response.Body.String())
		})
	}
}

// userKubeconfigFor returns a kubeconfig that authenticates with its own basic-auth credentials.
func userKubeconfigFor(t *testing.T, name, server string) []byte {
	t.Helper()

	data, err := clientcmd.Write(api.Config{
		Clusters:       map[string]*api.Cluster{name: {Server: server, InsecureSkipTLSVerify: true}},
		AuthInfos:      map[string]*api.AuthInfo{name: {Username: "local-user", Password: "local-pass"}},
		Contexts:       map[string]*api.Context{name: {Cluster: name, AuthInfo: name}},
		CurrentContext: name,
	})
	require.NoError(t, err)

	return data
}

// A user's own kubeconfig shadows a global connection with the same name, so the
// authentication gate must judge the connection the request will actually use.
//
//nolint:funlen // HTTP and WebSocket credential integration.
func TestStatelessConnectionShadowsSameNamedOIDCConnection(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "desktop-token")

	var received []string

	apiServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = append(received, r.Header.Get("Authorization"))
	}))
	t.Cleanup(apiServer.Close)

	cfg := newDrainAuthConfig(t, &kubeconfig.Context{
		Name: "inventory", Source: kubeconfig.ClusterInventory,
		KubeContext: &api.Context{Cluster: "inventory", AuthInfo: "inventory"},
		Cluster:     &api.Cluster{Server: apiServer.URL, InsecureSkipTLSVerify: true},
		AuthInfo:    &api.AuthInfo{}, OidcConf: &kubeconfig.OidcConfig{ClientID: "headlamp"},
	})
	cfg.EnableDynamicClusters = true
	cfg.UseInCluster = false

	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	userKubeconfig := userKubeconfigFor(t, "inventory", apiServer.URL)

	const userAuthorization = "Basic bG9jYWwtdXNlcjpsb2NhbC1wYXNz"

	do := func(mutate func(*http.Request)) *httptest.ResponseRecorder {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/inventory/api/v1/pods", nil)
		req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "desktop-token")
		mutate(req)

		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)

		return response
	}

	t.Run("anonymous request to the global connection is rejected", func(t *testing.T) {
		require.Equal(t, http.StatusUnauthorized, do(func(*http.Request) {}).Code)
	})

	t.Run("stateless request uses its own credentials", func(t *testing.T) {
		received = nil
		response := do(func(req *http.Request) {
			req.Header.Set("KUBECONFIG", base64.StdEncoding.EncodeToString(userKubeconfig))
			req.Header.Set("X-HEADLAMP-USER-ID", "user-a")
		})
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		require.Equal(t, []string{userAuthorization}, received)
	})

	t.Run("websocket resolves the cached stateless connection once", func(t *testing.T) {
		received = nil
		response := do(func(req *http.Request) {
			req.Header.Set("Upgrade", "websocket")
			req.Header.Del("X-HEADLAMP_BACKEND-TOKEN")
			req.Header.Set("Sec-WebSocket-Protocol", "base64url.headlamp.authorization.k8s.io.user-a, "+
				"base64url.headlamp.backend.authorization.k8s.io."+base64.RawURLEncoding.EncodeToString([]byte("desktop-token")))
		})
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		require.Equal(t, []string{userAuthorization}, received)
	})
}

//nolint:funlen // HTTP identity and cache lifecycle cases.
func TestStatelessRenamePreservesOtherConnections(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "desktop-token")

	for _, tc := range []struct {
		name, userID, backendToken string
		cached, expired, stateless bool
		status                     int
	}{
		{"cached", "user-a", "desktop-token", true, false, true, http.StatusCreated},
		{"other user", "user-b", "desktop-token", true, false, true, http.StatusCreated},
		{"not connected", "user-a", "desktop-token", false, false, true, http.StatusCreated},
		{"expired", "user-a", "desktop-token", true, true, true, http.StatusCreated},
		{"missing user ID", "", "desktop-token", true, false, true, http.StatusBadRequest},
		{"missing backend token", "user-a", "", true, false, true, http.StatusForbidden},
		{"invalid backend token", "user-a", "invalid", true, false, true, http.StatusForbidden},
		{"generated connection", "user-a", "desktop-token", true, false, false, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			global := &kubeconfig.Context{
				Name: "inventory", Source: kubeconfig.ClusterInventory,
				KubeContext: &api.Context{}, Cluster: &api.Cluster{Server: "https://global.example.com"},
			}
			cfg := newDrainAuthConfig(t, global)
			cfg.UseInCluster = false

			for _, user := range []string{"user-a", "user-b"} {
				if user == "user-a" && !tc.cached {
					continue
				}

				ttl := time.Minute
				if user == "user-a" && tc.expired {
					ttl = -time.Second
				}

				require.NoError(t, cfg.KubeConfigStore.AddContextWithKeyAndTTL(&kubeconfig.Context{
					Internal: true, KubeContext: &api.Context{}, Cluster: &api.Cluster{Server: "https://user.example.com"},
				}, statelessContextKey(global.Name, user), ttl))
			}

			router := mux.NewRouter()
			router.Handle("/cluster/{name}", cfg.authenticatedHandler(http.HandlerFunc(cfg.renameCluster))).Methods("PUT")

			req, err := makeJSONReq(http.MethodPut, "/cluster/inventory", RenameClusterRequest{
				NewClusterName: "my-workload", Stateless: tc.stateless,
			})
			require.NoError(t, err)
			req.Header.Set("X-HEADLAMP-USER-ID", tc.userID)
			req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", tc.backendToken)

			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			require.Equal(t, tc.status, response.Code, response.Body.String())

			stored, err := cfg.KubeConfigStore.GetContext(global.Name)
			require.NoError(t, err)
			require.Same(t, global, stored)

			for _, user := range []string{"user-a", "user-b"} {
				_, err := cfg.KubeConfigStore.GetContext(statelessContextKey(global.Name, user))

				removed := tc.status == http.StatusCreated && user == tc.userID
				if removed || (user == "user-a" && (!tc.cached || tc.expired)) {
					require.Error(t, err, "cached connection for %s must be absent", user)
				} else {
					require.NoError(t, err, "cached connection for %s must remain", user)
				}
			}
		})
	}
}
