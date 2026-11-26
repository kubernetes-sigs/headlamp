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

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestNewOIDCTokenRefreshMiddleware(t *testing.T) {
	kubeConfigStore := kubeconfig.NewContextStore()
	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            cache.New[interface{}](),
		TelemetryHandler: &telemetry.RequestHandler{},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

	// Test case: non-cluster request is skipped
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/non-cluster", nil)
	rec := httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	// Test case: cluster request without token is bypassed
	req = httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/test-cluster", nil)
	rec = httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestNewOIDCTokenRefreshMiddleware_BaseURL(t *testing.T) {
	const cluster = "main"

	oldToken := makeTestToken(t, map[string]interface{}{"exp": float64(time.Now().Unix())})

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	kubeConfigStore := kubeconfig.NewContextStore()
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:     cluster,
		OidcConf: &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret", IdpIssuerURL: srv.URL},
	}))

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}},
		TelemetryHandler: &telemetry.RequestHandler{},
		BaseURL:          "/dev/internal/headlamp",
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/dev/internal/headlamp/clusters/"+cluster+"/apis/metrics.k8s.io/v1beta1/pods", nil)
	req.Header.Set("Authorization", "Bearer "+oldToken)

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)
	invalidRequest := req.Clone(req.Context())
	invalidRequest.Header.Set("Authorization", "")

	invalidResponse := httptest.NewRecorder()
	middleware.ServeHTTP(invalidResponse, invalidRequest)
	require.Equal(t, http.StatusUnauthorized, invalidResponse.Code)

	rec := httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)

	resp := rec.Result()

	defer func() { _ = resp.Body.Close() }()

	cookieVal, ok := findAuthCookie(resp, cluster)
	require.True(t, ok, "expected the refreshed token cookie to be set")
	assert.Equal(t, "NEW", cookieVal)
}

func TestOIDCTokenRefreshMiddlewareContextAndInClusterBranches(t *testing.T) {
	kubeConfigStore := kubeconfig.NewContextStore()
	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            cache.New[interface{}](),
		TelemetryHandler: &telemetry.RequestHandler{},
	}
	nextCalled := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		nextCalled++

		w.Header().Set("X-Next-Called", "true")
		w.WriteHeader(http.StatusOK)
	})
	serveAndAssert := func(mw http.Handler, path string, wantCalls int) {
		t.Helper()

		req := httptest.NewRequestWithContext(context.Background(), "GET", path, nil)
		req.Header.Set("Authorization", "Bearer tok")

		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "true", rec.Header().Get("X-Next-Called"))
		assert.Equal(t, wantCalls, nextCalled)
	}

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)
	// Missing context in store triggers handleGetContextError and passes through.
	serveAndAssert(middleware, "/clusters/missing-cluster/pods", 1)

	// Context without OIDC config triggers handleOIDCAuthConfigError and passes through.
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "no-oidc",
		Cluster:     &api.Cluster{Server: "https://127.0.0.1:6443"},
		AuthInfo:    &api.AuthInfo{Token: "static"},
		KubeContext: &api.Context{Cluster: "no-oidc", AuthInfo: "no-oidc"},
	}))
	serveAndAssert(middleware, "/clusters/no-oidc/pods", 2)

	// In-cluster unsafe service account token skips OIDC refresh.
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "incluster",
		Source:      kubeconfig.InCluster,
		Cluster:     &api.Cluster{Server: "https://127.0.0.1:6443"},
		AuthInfo:    &api.AuthInfo{TokenFile: "sa-token-file"},
		KubeContext: &api.Context{Cluster: "incluster", AuthInfo: "incluster"},
	}))

	inClusterCfg := config
	inClusterCfg.UseInCluster = true
	inClusterCfg.UnsafeUseServiceAccountToken = true
	inClusterMW := auth.NewOIDCTokenRefreshMiddleware(inClusterCfg)(handler)
	serveAndAssert(inClusterMW, "/clusters/incluster/pods", 3)
}

func TestSetTokenFromCookie(t *testing.T) {
	clusterName := "test-cluster-oidc"
	testToken := "fake-token-for-testing"
	cookieName := "headlamp-auth-" + auth.SanitizeClusterName(clusterName) + ".0"

	req, err := http.NewRequestWithContext(context.Background(), "GET", "/api/v1/clusters/"+clusterName, nil)
	assert.NoError(t, err)

	req.AddCookie(&http.Cookie{
		Name:     cookieName,
		Value:    testToken,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	auth.SetTokenFromCookie(req, clusterName)

	got := req.Header.Get("Authorization")
	want := "Bearer " + testToken
	assert.Equal(t, want, got)
}
