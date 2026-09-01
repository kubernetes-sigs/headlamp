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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

func TestOIDCTokenRefreshFailureEndsExpiredSession(t *testing.T) {
	clusterName := "inventory-cluster"
	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(-time.Minute).Unix()),
	})
	oidcServer := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "token endpoint must not be reached", http.StatusInternalServerError)
	})

	kubeConfigStore := kubeconfig.NewContextStore()
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name: clusterName,
		OidcConf: &kubeconfig.OidcConfig{
			ClientID:     "client",
			IdpIssuerURL: oidcServer.URL,
		},
	}))
	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            cache.New[interface{}](),
		TelemetryHandler: &telemetry.RequestHandler{},
	}
	nextCalled := false
	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(http.HandlerFunc(func(
		w http.ResponseWriter,
		_ *http.Request,
	) {
		nextCalled = true

		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/clusters/"+clusterName+"/api/v1/pods",
		nil,
	)
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-" + auth.SanitizeClusterName(clusterName) + ".0",
		Value:    token,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	recorder := httptest.NewRecorder()

	middleware.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	assert.False(t, nextCalled)
	assert.Contains(t, recorder.Header().Get("Set-Cookie"), "Max-Age=0")
	assert.Equal(t, `Bearer error="invalid_token"`, recorder.Header().Get("WWW-Authenticate"))
	assert.Equal(t, "application/json", recorder.Header().Get("Content-Type"))

	var status metav1.Status
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &status))
	assert.Equal(t, metav1.StatusFailure, status.Status)
	assert.Equal(t, metav1.StatusReasonUnauthorized, status.Reason)
	assert.Equal(t, int32(http.StatusUnauthorized), status.Code)
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
