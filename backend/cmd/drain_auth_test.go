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
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func makeDrainJSONReq(url string, payload interface{}) (*http.Request, error) {
	req, err := makeJSONReq(http.MethodPost, url, payload)
	if err == nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return req, err
}

func TestClusterScopedDrainStatelessUserIsolation(t *testing.T) { //nolint:funlen // two-user API/cache integration.
	requests := make(chan string, 8)
	kubeAPI := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		requests <- token

		w.Header().Set("Content-Type", "application/json")

		if token == "Bearer user-b-token" { // #nosec G101 -- synthetic test credential.
			require.Equal(t, http.MethodGet, r.Method)
			w.WriteHeader(http.StatusForbidden)
			require.NoError(t, json.NewEncoder(w).Encode(metav1.Status{
				TypeMeta: metav1.TypeMeta{Kind: "Status", APIVersion: "v1"},
				Status:   "Failure", Code: 403, Reason: metav1.StatusReasonForbidden,
				Message: "nodes is forbidden for user-b",
			}))

			return
		}

		require.Equal(t, "Bearer user-a-token", token)

		switch r.URL.Path {
		case "/api/v1/nodes/test-node":
			require.NoError(t, json.NewEncoder(w).Encode(corev1.Node{
				ObjectMeta: metav1.ObjectMeta{Name: "test-node"},
			}))
		case "/api/v1/pods":
			require.NoError(t, json.NewEncoder(w).Encode(corev1.PodList{}))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(kubeAPI.Close)

	cfg := newDrainAuthConfig(t, &kubeconfig.Context{Name: "unrelated"})
	cfg.UseInCluster = false
	cfg.EnableDynamicClusters = true
	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	users := []struct {
		id         string
		kubeconfig string
		wantStatus string
	}{
		{id: "user-a", wantStatus: "success"},
		{id: "user-b", wantStatus: "error: nodes is forbidden for user-b"},
	}
	poll := func(userID, kubeconfigHeader string) *httptest.ResponseRecorder {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/clusters/main/drain-node-status?nodeName=test-node", nil)
		req.Header.Set("KUBECONFIG", kubeconfigHeader)
		req.Header.Set("X-HEADLAMP-USER-ID", userID)

		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)

		return response
	}

	for i := range users {
		user := &users[i]
		config, err := clientcmd.Write(api.Config{
			Clusters: map[string]*api.Cluster{
				"main": {Server: kubeAPI.URL, InsecureSkipTLSVerify: true},
			},
			AuthInfos: map[string]*api.AuthInfo{
				user.id: {Token: user.id + "-token"},
			},
			Contexts: map[string]*api.Context{
				"main": {Cluster: "main", AuthInfo: user.id},
			},
			CurrentContext: "main",
		})
		require.NoError(t, err)

		user.kubeconfig = base64.StdEncoding.EncodeToString(config)

		req, err := makeDrainJSONReq("/clusters/main/drain-node",
			map[string]string{"cluster": "main", "nodeName": "test-node"})
		require.NoError(t, err)
		req.Header.Set("KUBECONFIG", user.kubeconfig)
		req.Header.Set("X-HEADLAMP-USER-ID", user.id)

		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		require.Eventually(t, func() bool {
			status := poll(user.id, user.kubeconfig)
			if status.Code != http.StatusOK {
				return false
			}

			var result struct {
				ID string `json:"id"`
			}
			require.NoError(t, json.NewDecoder(status.Body).Decode(&result))

			return result.ID == user.wantStatus
		}, 2*time.Second, 10*time.Millisecond)
	}

	// Check both results after both drains finish so a shared cache key cannot pass.
	for _, user := range users {
		response := poll(user.id, user.kubeconfig)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())

		var result struct {
			ID      string `json:"id"`
			Cluster string `json:"cluster"`
		}
		require.NoError(t, json.NewDecoder(response.Body).Decode(&result))
		require.Equal(t, user.wantStatus, result.ID)
		require.Equal(t, "main", result.Cluster)
	}

	require.Len(t, requests, 4)
	require.Equal(t, "Bearer user-a-token", <-requests)
	require.Equal(t, "Bearer user-a-token", <-requests)
	require.Equal(t, "Bearer user-a-token", <-requests)
	require.Equal(t, "Bearer user-b-token", <-requests)
}

func TestClusterScopedDrainCredentials(t *testing.T) { //nolint:funlen // credential boundary integration table.
	for _, tc := range []struct {
		name        string
		source      int
		unsafe      bool
		cookie      string
		header      string
		configToken string
		wantToken   string
		wantStatus  int
	}{
		{"OIDC cookie without unsafe mode", kubeconfig.InCluster, false, "user-cookie", "", "", "user-cookie", 200},
		{"header takes precedence", kubeconfig.InCluster, false, "cookie", "user-header", "", "user-header", 200},
		{"missing user default path", kubeconfig.InCluster, false, "", "", "", "", 401},
		{
			"explicit unsafe service account", kubeconfig.InCluster,
			true, "ignored", "ignored", "", testServiceAccountToken, 200,
		},
		{"external user credential", kubeconfig.KubeConfig, false, "external-user", "", "", "external-user", 200},
		{
			"unsafe never injects pod credential externally", kubeconfig.KubeConfig,
			true, "", "", "external-config", "external-config", 200,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requests := make(chan string, 8)
			kubeAPI := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests <- r.Header.Get("Authorization")

				w.Header().Set("Content-Type", "application/json")

				switch r.URL.Path {
				case "/api/v1/nodes/test-node":
					require.NoError(t, json.NewEncoder(w).Encode(corev1.Node{
						ObjectMeta: metav1.ObjectMeta{Name: "test-node"},
					}))
				case "/api/v1/pods":
					require.NoError(t, json.NewEncoder(w).Encode(corev1.PodList{}))
				default:
					http.NotFound(w, r)
				}
			}))
			t.Cleanup(kubeAPI.Close)

			kContext := &kubeconfig.Context{
				Name: "main", Source: tc.source,
				Cluster:  &api.Cluster{Server: kubeAPI.URL, InsecureSkipTLSVerify: true},
				AuthInfo: &api.AuthInfo{Token: tc.configToken},
			}
			if tc.source == kubeconfig.InCluster && tc.unsafe {
				kContext.AuthInfo.TokenFile = writeTestTokenFile(t)
			}

			cfg := newDrainAuthConfig(t, kContext)
			cfg.UnsafeUseServiceAccountToken = tc.unsafe
			handler := mux.NewRouter()
			handleClusterAPI(cfg, handler)
			server := httptest.NewServer(handler)
			t.Cleanup(server.Close)

			jar, err := cookiejar.New(nil)
			require.NoError(t, err)

			client := &http.Client{Jar: jar}
			origin, err := url.Parse(server.URL)
			require.NoError(t, err)

			if tc.cookie != "" {
				w := httptest.NewRecorder()
				req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, server.URL, nil)
				require.NoError(t, auth.SetTokenCookie(w, req, "main", tc.cookie, "", 3600, false))
				jar.SetCookies(origin, w.Result().Cookies())
			}

			req, err := makeDrainJSONReq(server.URL+"/clusters/main/drain-node",
				map[string]string{"cluster": "main", "nodeName": "test-node"})
			require.NoError(t, err)

			if tc.header != "" {
				req.Header.Set("Authorization", "Bearer "+tc.header)
			}

			response, err := client.Do(req)
			require.NoError(t, err)
			require.NoError(t, response.Body.Close())
			require.Equal(t, tc.wantStatus, response.StatusCode)

			if tc.wantStatus == 401 {
				select {
				case got := <-requests:
					t.Fatalf("Unauthenticated drain reached Kubernetes with %q", got)
				default:
				}

				return
			}

			require.Eventually(t, func() bool {
				key := uuid.NewSHA1(uuid.Nil, []byte("test-node\x00main")).String()
				value, err := cfg.Cache.Get(context.Background(), key)

				return err == nil && value == "success"
			}, 2*time.Second, 10*time.Millisecond)

			for range 3 {
				require.Equal(t, "Bearer "+tc.wantToken, <-requests)
			}

			statusReq, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
				server.URL+"/clusters/main/drain-node-status?nodeName=test-node", nil)
			require.NoError(t, err)
			status, err := client.Do(statusReq)

			require.NoError(t, err)
			defer func() { require.NoError(t, status.Body.Close()) }()

			require.Equal(t, http.StatusOK, status.StatusCode)

			var result struct {
				ID string `json:"id"`
			}
			require.NoError(t, json.NewDecoder(status.Body).Decode(&result))
			require.Equal(t, "success", result.ID)
		})
	}
}

func TestClusterScopedDrainRejectsSimpleContentType(t *testing.T) {
	requests := make(chan struct{}, 1)
	kubeAPI := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests <- struct{}{}

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(corev1.Node{}))
	}))
	t.Cleanup(kubeAPI.Close)

	cfg := newDrainAuthConfig(t, &kubeconfig.Context{
		Name:     "main",
		Source:   kubeconfig.InCluster,
		Cluster:  &api.Cluster{Server: kubeAPI.URL, InsecureSkipTLSVerify: true},
		AuthInfo: &api.AuthInfo{},
	})
	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost,
		"/clusters/main/drain-node", strings.NewReader(`{"cluster":"main","nodeName":"test-node"}`))
	req.Header.Set("Content-Type", "text/plain")
	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-main.0", Value: "user-cookie",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})

	response := httptest.NewRecorder()

	router.ServeHTTP(response, req)

	require.Equal(t, http.StatusUnsupportedMediaType, response.Code)
	require.Contains(t, response.Body.String(), "Content-Type must be application/json")
	require.Never(t, func() bool { return len(requests) > 0 }, 100*time.Millisecond, 10*time.Millisecond)
}

func newDrainAuthConfig(t *testing.T, kContext *kubeconfig.Context) *HeadlampConfig {
	t.Helper()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(kContext))

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster: true, KubeConfigStore: store,
			},
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
			ServerCtx:        ctx,
		},
	}
}

func TestClusterScopedDrainRefreshesUserToken(t *testing.T) { //nolint:funlen // real provider/API integration.
	oldToken := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"exp":1}`)) + ".signature"
	kubeAPI := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer renewed-user-token", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")

		if r.URL.Path == "/api/v1/pods" {
			require.NoError(t, json.NewEncoder(w).Encode(corev1.PodList{}))
		} else {
			require.NoError(t, json.NewEncoder(w).Encode(corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "test-node"}}))
		}
	}))
	t.Cleanup(kubeAPI.Close)

	var issuer string

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.URL.Path == "/.well-known/openid-configuration" {
			require.NoError(t, json.NewEncoder(w).Encode(map[string]string{
				"issuer": issuer, "token_endpoint": issuer + "/token",
				"authorization_endpoint": issuer + "/authorize", "jwks_uri": issuer + "/keys",
			}))
		} else {
			require.NoError(t, r.ParseForm())
			require.Equal(t, "refresh-user-token", r.Form.Get("refresh_token"))
			require.NoError(t, json.NewEncoder(w).Encode(map[string]interface{}{
				"access_token": "renewed-user-token", "token_type": "Bearer",
				"refresh_token": "new-refresh", "expires_in": 3600,
			}))
		}
	}))
	t.Cleanup(provider.Close)
	issuer = provider.URL
	cfg := newDrainAuthConfig(t, &kubeconfig.Context{
		Name: "main", Source: kubeconfig.InCluster,
		Cluster:  &api.Cluster{Server: kubeAPI.URL, InsecureSkipTLSVerify: true},
		AuthInfo: &api.AuthInfo{},
		OidcConf: &kubeconfig.OidcConfig{IdpIssuerURL: issuer, ClientID: "test-client"},
	})
	cfg.OidcUseAccessToken = true
	cfg.SessionTTL = 3600
	require.NoError(t, cfg.Cache.Set(context.Background(), "oidc-token-"+oldToken, "refresh-user-token"))

	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	req, err := makeDrainJSONReq("/clusters/main/drain-node",
		map[string]string{"cluster": "main", "nodeName": "test-node"})
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-main.0", Value: oldToken, HttpOnly: true,
		Secure: true, SameSite: http.SameSiteStrictMode,
	})

	response := httptest.NewRecorder()
	cfg.OIDCTokenRefreshMiddleware(router).ServeHTTP(response, req)
	require.Equal(t, http.StatusOK, response.Code)
	require.Eventually(t, func() bool {
		key := uuid.NewSHA1(uuid.Nil, []byte("test-node\x00main")).String()
		value, err := cfg.Cache.Get(context.Background(), key)

		return err == nil && value == "success"
	}, 2*time.Second, 10*time.Millisecond)
	// SetTokenCookie's ClearTokenCookie pre-step also emits its own clearing Set-Cookie
	// headers (see cookies.go), so the real, renewed value is not necessarily the first one;
	// Header().Get only ever returns the first. Check every Set-Cookie header instead.
	require.Contains(t, strings.Join(response.Header().Values("Set-Cookie"), "\n"), "renewed-user-token")
}

func TestDrainRejectsClusterMismatch(t *testing.T) {
	cfg := newDrainAuthConfig(t, &kubeconfig.Context{Name: "main"})
	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	req, err := makeDrainJSONReq("/clusters/main/drain-node",
		map[string]string{"cluster": "other", "nodeName": "test-node"})
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-main.0", Value: "user",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	require.Equal(t, http.StatusBadRequest, response.Code)
	require.True(t, strings.Contains(response.Body.String(), "cluster"))
}

func TestDrainPreservesUserRBACDenial(t *testing.T) {
	requests := make(chan string, 4)
	kubeAPI := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests <- r.Header.Get("Authorization")

		require.Equal(t, http.MethodGet, r.Method, "Denied user must not reach mutation")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		require.NoError(t, json.NewEncoder(w).Encode(metav1.Status{
			TypeMeta: metav1.TypeMeta{Kind: "Status", APIVersion: "v1"},
			Status:   "Failure", Code: 403, Reason: metav1.StatusReasonForbidden,
			Message: "nodes is forbidden for user",
		}))
	}))
	t.Cleanup(kubeAPI.Close)
	cfg := newDrainAuthConfig(t, &kubeconfig.Context{
		Name: "main", Source: kubeconfig.InCluster,
		Cluster:  &api.Cluster{Server: kubeAPI.URL, InsecureSkipTLSVerify: true},
		AuthInfo: &api.AuthInfo{},
	})
	cfg.ServiceAccountTokenPath = writeTestTokenFile(t)
	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	req, err := makeDrainJSONReq("/clusters/main/drain-node",
		map[string]string{"cluster": "main", "nodeName": "test-node"})
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer restricted-user")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	require.Equal(t, http.StatusOK, response.Code)

	var drainStatus interface{}

	require.Eventually(t, func() bool {
		key := uuid.NewSHA1(uuid.Nil, []byte("test-node\x00main")).String()
		value, err := cfg.Cache.Get(context.Background(), key)
		drainStatus = value

		return err == nil
	}, 2*time.Second, 10*time.Millisecond)
	require.Contains(t, drainStatus, "forbidden")
	require.Equal(t, "Bearer restricted-user", <-requests)
	require.Empty(t, requests, "Denied operation must not retry with service-account permissions")
}
