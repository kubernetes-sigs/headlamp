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

func TestRefreshRetiresTransportOnlyAfterResponseFlush(t *testing.T) {
	oldToken := makeJWTWithPayload(t, map[string]interface{}{"exp": float64(time.Now().Add(-time.Minute).Unix())})
	provider := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "cluster", OidcConf: &kubeconfig.OidcConfig{ClientID: "client", IdpIssuerURL: provider.URL},
	}))

	recorder := httptest.NewRecorder()
	retired := make(chan struct{})
	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore: store, TelemetryHandler: &telemetry.RequestHandler{},
		Cache: &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "refresh"}},
		OnTokenRefreshed: func(_, _, _ string) func() {
			return func() {
				assert.True(t, recorder.Flushed)
				close(retired)
			}
		},
	}
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	handler := auth.NewOIDCTokenRefreshMiddleware(config)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(entered)
		<-release
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/cluster/api/v1/pods", nil)
	req.Header.Set("Authorization", "Bearer "+oldToken)

	go func() {
		defer close(done)

		handler.ServeHTTP(recorder, req)
	}()

	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("refresh did not reach downstream handler")
	}

	select {
	case <-retired:
		t.Error("transport retired while replacement cookie was still buffered")
	case <-time.After(1100 * time.Millisecond):
	}

	close(release)
	<-done

	select {
	case <-retired:
	default:
		t.Fatal("transport was not retired after cookie response flush")
	}

	cookie, _ := findAuthCookie(recorder.Result(), "cluster")
	assert.Equal(t, "NEW", cookie)
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
