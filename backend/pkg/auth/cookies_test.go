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

package auth

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSanitizeClusterName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"my-cluster", "my-cluster"},
		{"my_cluster", "my_cluster"},
		{"cluster123", "cluster123"},
		{"my-cluster@#$%", "my-cluster"},
		{"", ""},
		{"very-long-cluster-name-that-exceeds-fifty-characters-limit", "very-long-cluster-name-that-exceeds-fifty-characte"},
	}

	for _, test := range tests {
		result := SanitizeClusterName(test.input)
		if result != test.expected {
			t.Errorf("SanitizeClusterName(%q) = %q, expected %q", test.input, result, test.expected)
		}
	}
}

func TestIsSecureContext(t *testing.T) {
	tests := []struct {
		name     string
		setupReq func() *http.Request
		expected bool
	}{
		{
			name: "HTTPS request",
			setupReq: func() *http.Request {
				req := httptest.NewRequest("GET", "https://example.com", nil)
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
				req := httptest.NewRequest("GET", "http://localhost:3000", nil)
				req.Host = "localhost:3000"
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

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := test.setupReq()
			result := IsSecureContext(req)
			if result != test.expected {
				t.Errorf("IsSecureContext() = %v, expected %v", result, test.expected)
			}
		})
	}
}

func TestSetAndGetAuthCookie(t *testing.T) {
	req := httptest.NewRequest("GET", "http://localhost:3000", nil)
	req.Host = "localhost:3000"
	w := httptest.NewRecorder()

	// Test setting a cookie
	SetTokenCookie(w, req, "test-cluster", "test-token")

	// Check if cookie was set
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("Expected 1 cookie, got %d", len(cookies))
	}

	cookie := cookies[0]
	if cookie.Name != "headlamp-auth-test-cluster" {
		t.Errorf("Expected cookie name 'headlamp-auth-test-cluster', got %q", cookie.Name)
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

	// Test getting the cookie
	req.AddCookie(cookie)
	token, err := GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetAuthCookie failed: %v", err)
	}
	if token != "test-token" {
		t.Errorf("Expected token 'test-token', got %q", token)
	}
}

func TestClearAuthCookie(t *testing.T) {
	req := httptest.NewRequest("GET", "http://localhost:3000", nil)
	req.Host = "localhost:3000"
	w := httptest.NewRecorder()

	// Clear a cookie
	ClearTokenCookie(w, req, "test-cluster")

	// Check if cookie was cleared (MaxAge = -1)
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("Expected 1 cookie, got %d", len(cookies))
	}

	cookie := cookies[0]
	if cookie.Name != "headlamp-auth-test-cluster" {
		t.Errorf("Expected cookie name 'headlamp-auth-test-cluster', got %q", cookie.Name)
	}
	if cookie.Value != "" {
		t.Errorf("Expected empty cookie value, got %q", cookie.Value)
	}
	if cookie.MaxAge != -1 {
		t.Errorf("Expected MaxAge -1, got %d", cookie.MaxAge)
	}
}

func TestGetAuthCookieInvalidCluster(t *testing.T) {
	req := httptest.NewRequest("GET", "http://localhost:3000", nil)

	_, err := GetTokenFromCookie(req, "")
	if err == nil {
		t.Error("Expected error for empty cluster name")
	}

	_, err = GetTokenFromCookie(req, "invalid@cluster")
	if err == nil {
		t.Error("Expected error for invalid cluster name")
	}
}
