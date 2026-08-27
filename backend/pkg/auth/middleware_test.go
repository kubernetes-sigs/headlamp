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
	"fmt"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
)

type spyContextStore struct {
	kubeconfig.ContextStore
	calledWith []string
}

func (s *spyContextStore) GetContext(name string) (*kubeconfig.Context, error) {
	s.calledWith = append(s.calledWith, name)
	return nil, errors.New("context not found in test")
}

//nolint:funlen
func TestNewOIDCTokenRefreshMiddleware(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	t.Run("root baseURL requests", func(t *testing.T) {
		spyStore := &spyContextStore{}
		config := auth.OIDCTokenRefreshConfig{
			KubeConfigStore:  spyStore,
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
		}
		middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

		// Non-cluster request is skipped without context lookup
		req := httptest.NewRequestWithContext(context.Background(), "GET", "/non-cluster", nil)
		rec := httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Empty(t, spyStore.calledWith)

		// Cluster request without token is bypassed without context lookup
		req = httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/test-cluster", nil)
		rec = httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Empty(t, spyStore.calledWith)

		// Cluster request with token reaches context lookup
		req = httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/test-cluster/api", nil)
		req.Header.Set("Authorization", "Bearer test-token")

		rec = httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{"test-cluster"}, spyStore.calledWith)
	})

	t.Run("slash-only BaseURL behaves as root mount", func(t *testing.T) {
		spyStore := &spyContextStore{}
		config := auth.OIDCTokenRefreshConfig{
			KubeConfigStore:  spyStore,
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
			BaseURL:          "/",
		}
		middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

		// Header-backed request
		req := httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/slash-cluster/api", nil)
		req.Header.Set("Authorization", "Bearer test-token")

		rec := httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{"slash-cluster"}, spyStore.calledWith)

		// Cookie-backed request
		cookieReq := httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/slash-cluster/api", nil)
		cookieReq.AddCookie(&http.Cookie{
			Name:     fmt.Sprintf("headlamp-auth-%s.0", auth.SanitizeClusterName("slash-cluster")),
			Value:    "test-cookie-token",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
			Path:     auth.GetCookiePath("/", "slash-cluster"),
		})

		cookieRec := httptest.NewRecorder()

		middleware.ServeHTTP(cookieRec, cookieReq)
		assert.Equal(t, http.StatusOK, cookieRec.Code)
		assert.Equal(t, []string{"slash-cluster", "slash-cluster"}, spyStore.calledWith)
	})

	t.Run("subpath BaseURL requests", func(t *testing.T) {
		spyStore := &spyContextStore{}
		config := auth.OIDCTokenRefreshConfig{
			KubeConfigStore:  spyStore,
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
			BaseURL:          "/headlamp",
		}
		middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

		// Subpath non-cluster request is skipped without context lookup
		req := httptest.NewRequestWithContext(context.Background(), "GET", "/headlamp/non-cluster", nil)
		rec := httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Empty(t, spyStore.calledWith)

		// Subpath cluster request with token is processed and reaches context lookup
		req = httptest.NewRequestWithContext(context.Background(), "GET", "/headlamp/clusters/subpath-cluster/api", nil)
		req.Header.Set("Authorization", "Bearer test-subpath-token")

		rec = httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{"subpath-cluster"}, spyStore.calledWith)

		// Subpath nested cluster request (Cluster API URL) resolves the first cluster name
		nestedURL := "/headlamp/clusters/prod/apis/cluster.x-k8s.io/v1beta1/namespaces/default/clusters/demo"
		req = httptest.NewRequestWithContext(context.Background(), "GET", nestedURL, nil)
		req.Header.Set("Authorization", "Bearer test-nested-token")

		rec = httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, []string{"subpath-cluster", "prod"}, spyStore.calledWith)
	})
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
