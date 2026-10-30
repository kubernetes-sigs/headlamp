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
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

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

func TestInventoryProxyUsesEachUsersToken(t *testing.T) { //nolint:funlen // credential boundary integration table.
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
	router.Use(cfg.requireInventoryAuthentication)
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
	require.NoError(t, store.AddContext(&kubeconfig.Context{Name: "inventory", Source: kubeconfig.ClusterInventory}))
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
