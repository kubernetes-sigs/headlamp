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
	"crypto/tls"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
)

const (
	localhost       = "localhost:3000"
	localhostOrigin = "http://localhost:3000"
)

func TestSanitizeClusterName(t *testing.T) {
	longInput := "very-long-cluster-name-that-exceeds-fifty-characters-limit"
	longExpected := auth.SanitizeClusterName(longInput)

	tests := []struct {
		input    string
		expected string
	}{
		{"my-cluster", "my-cluster"},
		{"my_cluster", "my_cluster"},
		{"cluster123", "cluster123"},
		{"my-cluster@#$%", "my-cluster"},
		{"", ""},
		{longInput, longExpected},
	}

	for _, test := range tests {
		result := auth.SanitizeClusterName(test.input)
		if result != test.expected {
			t.Errorf("SanitizeClusterName(%q) = %q, expected %q", test.input, result, test.expected)
		}
	}
}

func TestSanitizeClusterName_NoCollisionsOnLongPrefixes(t *testing.T) {
	clusterA := "production-us-east-1-kubernetes-cluster-primary-alpha"
	clusterB := "production-us-east-1-kubernetes-cluster-primary-bravo"

	sanitizedA := auth.SanitizeClusterName(clusterA)
	sanitizedB := auth.SanitizeClusterName(clusterB)

	if len(sanitizedA) > 50 {
		t.Errorf("Expected len(sanitizedA) <= 50, got %d", len(sanitizedA))
	}

	if len(sanitizedB) > 50 {
		t.Errorf("Expected len(sanitizedB) <= 50, got %d", len(sanitizedB))
	}

	if sanitizedA == sanitizedB {
		t.Errorf("Expected distinct sanitized names for distinct clusters, but both got %q", sanitizedA)
	}
}

var isSecureContextTests = []struct {
	name     string
	setupReq func() *http.Request
	expected bool
}{
	{
		name: "HTTPS request",
		setupReq: func() *http.Request {
			req := httptest.NewRequestWithContext(context.Background(), "GET", "https://example.com", nil)
			req.TLS = &tls.ConnectionState{}

			return req
		},
		expected: true,
	},
	{
		name: "HTTP with X-Forwarded-Proto https",
		setupReq: func() *http.Request {
			req := httptest.NewRequest("GET", "http://example.com", nil)
			req.Header.Set("X-Forwarded-Proto", "https")

			return req
		},
		expected: true,
	},
	{
		name: "localhost HTTP",
		setupReq: func() *http.Request {
			req := httptest.NewRequest("GET", localhostOrigin, nil)
			req.Host = localhost

			return req
		},
		expected: false,
	},
	{
		name: "127.0.0.1 HTTP",
		setupReq: func() *http.Request {
			req := httptest.NewRequest("GET", "http://127.0.0.1:3000", nil)
			req.Host = "127.0.0.1:3000"

			return req
		},
		expected: false,
	},
	{
		name: "plain HTTP",
		setupReq: func() *http.Request {
			req := httptest.NewRequest("GET", "http://example.com", nil)
			req.Host = "example.com"

			return req
		},
		expected: false,
	},
}

func TestIsSecureContext(t *testing.T) {
	for _, test := range isSecureContextTests {
		t.Run(test.name, func(t *testing.T) {
			req := test.setupReq()
			result := auth.IsSecureContext(req)

			if result != test.expected {
				t.Errorf("IsSecureContext() = %v, expected %v", result, test.expected)
			}
		})
	}
}

func TestGetCookiePath(t *testing.T) {
	tests := []struct {
		name     string
		baseURL  string
		cluster  string
		wantPath string
	}{
		{
			name:     "empty base URL",
			baseURL:  "",
			cluster:  "test-cluster",
			wantPath: "/clusters/test-cluster",
		},
		{
			name:     "base URL without leading slash",
			baseURL:  "headlamp",
			cluster:  "test-cluster",
			wantPath: "/headlamp/clusters/test-cluster",
		},
		{
			name:     "base URL with leading slash",
			baseURL:  "/headlamp",
			cluster:  "test-cluster",
			wantPath: "/headlamp/clusters/test-cluster",
		},
		{
			name:     "base URL with trailing slash",
			baseURL:  "/headlamp/",
			cluster:  "test-cluster",
			wantPath: "/headlamp/clusters/test-cluster",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := auth.GetCookiePath(tt.baseURL, tt.cluster)
			if got != tt.wantPath {
				t.Errorf("getCookiePath() = %q, want %q", got, tt.wantPath)
			}
		})
	}
}

func TestSetAndGetAuthCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhost, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Test setting a cookie
	testTTL := 100
	auth.SetTokenCookie(w, req, "test-cluster", "test-token", "", testTTL)

	// Check if cookie was set (1 token chunk + 9 cleared chunk headers)
	cookies := w.Result().Cookies()
	if len(cookies) != 10 {
		t.Fatalf("Expected 10 cookies, got %d", len(cookies))
	}

	cookie := cookies[0]
	if cookie.Name != "headlamp-auth-test-cluster.0" {
		t.Errorf("Expected cookie name 'headlamp-auth-test-cluster.0', got %q", cookie.Name)
	}

	if cookie.Value != "test-token" {
		t.Errorf("Expected cookie value 'test-token', got %q", cookie.Value)
	}

	if !cookie.HttpOnly {
		t.Error("Expected HttpOnly to be true")
	}

	if cookie.SameSite != http.SameSiteStrictMode {
		t.Error("Expected SameSite to be SameSiteStrictMode")
	}

	if cookie.MaxAge != testTTL {
		t.Errorf("Expected MaxAge to be %d, got %d", testTTL, cookie.MaxAge)
	}

	// Test getting the cookie
	for _, c := range cookies {
		if c.MaxAge > 0 {
			req.AddCookie(c)
		}
	}

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetAuthCookie failed: %v", err)
	}

	if token != "test-token" {
		t.Errorf("Expected token to be 'test-token', got %q", token)
	}
}

func TestGetAuthCookieChunked(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Create a long token that will be chunked
	longToken := strings.Repeat("a", 5000)

	// Test setting a cookie
	auth.SetTokenCookie(w, req, "test-cluster", longToken, "", 86400)

	// Check if cookie was set
	cookies := w.Result().Cookies()
	if len(cookies) != 10 {
		t.Fatalf("Expected 10 cookies (2 token chunks + 8 cleared chunks), got %d", len(cookies))
	}

	// Test getting the cookie
	for _, cookie := range cookies {
		if cookie.MaxAge > 0 {
			req.AddCookie(cookie)
		}
	}

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetAuthCookie failed: %v", err)
	}

	if token != longToken {
		t.Errorf("Expected token to be %q, got %q", longToken, token)
	}
}

func TestClearAuthCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Clear cookies for a cluster
	auth.ClearTokenCookie(w, req, "test-cluster", "")

	// Check if cookies were set to be cleared (maxCookieChunks = 10)
	cookies := w.Result().Cookies()
	if len(cookies) != 10 {
		t.Fatalf("Expected 10 clearing cookies, got %d", len(cookies))
	}

	for i, cookie := range cookies {
		expectedName := fmt.Sprintf("headlamp-auth-test-cluster.%d", i)
		if cookie.Name != expectedName {
			t.Errorf("Expected cookie name %q, got %q", expectedName, cookie.Name)
		}

		if cookie.Value != "" {
			t.Errorf("Expected cookie value to be empty for %s, got %q", cookie.Name, cookie.Value)
		}

		if cookie.MaxAge != -1 {
			t.Errorf("Expected MaxAge to be -1 for %s, got %d", cookie.Name, cookie.MaxAge)
		}
	}
}

func TestClearAuthCookie_WithoutIncomingCookies(t *testing.T) {
	// Simulate a request to /auth/set-token or global path where browser sends no cookies
	req := httptest.NewRequestWithContext(context.Background(), "POST", "http://localhost:4466/auth/set-token", nil)
	w := httptest.NewRecorder()

	auth.ClearTokenCookie(w, req, "my-cluster", "")

	cookies := w.Result().Cookies()
	if len(cookies) != 10 {
		t.Fatalf("Expected 10 expiration cookies when request carries no incoming cookies, got %d", len(cookies))
	}

	if cookies[0].Name != "headlamp-auth-my-cluster.0" {
		t.Errorf("Expected first cookie name 'headlamp-auth-my-cluster.0', got %q", cookies[0].Name)
	}

	if cookies[0].MaxAge != -1 {
		t.Errorf("Expected MaxAge to be -1, got %d", cookies[0].MaxAge)
	}
}
