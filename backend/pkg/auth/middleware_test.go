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
	"sync"
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

func setupConcurrentRefreshMiddleware(t *testing.T, cluster, token string) (http.Handler, func() int) {
	t.Helper()

	var (
		mu    sync.Mutex
		calls int
	)

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		calls++
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + token: "REFRESH_OLD"}}

	kubeConfigStore := kubeconfig.NewContextStore()
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:     cluster,
		OidcConf: &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
	}))

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            fc,
		TelemetryHandler: &telemetry.RequestHandler{},
		OidcIdpIssuerURL: srv.URL,
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	callCount := func() int {
		mu.Lock()
		defer mu.Unlock()

		return calls
	}

	return auth.NewOIDCTokenRefreshMiddleware(config)(handler), callCount
}

// TestNewOIDCTokenRefreshMiddleware_ConcurrentRequests_DedupesAndSetsCookie exercises
// the full middleware flow (expiry check, discovery, deduplicated refresh, cookie write)
// under concurrent requests for the same expiring token, covering issue #6793's
// acceptance criteria: exactly one token-endpoint call, and no stale cookie clobbering.
func TestNewOIDCTokenRefreshMiddleware_ConcurrentRequests_DedupesAndSetsCookie(t *testing.T) {
	const cluster = "test"

	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
	})

	middleware, callCount := setupConcurrentRefreshMiddleware(t, cluster, token)

	const concurrency = 10

	var (
		wg    sync.WaitGroup
		ready sync.WaitGroup
		start = make(chan struct{})
	)

	responses := make([]*http.Response, concurrency)

	ready.Add(concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			req := httptest.NewRequestWithContext(
				context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil,
			)
			req.Header.Set("Authorization", "Bearer "+token)

			rr := httptest.NewRecorder()

			ready.Done()
			<-start // release every goroutine at once to maximize overlap

			middleware.ServeHTTP(rr, req)

			responses[i] = rr.Result()
		}(i)
	}

	ready.Wait()
	close(start)
	wg.Wait()

	assert.Equal(t, 1, callCount(), "expected exactly one token-endpoint call for concurrent middleware requests")

	for i, resp := range responses {
		defer func() { _ = resp.Body.Close() }()

		cookieVal, ok := findAuthCookie(resp)
		require.Truef(t, ok, "expected auth cookie for goroutine %d", i)
		assert.Equal(t, "NEW", cookieVal, "goroutine %d should receive current refreshed token", i)
	}
}
