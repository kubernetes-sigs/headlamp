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
	"net/url"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/gcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockGCPCache implements the cache interface for testing.
type mockGCPCache struct {
	data map[string]interface{}
}

func newMockGCPCache() *mockGCPCache {
	return &mockGCPCache{
		data: make(map[string]interface{}),
	}
}

func (m *mockGCPCache) Get(ctx context.Context, key string) (interface{}, error) {
	val, ok := m.data[key]
	if !ok {
		return nil, assert.AnError
	}

	return val, nil
}

func (m *mockGCPCache) Set(ctx context.Context, key string, value interface{}) error {
	m.data[key] = value
	return nil
}

func (m *mockGCPCache) SetWithTTL(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	m.data[key] = value
	return nil
}

func (m *mockGCPCache) Delete(ctx context.Context, key string) error {
	delete(m.data, key)
	return nil
}

func (m *mockGCPCache) GetAll(ctx context.Context, selectFunc cache.Matcher) (map[string]interface{}, error) {
	result := make(map[string]interface{})

	for k, v := range m.data {
		if selectFunc == nil || selectFunc(k) {
			result[k] = v
		}
	}

	return result, nil
}

func (m *mockGCPCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	return nil
}

func TestHandleGCPAuthLogin_MissingCluster(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthLogin(gcpAuth, "")

	req := httptest.NewRequest(http.MethodGet, "/gcp-auth/login", nil)
	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "cluster parameter required")
}

func TestHandleGCPAuthLogin_InvalidClusterName(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthLogin(gcpAuth, "")

	tests := []struct {
		name        string
		cluster     string
		errContains string
	}{
		{
			name:        "cluster name starting with hyphen",
			cluster:     "-invalid-cluster",
			errContains: "invalid cluster name format",
		},
		{
			name:        "cluster name starting with dot",
			cluster:     ".invalid-cluster",
			errContains: "invalid cluster name format",
		},
		{
			name:        "cluster name starting with underscore",
			cluster:     "_invalid-cluster",
			errContains: "invalid cluster name format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/gcp-auth/login?cluster="+url.QueryEscape(tt.cluster), nil)
			rr := httptest.NewRecorder()

			handler(rr, req)

			assert.Equal(t, http.StatusBadRequest, rr.Code)
			assert.Contains(t, rr.Body.String(), tt.errContains)
		})
	}
}

func TestHandleGCPAuthLogin_ValidClusterName(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthLogin(gcpAuth, "")

	tests := []struct {
		name    string
		cluster string
	}{
		{
			name:    "simple cluster name",
			cluster: "my-cluster",
		},
		{
			name:    "cluster name with underscore",
			cluster: "my_cluster",
		},
		{
			name:    "cluster name with dots",
			cluster: "my.cluster.name",
		},
		{
			name:    "alphanumeric cluster name",
			cluster: "cluster123",
		},
		{
			name:    "GKE style cluster name",
			cluster: "gke_project-id_us-central1_cluster-name",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/gcp-auth/login?cluster="+tt.cluster, nil)
			rr := httptest.NewRecorder()

			handler(rr, req)

			// Should redirect to Google OAuth
			assert.Equal(t, http.StatusFound, rr.Code)

			// Should set OAuth cookies
			cookies := rr.Result().Cookies()
			require.GreaterOrEqual(t, len(cookies), 3)

			// Verify cookie names
			cookieNames := make(map[string]bool)
			for _, c := range cookies {
				cookieNames[c.Name] = true
			}

			assert.True(t, cookieNames["gcp_oauth_state"], "should have state cookie")
			assert.True(t, cookieNames["gcp_oauth_cluster"], "should have cluster cookie")
			assert.True(t, cookieNames["gcp_oauth_verifier"], "should have verifier cookie")

			// Verify redirect URL contains Google OAuth
			location := rr.Header().Get("Location")
			assert.Contains(t, location, "accounts.google.com")
			assert.Contains(t, location, "client_id=test-client-id")
		})
	}
}

func TestHandleGCPAuthLogin_CookieAttributes(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthLogin(gcpAuth, "")

	req := httptest.NewRequest(http.MethodGet, "/gcp-auth/login?cluster=test-cluster", nil)
	req.Host = "localhost"
	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusFound, rr.Code)

	// Check cookie attributes
	cookies := rr.Result().Cookies()

	for _, cookie := range cookies {
		// All OAuth cookies should be HttpOnly
		assert.True(t, cookie.HttpOnly, "cookie %s should be HttpOnly", cookie.Name)
		// Should have SameSite=Lax for OAuth flow
		assert.Equal(t, http.SameSiteLaxMode, cookie.SameSite, "cookie %s should have SameSite=Lax", cookie.Name)
		// Path should be root
		assert.Equal(t, "/", cookie.Path, "cookie %s should have path=/", cookie.Name)
	}
}

func TestHandleGCPAuthLogin_WithBaseURL(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/headlamp/callback", cache)

	handler := auth.HandleGCPAuthLogin(gcpAuth, "headlamp")

	req := httptest.NewRequest(http.MethodGet, "/headlamp/gcp-auth/login?cluster=test-cluster", nil)
	rr := httptest.NewRecorder()

	handler(rr, req)

	// Should still redirect successfully
	assert.Equal(t, http.StatusFound, rr.Code)
}

func TestHandleGCPAuthCallback_MissingStateCookie(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthCallback(gcpAuth, "")

	req := httptest.NewRequest(http.MethodGet, "/gcp-auth/callback?code=test-code&state=test-state", nil)
	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "state cookie not found")
}

func TestHandleGCPAuthCallback_StateMismatch(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthCallback(gcpAuth, "")

	req := httptest.NewRequest(http.MethodGet, "/gcp-auth/callback?code=test-code&state=different-state", nil)
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_state",
		Value: "test-state",
	})
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_cluster",
		Value: "test-cluster",
	})
	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "state mismatch")
}

func TestHandleGCPAuthCallback_MissingClusterCookie(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthCallback(gcpAuth, "")

	req := httptest.NewRequest(http.MethodGet, "/gcp-auth/callback?code=test-code&state=test-state", nil)
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_state",
		Value: "test-state",
	})
	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "cluster cookie not found")
}

func TestHandleGCPAuthCallback_InvalidClusterInCookie(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthCallback(gcpAuth, "")

	req := httptest.NewRequest(http.MethodGet, "/gcp-auth/callback?code=test-code&state=test-state", nil)
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_state",
		Value: "test-state",
	})
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_cluster",
		Value: "-invalid-cluster",
	})
	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid cluster name format")
}

func TestHandleGCPAuthCallback_OAuthError(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthCallback(gcpAuth, "")

	callbackURL := "/gcp-auth/callback?error=access_denied&error_description=User+denied+access&state=test-state"
	req := httptest.NewRequest(http.MethodGet, callbackURL, nil)
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_state",
		Value: "test-state",
	})
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_cluster",
		Value: "test-cluster",
	})

	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "OAuth error")
	assert.Contains(t, rr.Body.String(), "access_denied")
}

func TestHandleGCPAuthCallback_MissingCode(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPAuthCallback(gcpAuth, "")

	req := httptest.NewRequest(http.MethodGet, "/gcp-auth/callback?state=test-state", nil)
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_state",
		Value: "test-state",
	})
	req.AddCookie(&http.Cookie{
		Name:  "gcp_oauth_cluster",
		Value: "test-cluster",
	})

	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "no code in request")
}

func TestHandleGCPTokenRefresh_MissingClusterAndToken(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPTokenRefresh(gcpAuth, "")

	req := httptest.NewRequest(http.MethodPost, "/gcp-auth/refresh", nil)
	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "cluster and token required")
}

func TestHandleGCPTokenRefresh_NoCachedRefreshToken(t *testing.T) {
	t.Parallel()

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	handler := auth.HandleGCPTokenRefresh(gcpAuth, "")

	req := httptest.NewRequest(http.MethodPost, "/clusters/test-cluster/gcp-auth/refresh", nil)
	req.Header.Set("Authorization", "Bearer test-token")

	rr := httptest.NewRecorder()

	handler(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "no refresh token available")
}

func TestValidClusterNamePattern(t *testing.T) {
	t.Parallel()

	// Test the pattern that's used for cluster name validation
	tests := []struct {
		name    string
		cluster string
		valid   bool
	}{
		{"simple name", "cluster", true},
		{"with hyphen", "my-cluster", true},
		{"with underscore", "my_cluster", true},
		{"with dot", "my.cluster", true},
		{"with numbers", "cluster123", true},
		{"GKE format", "gke_project_zone_name", true},
		{"starts with number", "123cluster", true},
		{"starts with hyphen", "-cluster", false},
		{"starts with dot", ".cluster", false},
		{"starts with underscore", "_cluster", false},
	}

	cache := newMockGCPCache()
	gcpAuth := gcp.NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)
	handler := auth.HandleGCPAuthLogin(gcpAuth, "")

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/gcp-auth/login?cluster="+url.QueryEscape(tt.cluster), nil)
			rr := httptest.NewRecorder()

			handler(rr, req)

			if tt.valid {
				// Valid cluster names should redirect (302)
				assert.Equal(t, http.StatusFound, rr.Code, "cluster %q should be valid", tt.cluster)
			} else {
				// Invalid cluster names should return 400
				assert.Equal(t, http.StatusBadRequest, rr.Code, "cluster %q should be invalid", tt.cluster)
			}
		})
	}
}
