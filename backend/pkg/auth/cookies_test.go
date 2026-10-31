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
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/stretchr/testify/require"
)

const (
	localhost       = "localhost:3000"
	localhostOrigin = "http://localhost:3000"
)

func addRequestCookie(req *http.Request, name, value string) {
	//nolint:gosec // Request cookie fixture; response security attributes do not apply.
	req.AddCookie(&http.Cookie{Name: name, Value: value})
}

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
		result := auth.SanitizeClusterName(test.input)
		if result != test.expected {
			t.Errorf("SanitizeClusterName(%q) = %q, expected %q", test.input, result, test.expected)
		}
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
		{
			name:     "slash-containing cluster",
			baseURL:  "/headlamp",
			cluster:  "team/cluster",
			wantPath: "/headlamp/clusters/team/cluster",
		},
		{
			name:     "slash-only base URL",
			baseURL:  "/",
			cluster:  "test-cluster",
			wantPath: "/clusters/test-cluster",
		},
		{
			name:     "multiple slashes only base URL",
			baseURL:  "///",
			cluster:  "test-cluster",
			wantPath: "/clusters/test-cluster",
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

func TestClusterURLSegmentEncoding(t *testing.T) {
	for _, cluster := range []string{"team/cluster", "team/../prod", "dömäin/cluster", "~YWJj"} {
		encoded := auth.EncodeClusterForURL(cluster)
		if strings.Contains(encoded, "/") || encoded == "." || encoded == ".." {
			t.Errorf("Encoded cluster %q is not path-safe: %q", cluster, encoded)
		}

		decoded, err := auth.DecodeClusterFromURL(encoded)
		if err != nil {
			t.Fatalf("DecodeClusterFromURL(%q) failed: %v", encoded, err)
		}

		if decoded != cluster {
			t.Errorf("DecodeClusterFromURL(%q) = %q, want %q", encoded, decoded, cluster)
		}
	}
}

func TestSetAndGetAuthCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhost, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Test setting a cookie
	testTTL := 100
	if err := auth.SetTokenCookie(w, req, "test-cluster", "test-token", "", testTTL); err != nil {
		t.Fatalf("SetTokenCookie failed: %v", err)
	}

	// Check if cookie was set
	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("Expected token chunk and terminal cleanup cookie, got %d", len(cookies))
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
	req.AddCookie(cookie)

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetAuthCookie failed: %v", err)
	}

	if token != "test-token" {
		t.Errorf("Expected token 'test-token', got %q", token)
	}
}

func TestGetAuthCookieChunked(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Create a long token that will be chunked
	longToken := strings.Repeat("a", 5000)

	// Test setting a cookie
	if err := auth.SetTokenCookie(w, req, "test-cluster", longToken, "", 86400); err != nil {
		t.Fatalf("SetTokenCookie failed: %v", err)
	}

	// Check if cookie was set
	cookies := w.Result().Cookies()
	if len(cookies) != 3 {
		t.Fatalf("Expected 2 token chunks and terminal cleanup cookie, got %d", len(cookies))
	}

	// Test getting the cookie
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetAuthCookie failed: %v", err)
	}

	if token != longToken {
		t.Errorf("Expected token to be %q, got %q", longToken, token)
	}
}

func TestSetAuthTokenCookieEnforcesBoundedChunks(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	t.Run("accepts boundary", func(t *testing.T) {
		w := httptest.NewRecorder()
		token := strings.Repeat("a", 32*3800)

		if err := auth.SetTokenCookie(w, req, "test-cluster", token, "", 86400); err != nil {
			t.Fatalf("SetTokenCookie rejected boundary token: %v", err)
		}

		cookies := w.Result().Cookies()
		if len(cookies) != 32 {
			t.Fatalf("Expected 32 token chunks, got %d", len(cookies))
		}

		for _, cookie := range cookies {
			if cookie.Value == "" || cookie.MaxAge == -1 {
				t.Fatalf("Expected stored boundary chunk, got %#v", cookie)
			}
		}
	})

	t.Run("rejects oversized token and clears first chunk", func(t *testing.T) {
		w := httptest.NewRecorder()
		token := strings.Repeat("a", 32*3800+1)

		if err := auth.SetTokenCookie(w, req, "test-cluster", token, "", 86400); err == nil {
			t.Fatal("Expected oversized authentication token error")
		}

		cookies := w.Result().Cookies()
		if len(cookies) != 1 {
			t.Fatalf("Expected one terminal cleanup cookie, got %d", len(cookies))
		}

		for _, cookie := range cookies {
			if cookie.SameSite != http.SameSiteStrictMode {
				t.Fatal("Auth cleanup cookie must retain desktop SameSite rewrite compatibility")
			}

			if cookie.Value != "" || cookie.MaxAge != -1 {
				t.Fatalf("Expected oversized token cleanup cookie, got %#v", cookie)
			}
		}
	})
}

func TestGetAuthTokenCookieIgnoresChunksBeyondStorageLimit(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)

	for i := 0; i < 32; i++ {
		addRequestCookie(req, fmt.Sprintf("headlamp-auth-test-cluster.%d", i), "a")
	}

	addRequestCookie(req, "headlamp-auth-test-cluster.32", "stale")

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetTokenFromCookie failed: %v", err)
	}

	if token != strings.Repeat("a", 32) {
		t.Fatalf("Expected only supported chunks, got %q", token)
	}
}

func TestGetAuthTokenCookieStopsAtTerminalChunk(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	addRequestCookie(req, "headlamp-auth-test-cluster.0", "current")
	addRequestCookie(req, "headlamp-auth-test-cluster.1", "")
	addRequestCookie(req, "headlamp-auth-test-cluster.2", "stale")

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetTokenFromCookie failed: %v", err)
	}

	if token != "current" {
		t.Fatalf("Expected terminal chunk to hide stale suffix, got %q", token)
	}
}

func TestClearAuthCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Set cookie
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-test-cluster.0",
		Value:    "test-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   86400, // 24 hours
	})

	// Clear a cookie
	auth.ClearTokenCookie(w, req, "test-cluster", "")

	// Check if cookie was set
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("Expected 1 cookie, got %d", len(cookies))
	}

	// Test clearing the cookie
	auth.ClearTokenCookie(w, req, "test-cluster", "")

	// Check if cookie was cleared
	clearedCookies := w.Result().Cookies()
	if len(clearedCookies) != 1 {
		t.Fatalf("Expected 1 cookie, got %d", len(clearedCookies))
	}

	cookie := clearedCookies[0]
	if cookie.Name != "headlamp-auth-test-cluster.0" {
		t.Errorf("Expected cookie name 'headlamp-auth-test-cluster.0', got %q", cookie.Name)
	}

	if cookie.Value != "" {
		t.Errorf("Expected cookie value to be empty, got %q", cookie.Value)
	}

	if cookie.MaxAge != -1 {
		t.Errorf("Expected MaxAge to be -1, got %d", cookie.MaxAge)
	}
}

func TestLogoutCookiesPreserveDesktopRewriteAttributes(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, localhostOrigin, nil)

	w := httptest.NewRecorder()
	if err := auth.SetTokenCookie(w, req, "test-cluster", "short-token", "", 3600); err != nil {
		t.Fatal(err)
	}

	auth.ClearTokenCookieBounded(w, req, "test-cluster", "")

	if err := auth.SetIDTokenCookie(w, req, "test-cluster", "id-token", "", 3600); err != nil {
		t.Fatal(err)
	}

	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	for _, cookie := range w.Result().Cookies() {
		if cookie.SameSite != http.SameSiteStrictMode || !cookie.HttpOnly {
			t.Fatalf("Cookie %s bypasses desktop's Strict-to-None rewrite: %#v", cookie.Name, cookie)
		}
	}
}

func TestSetAndGetIDTokenCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhost, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	testTTL := 100
	if err := auth.SetIDTokenCookie(w, req, "test-cluster", "test-id-token", "", testTTL); err != nil {
		t.Fatalf("SetIDTokenCookie failed: %v", err)
	}

	cookies := w.Result().Cookies()
	if len(cookies) < 1 {
		t.Fatalf("Expected at least 1 cookie, got %d", len(cookies))
	}

	cookie := cookies[0]
	if cookie.Name != "headlamp-id-token-test-cluster.0" {
		t.Errorf("Expected cookie name 'headlamp-id-token-test-cluster.0', got %q", cookie.Name)
	}

	if cookie.Value != "test-id-token" {
		t.Errorf("Expected cookie value 'test-id-token', got %q", cookie.Value)
	}

	if !cookie.HttpOnly {
		t.Error("Expected HttpOnly to be true")
	}

	if cookie.SameSite != http.SameSiteStrictMode {
		t.Error("Expected ID token cookie SameSite to be SameSiteStrictMode")
	}

	if cookie.MaxAge != testTTL {
		t.Errorf("Expected MaxAge to be %d, got %d", testTTL, cookie.MaxAge)
	}

	if cookie.Path != auth.GetOIDCLogoutCookiePath("", "test-cluster") {
		t.Errorf("Expected logout-only cookie path, got %q", cookie.Path)
	}

	req.AddCookie(cookie)

	idToken, err := auth.GetIDTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetIDTokenFromCookie failed: %v", err)
	}

	if idToken != "test-id-token" {
		t.Errorf("Expected ID token 'test-id-token', got %q", idToken)
	}
}

func TestGetIDTokenCookieChunked(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	longIDToken := strings.Repeat("a", 5000)

	if err := auth.SetIDTokenCookie(w, req, "test-cluster", longIDToken, "", 86400); err != nil {
		t.Fatalf("SetIDTokenCookie failed: %v", err)
	}

	cookies := w.Result().Cookies()
	if len(cookies) < 2 {
		t.Fatalf("Expected at least 2 cookies for a chunked ID token, got %d", len(cookies))
	}

	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}

	idToken, err := auth.GetIDTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetIDTokenFromCookie failed: %v", err)
	}

	if idToken != longIDToken {
		t.Errorf("Expected ID token to be %d characters, got %d", len(longIDToken), len(idToken))
	}
}

func TestGetIDTokenCookieIgnoresChunksBeyondStorageLimit(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)

	for i := 0; i < 16; i++ {
		addRequestCookie(req, fmt.Sprintf("headlamp-id-token-test-cluster.%d", i), "a")
	}

	addRequestCookie(req, "headlamp-id-token-test-cluster.16", "stale")

	idToken, err := auth.GetIDTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetIDTokenFromCookie failed: %v", err)
	}

	if idToken != strings.Repeat("a", 16) {
		t.Fatalf("Expected only supported chunks, got %q", idToken)
	}
}

func TestGetIDTokenCookieStopsAtTerminalChunk(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	addRequestCookie(req, "headlamp-id-token-test-cluster.0", "current")
	addRequestCookie(req, "headlamp-id-token-test-cluster.1", "")
	addRequestCookie(req, "headlamp-id-token-test-cluster.2", "stale")

	idToken, err := auth.GetIDTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetIDTokenFromCookie failed: %v", err)
	}

	if idToken != "current" {
		t.Fatalf("Expected terminal chunk to hide stale suffix, got %q", idToken)
	}
}

func TestClearIDTokenCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	req.AddCookie(&http.Cookie{
		Name:     "headlamp-id-token-test-cluster.0",
		Value:    "test-id-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/clusters/test-cluster",
		MaxAge:   86400,
	})

	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("Expected chunk-zero invalidation, got %d cookies", len(cookies))
	}

	cookie := cookies[0]
	if cookie.Name != "headlamp-id-token-test-cluster.0" {
		t.Errorf("Expected cookie name 'headlamp-id-token-test-cluster.0', got %q", cookie.Name)
	}

	if cookie.Value != "" {
		t.Errorf("Expected cookie value to be empty, got %q", cookie.Value)
	}

	if cookie.MaxAge != -1 {
		t.Errorf("Expected MaxAge to be -1, got %d", cookie.MaxAge)
	}

	if cookie.Path != auth.GetOIDCLogoutCookiePath("", "test-cluster") {
		t.Errorf("Expected logout-only cookie path, got %q", cookie.Path)
	}
}

func TestClearIDTokenCookieChunked(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	//nolint:gosec
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-id-token-test-cluster.0",
		Value:    "chunk0",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/clusters/test-cluster",
		MaxAge:   86400,
	})
	//nolint:gosec
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-id-token-test-cluster.1",
		Value:    "chunk1",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/clusters/test-cluster",
		MaxAge:   86400,
	})
	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("Expected both visible chunks cleared, got %d cookies", len(cookies))
	}

	for _, cookie := range cookies {
		if cookie.Value != "" {
			t.Errorf("Expected cookie value to be empty, got %q", cookie.Value)
		}

		if cookie.MaxAge != -1 {
			t.Errorf("Expected MaxAge to be -1, got %d", cookie.MaxAge)
		}

		if cookie.Path != auth.GetOIDCLogoutCookiePath("", "test-cluster") {
			t.Errorf("Expected logout-only cookie path, got %q", cookie.Path)
		}
	}
}

func TestSetIDTokenCookieClearsAllSurplusChunks(t *testing.T) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("Failed to create cookie jar: %v", err)
	}

	logoutURL, err := url.Parse(
		"https://headlamp.example" + auth.GetOIDCLogoutCookiePath("/headlamp", "test-cluster"),
	)
	if err != nil {
		t.Fatalf("Failed to parse logout URL: %v", err)
	}

	callbackURL, err := url.Parse("https://headlamp.example/headlamp/oidc-callback")
	if err != nil {
		t.Fatalf("Failed to parse callback URL: %v", err)
	}

	oldCookies := []*http.Cookie{
		newSecureTestCookie("headlamp-id-token-test-cluster.0", "old0", logoutURL.Path),
		newSecureTestCookie("headlamp-id-token-test-cluster.1", "old1", logoutURL.Path),
		newSecureTestCookie("headlamp-id-token-test-cluster.2", "old2", logoutURL.Path),
		newSecureTestCookie("headlamp-id-token-test-cluster.3", "old3", logoutURL.Path),
	}
	jar.SetCookies(logoutURL, oldCookies)

	req := httptest.NewRequestWithContext(context.Background(), "GET", callbackURL.String(), nil)

	req.Host = localhost
	for _, cookie := range jar.Cookies(callbackURL) {
		req.AddCookie(cookie)
	}

	if len(req.Cookies()) != 0 {
		t.Fatalf("Expected logout-scoped chunks to be absent at the callback path, got %#v", req.Cookies())
	}

	w := httptest.NewRecorder()

	if err := auth.SetIDTokenCookie(w, req, "test-cluster", "short-token", "/headlamp", 86400); err != nil {
		t.Fatalf("SetIDTokenCookie failed: %v", err)
	}

	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("Expected ID token chunk and terminal cleanup cookie, got %d", len(cookies))
	}

	terminalCookie := cookies[1]
	if terminalCookie.Name != "headlamp-id-token-test-cluster.1" ||
		terminalCookie.Value != "" || terminalCookie.MaxAge != -1 {
		t.Errorf("Expected terminal cleanup cookie, got %#v", terminalCookie)
	}

	if terminalCookie.Path != logoutURL.Path {
		t.Errorf("Expected terminal cookie path %q, got %q", logoutURL.Path, terminalCookie.Path)
	}
}

func TestSetIDTokenCookieRejectsMoreThanBoundedChunks(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	err := auth.SetIDTokenCookie(w, req, "test-cluster", strings.Repeat("a", 100_000), "", 86400)
	if err == nil {
		t.Fatal("Expected oversized ID token error")
	}

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("Expected one terminal cleanup cookie, got %d cookies", len(cookies))
	}

	for _, cookie := range cookies {
		if cookie.Value != "" || cookie.MaxAge != -1 {
			t.Errorf("Expected oversized token cleanup cookie, got %#v", cookie)
		}
	}
}

func newSecureTestCookie(name, value, path string) *http.Cookie {
	return &http.Cookie{
		Name:     name,
		Value:    value,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Path:     path,
	}
}

func TestClearIDTokenCookieClearsChunksAcrossGaps(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	//nolint:gosec
	req.AddCookie(&http.Cookie{
		Name:  "headlamp-id-token-test-cluster.0",
		Value: "chunk0",
		Path:  auth.GetOIDCLogoutCookiePath("", "test-cluster"),
	})
	//nolint:gosec
	req.AddCookie(&http.Cookie{
		Name:  "headlamp-id-token-test-cluster.2",
		Value: "chunk2",
		Path:  auth.GetOIDCLogoutCookiePath("", "test-cluster"),
	})

	w := httptest.NewRecorder()

	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("Expected both visible chunks cleared across gaps, got %d cookies", len(cookies))
	}

	for i, cookie := range cookies {
		expectedName := fmt.Sprintf("headlamp-id-token-test-cluster.%d", i*2)
		if cookie.Name != expectedName || cookie.MaxAge != -1 {
			t.Errorf("Expected cleared cookie %q, got %#v", expectedName, cookies[i])
		}
	}
}

func TestLogoutInvalidationSurvivesTokenResizeAndRelogin(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		set   func(http.ResponseWriter, *http.Request, string, string, string, int) error
		get   func(*http.Request, string) (string, error)
		clear func(http.ResponseWriter, *http.Request, string, string)
	}{
		{"auth", auth.GetCookiePath("", "main"), auth.SetTokenCookie, auth.GetTokenFromCookie, auth.ClearTokenCookieBounded},
		{
			"id", auth.GetOIDCLogoutCookiePath("", "main"),
			auth.SetIDTokenCookie, auth.GetIDTokenFromCookie, auth.ClearIDTokenCookie,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			jar, err := cookiejar.New(nil)
			require.NoError(t, err)
			target, err := url.Parse("https://headlamp.example" + tc.path)
			require.NoError(t, err)

			hiddenReq := httptest.NewRequestWithContext(context.Background(), http.MethodPost,
				"https://headlamp.example/oidc-callback", nil)

			for _, token := range []string{strings.Repeat("a", 12000), "short", strings.Repeat("b", 8000)} {
				w := httptest.NewRecorder()
				if err := tc.set(w, hiddenReq, "main", token, "", 3600); err != nil {
					t.Fatal(err)
				}

				jar.SetCookies(hiddenReq.URL, w.Result().Cookies())

				req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, target.String(), nil)
				for _, cookie := range jar.Cookies(target) {
					req.AddCookie(cookie)
				}

				got, err := tc.get(req, "main")
				if err != nil || got != token {
					t.Fatalf("token resize corrupted value: error=%v length=%d, want %d", err, len(got), len(token))
				}

				w = httptest.NewRecorder()
				tc.clear(w, hiddenReq, "main", "")
				require.Len(t, w.Result().Cookies(), 1, "Hidden chunks require only chunk-zero invalidation")
				jar.SetCookies(hiddenReq.URL, w.Result().Cookies())

				req = httptest.NewRequestWithContext(context.Background(), http.MethodGet, target.String(), nil)
				for _, cookie := range jar.Cookies(target) {
					req.AddCookie(cookie)
				}

				if got, _ := tc.get(req, "main"); got != "" {
					t.Fatal("Remaining suffix cookies authenticated after logout")
				}
			}
		})
	}
}
