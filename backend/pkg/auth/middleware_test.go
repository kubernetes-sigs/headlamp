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

// newImpersonationMiddlewareTestContext adds a kubeconfig.Context to kubeConfigStore for a
// cluster that authenticates upstream with the in-cluster service account token (so
// impersonation, when enabled, applies to it) and refreshes against srv.
func newImpersonationMiddlewareTestContext(
	t *testing.T, kubeConfigStore kubeconfig.ContextStore, clusterName, srvURL string,
) {
	t.Helper()

	kContext := &kubeconfig.Context{
		Name:    clusterName,
		Cluster: &api.Cluster{Server: "https://" + clusterName + ".example.com"},
		// Not a real credential: a fixed path a kubeconfig.Context checks is merely non-empty
		// (see UsesInClusterServiceAccountToken) to decide impersonation applies, never read.
		AuthInfo: &api.AuthInfo{TokenFile: "/var/run/secrets/kubernetes.io/serviceaccount/token"}, //nolint:gosec
		Source:   kubeconfig.InCluster,
		OidcConf: &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret", IdpIssuerURL: srvURL},
	}
	require.NoError(t, kubeConfigStore.AddContext(kContext))
}

// newNearExpiryToken returns a JWT that IsTokenAboutToExpire considers due for a refresh.
func newNearExpiryToken(t *testing.T) string {
	t.Helper()

	return makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(time.Second).Unix()),
	})
}

// TestNewOIDCTokenRefreshMiddleware_BearerTokenImpersonationSkipsCookie locks in the fix for a
// gap where this middleware's proactive refresh widened the refreshed cookie to deployment scope
// for ANY token about to expire, including one ParseClusterAndToken (now
// ParseClusterAndTokenSource) obtained from a bearer Authorization header rather than Headlamp's
// own session cookie. That turned a bearer-only request -- pkg/serviceproxy, or any other direct
// API client presenting its own credential, which requestIDToken already treats as a
// pass-through token that must never become a cookie -- into a persistent, deployment-wide
// Headlamp session as soon as impersonation was enabled and that credential happened to need a
// refresh. The fix tracks the token's source and, when impersonation applies, only ever refreshes
// a bearer-sourced token for the current request: no Set-Cookie at all.
func TestNewOIDCTokenRefreshMiddleware_BearerTokenImpersonationSkipsCookie(t *testing.T) {
	const clusterName = "main"

	staleToken := newNearExpiryToken(t)
	refreshedToken := "refreshed-id-token"

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "AT",
			"token_type":    "Bearer",
			"expires_in":    3600,
			"refresh_token": "new-refresh-token",
			"id_token":      refreshedToken,
		}))
	})

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })
	require.NoError(t, tokenCache.Set(context.Background(), "oidc-token-"+staleToken, "cached-refresh-token"))

	kubeConfigStore := kubeconfig.NewContextStore()
	newImpersonationMiddlewareTestContext(t, kubeConfigStore, clusterName, srv.URL)

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:      kubeConfigStore,
		Cache:                tokenCache,
		TelemetryHandler:     &telemetry.RequestHandler{},
		UseInCluster:         true,
		OidcUseImpersonation: true,
	}

	var sawAuthorizationHeader string

	handler := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		sawAuthorizationHeader = r.Header.Get("Authorization")
	})

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

	req := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/clusters/"+clusterName+"/api/v1/nodes", nil)
	req.Header.Set("Authorization", "Bearer "+staleToken)

	rec := httptest.NewRecorder()

	middleware.ServeHTTP(rec, req)

	assert.Empty(t, rec.Result().Cookies(),
		"a bearer-sourced token refresh under impersonation must not write any cookie")
	assert.Equal(t, "Bearer "+refreshedToken, sawAuthorizationHeader,
		"the refreshed token must still reach the downstream handler for this one request")
}

// TestNewOIDCTokenRefreshMiddleware_CookieBackedImpersonationWidensCookie is the companion
// regression guard for TestNewOIDCTokenRefreshMiddleware_BearerTokenImpersonationSkipsCookie: a
// token that DID come from Headlamp's own cookie must still get a refreshed, deployment-scoped
// cookie when impersonation is enabled, exactly as before that fix -- proving it narrowed the
// behavior change to bearer-sourced tokens only, without breaking the legitimate impersonation
// cookie-refresh path real browser sessions depend on.
//
//nolint:funlen
func TestNewOIDCTokenRefreshMiddleware_CookieBackedImpersonationWidensCookie(t *testing.T) {
	const clusterName = "main"

	staleToken := newNearExpiryToken(t)
	refreshedToken := "refreshed-id-token"

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "AT",
			"token_type":    "Bearer",
			"expires_in":    3600,
			"refresh_token": "new-refresh-token",
			"id_token":      refreshedToken,
		}))
	})

	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })
	require.NoError(t, tokenCache.Set(context.Background(), "oidc-token-"+staleToken, "cached-refresh-token"))

	kubeConfigStore := kubeconfig.NewContextStore()
	newImpersonationMiddlewareTestContext(t, kubeConfigStore, clusterName, srv.URL)

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:      kubeConfigStore,
		Cache:                tokenCache,
		TelemetryHandler:     &telemetry.RequestHandler{},
		UseInCluster:         true,
		OidcUseImpersonation: true,
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

	req := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/clusters/"+clusterName+"/api/v1/nodes", nil)
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-" + auth.SanitizeClusterName(clusterName) + ".0",
		Value:    staleToken,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	rec := httptest.NewRecorder()

	middleware.ServeHTTP(rec, req)

	cookies := rec.Result().Cookies()
	require.NotEmpty(t, cookies, "a cookie-backed token refresh under impersonation must still set a cookie")

	// SetTokenCookie's ClearTokenCookie pre-step unconditionally emits its own clearing
	// Set-Cookie header(s) for this name before the real value is written, so the first header
	// matching the name is not necessarily the one a browser would end up holding; take the
	// last one instead (see findAuthCookie in auth_test.go for the same reasoning).
	var last *http.Cookie

	for _, c := range cookies {
		if c.Name == "headlamp-auth-"+auth.SanitizeClusterName(clusterName)+".0" {
			last = c
		}
	}

	require.NotNil(t, last, "expected a refreshed auth cookie for %s", clusterName)
	assert.Equal(t, "/", last.Path, "impersonation must widen the refreshed cookie to deployment scope")
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
