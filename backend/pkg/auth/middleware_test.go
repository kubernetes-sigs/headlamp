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
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

// TestNewOIDCTokenRefreshMiddleware_SkipsRefreshOnClearRefreshTokenRoute covers the regression
// where an about-to-expire token reaching the best-effort logout cleanup route
// (/clusters/{cluster}/clear-refresh-token) could get refreshed by this middleware first. That
// refresh rotates the cached refresh token, but the cleanup handler reads the auth token from the
// (unchanged, within this same request) cookie/header, so it would delete the pre-rotation entry
// and leave the newly-rotated one behind uncleaned. The route must never reach the IdP at all.
func TestNewOIDCTokenRefreshMiddleware_SkipsRefreshOnClearRefreshTokenRoute(t *testing.T) {
	var idpHits int32

	idpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&idpHits, 1)
		http.NotFound(w, r)
	}))
	t.Cleanup(idpServer.Close)

	kubeConfigStore := kubeconfig.NewContextStore()
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		OidcConf: &kubeconfig.OidcConfig{
			ClientID:     "test-client",
			ClientSecret: "test-secret",
			IdpIssuerURL: idpServer.URL,
		},
	}))

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            cache.New[interface{}](),
		TelemetryHandler: &telemetry.RequestHandler{},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

	expiringToken := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(time.Second).Unix()),
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost,
		"/clusters/test-cluster/clear-refresh-token", nil)
	req.Header.Set("Authorization", "Bearer "+expiringToken)

	rec := httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, int32(0), atomic.LoadInt32(&idpHits),
		"the refresh-token cleanup route must not trigger an OIDC refresh, even with an about-to-expire token")
}

// TestNewOIDCTokenRefreshMiddleware_OnlyExactCleanupRouteSkipsRefresh covers the regression where
// any path ending in /clear-refresh-token skipped the OIDC refresh. A Kubernetes request for a
// Secret with that name would then reach the API server with an expired token and get a 401.
func TestNewOIDCTokenRefreshMiddleware_OnlyExactCleanupRouteSkipsRefresh(t *testing.T) {
	tests := []struct {
		name         string
		method       string
		path         string
		wantIdPCalls bool
	}{
		{"exact POST route skips refresh", http.MethodPost, "/clusters/test-cluster/clear-refresh-token", false},
		{"GET on the route still refreshes", http.MethodGet, "/clusters/test-cluster/clear-refresh-token", true},
		{
			"Secret named clear-refresh-token still refreshes", http.MethodGet,
			"/clusters/test-cluster/api/v1/namespaces/default/secrets/clear-refresh-token", true,
		},
		{
			"POST to a deeper path ending in the suffix still refreshes", http.MethodPost,
			"/clusters/test-cluster/api/v1/namespaces/default/secrets/clear-refresh-token", true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var idpHits int32

			idpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				atomic.AddInt32(&idpHits, 1)
				http.NotFound(w, r)
			}))
			t.Cleanup(idpServer.Close)

			kubeConfigStore := kubeconfig.NewContextStore()
			require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
				Name: "test-cluster",
				OidcConf: &kubeconfig.OidcConfig{
					ClientID:     "test-client",
					ClientSecret: "test-secret",
					IdpIssuerURL: idpServer.URL,
				},
			}))

			middleware := auth.NewOIDCTokenRefreshMiddleware(auth.OIDCTokenRefreshConfig{
				KubeConfigStore:  kubeConfigStore,
				Cache:            cache.New[interface{}](),
				TelemetryHandler: &telemetry.RequestHandler{},
			})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			req := httptest.NewRequestWithContext(context.Background(), tc.method, tc.path, nil)
			req.Header.Set("Authorization", "Bearer "+makeJWTWithPayload(t, map[string]interface{}{
				"exp": float64(time.Now().Add(time.Second).Unix()),
			}))

			middleware.ServeHTTP(httptest.NewRecorder(), req)

			if tc.wantIdPCalls {
				assert.Positive(t, atomic.LoadInt32(&idpHits), "expected an OIDC refresh attempt")
			} else {
				assert.Zero(t, atomic.LoadInt32(&idpHits), "expected the refresh to be skipped")
			}
		})
	}
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
