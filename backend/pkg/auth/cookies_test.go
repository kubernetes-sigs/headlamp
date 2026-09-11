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
	longExpected := "very-long-cluster-name-that-exceeds-fifty-1daebb19"

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

	// Test distinct cluster names >50 chars that sanitize to the same 50-char base prefix
	lossyA := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@"
	lossyB := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#"

	sanitizedLossyA := auth.SanitizeClusterName(lossyA)
	sanitizedLossyB := auth.SanitizeClusterName(lossyB)

	if sanitizedLossyA == sanitizedLossyB {
		t.Errorf("Expected distinct sanitized names for lossy sanitized clusters, but got %q", sanitizedLossyA)
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

func applyResponseCookies(cookieMap map[string]*http.Cookie, cookies []*http.Cookie) {
	for _, c := range cookies {
		if c.MaxAge < 0 {
			delete(cookieMap, c.Name)
		} else {
			cookieMap[c.Name] = c
		}
	}
}

func TestSetTokenCookie_OverwritesLongerTokenWithShorterToken(t *testing.T) {
	cluster := "test-cluster"
	longToken := strings.Repeat("A", 3800*3+500)
	shortToken := strings.Repeat("B", 3800+500)

	req1 := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req1.Host = localhost
	w1 := httptest.NewRecorder()

	auth.SetTokenCookie(w1, req1, cluster, longToken, "", 86400)

	cookieMap := make(map[string]*http.Cookie)
	applyResponseCookies(cookieMap, w1.Result().Cookies())

	reqVerify1 := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	for _, c := range cookieMap {
		reqVerify1.AddCookie(c)
	}

	retrievedLong, err := auth.GetTokenFromCookie(reqVerify1, cluster)
	if err != nil || retrievedLong != longToken {
		t.Fatalf("Expected retrieved long token to match longToken, err: %v", err)
	}

	req2 := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req2.Host = localhost

	for _, c := range cookieMap {
		req2.AddCookie(c)
	}

	w2 := httptest.NewRecorder()
	auth.SetTokenCookie(w2, req2, cluster, shortToken, "", 86400)

	applyResponseCookies(cookieMap, w2.Result().Cookies())

	reqVerify2 := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	for _, c := range cookieMap {
		reqVerify2.AddCookie(c)
	}

	retrievedShort, err := auth.GetTokenFromCookie(reqVerify2, cluster)
	if err != nil || retrievedShort != shortToken {
		t.Fatalf("Expected retrieved short token to match shortToken, err: %v", err)
	}
}

func TestSetTokenCookie_RejectsOversizedToken(t *testing.T) {
	cluster := "test-cluster"
	// Token requiring 11 chunks (> 10 maxCookieChunks)
	oversizedToken := strings.Repeat("X", 3800*10+500)

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	auth.SetTokenCookie(w, req, cluster, oversizedToken, "", 86400)

	cookies := w.Result().Cookies()
	if len(cookies) != 0 {
		t.Fatalf("Expected 0 cookies set for oversized token exceeding maxCookieChunks, got %d", len(cookies))
	}
}

func TestClearAuthCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Set a 2-chunk cookie first
	auth.SetTokenCookie(w, req, "test-cluster", strings.Repeat("a", 5000), "", 86400)

	// Clear the cookie
	req2 := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	for _, cookie := range w.Result().Cookies() {
		req2.AddCookie(cookie)
	}

	w2 := httptest.NewRecorder()
	auth.ClearTokenCookie(w2, req2, "test-cluster", "")

	cookies := w2.Result().Cookies()
	if len(cookies) != 10 {
		t.Fatalf("Expected 10 cleared cookies, got %d", len(cookies))
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
	// Verify that ClearTokenCookie helper unconditionally emits cookie deletion headers up to maxCookieChunks
	// even when the incoming request carries no cookies.
	req := httptest.NewRequestWithContext(context.Background(), "POST", "http://localhost:4466/", nil)
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
