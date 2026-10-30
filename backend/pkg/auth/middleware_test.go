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
	"testing"

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

// countingStore counts GetContext calls so tests can assert the middleware
// loads a context only when a token or a shared cookie makes it necessary.
type countingStore struct {
	kubeconfig.ContextStore
	calls int
}

func (s *countingStore) GetContext(name string) (*kubeconfig.Context, error) {
	s.calls++
	return s.ContextStore.GetContext(name)
}

// TestOIDCTokenRefreshMiddlewareHonoursBaseURL: with -base-url the request path
// is <baseURL>/clusters/<cluster>/..., which the middleware used to treat as a
// non-cluster request, so tokens behind a base URL were never refreshed. The
// context is now loaded (and the refresh considered) below the base URL too.
func TestOIDCTokenRefreshMiddlewareHonoursBaseURL(t *testing.T) {
	for _, tc := range []struct {
		configBaseURL, path string
		wantContextLoads    int
	}{
		{"/headlamp", "/headlamp/clusters/main/api", 1},
		{"", "/headlamp/clusters/main/api", 0}, // not a cluster request without a base URL
		{"/headlamp", "/clusters/main/api", 0}, // every route lives below the base URL
		{"", "/clusters/main/api", 1},
	} {
		t.Run(tc.configBaseURL+" "+tc.path, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(newOIDCContext("main", testIssuerA, testClientFoo)))
			counting := &countingStore{ContextStore: store}

			handler := auth.NewOIDCTokenRefreshMiddleware(auth.OIDCTokenRefreshConfig{
				KubeConfigStore:  counting,
				TelemetryHandler: &telemetry.RequestHandler{},
				BaseURL:          tc.configBaseURL,
			})(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))

			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.path, nil)
			addRequestCookie(req, "headlamp-auth-main.0", "own-token")
			handler.ServeHTTP(httptest.NewRecorder(), req)

			assert.Equal(t, tc.wantContextLoads, counting.calls)
		})
	}
}
