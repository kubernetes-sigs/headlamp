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
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	localhost       = "localhost:3000"
	localhostOrigin = "http://localhost:3000"
)

func TestSanitizeClusterName(t *testing.T) {
	tests := []struct {
		input        string
		wantPrefix   string
		wantNonEmpty bool
	}{
		{input: "my-cluster", wantPrefix: "my-cluster-", wantNonEmpty: true},
		{input: "my_cluster", wantPrefix: "my_cluster-", wantNonEmpty: true},
		{input: "cluster123", wantPrefix: "cluster123-", wantNonEmpty: true},
		{input: "my-cluster@#$%", wantPrefix: "my-cluster-", wantNonEmpty: true},
		{input: "", wantNonEmpty: false},
		// All characters stripped: treated the same as an empty input (see SanitizeClusterName).
		{input: "@#$%", wantNonEmpty: false},
		{
			input:        "very-long-cluster-name-that-exceeds-fifty-characters-limit",
			wantPrefix:   "very-long-cluster-name-that-exceeds-fifty-characte-",
			wantNonEmpty: true,
		},
	}

	for _, test := range tests {
		result := auth.SanitizeClusterName(test.input)

		if !test.wantNonEmpty {
			if result != "" {
				t.Errorf("SanitizeClusterName(%q) = %q, expected empty", test.input, result)
			}

			continue
		}

		if !strings.HasPrefix(result, test.wantPrefix) {
			t.Errorf("SanitizeClusterName(%q) = %q, expected prefix %q", test.input, result, test.wantPrefix)
		}

		// 32 lowercase hex characters (128 bits of SHA-256) follow the prefix.
		suffix := strings.TrimPrefix(result, test.wantPrefix)
		if len(suffix) != 32 {
			t.Errorf("SanitizeClusterName(%q) = %q, expected a 32-character hash suffix, got %q",
				test.input, result, suffix)
		}
	}
}

// TestSanitizeClusterName_DoesNotCollide locks in the specific regression this hash suffix
// fixes: two distinct cluster names that sanitize (strip + truncate) to the same prefix must no
// longer produce the same cookie name.
func TestSanitizeClusterName_DoesNotCollide(t *testing.T) {
	pairs := [][2]string{
		{"prod.a", "proda"}, // "." is stripped, so both sanitize to "proda"
		{"a!b", "ab"},       // "!" is stripped, so both sanitize to "ab"
	}

	for _, pair := range pairs {
		a, b := auth.SanitizeClusterName(pair[0]), auth.SanitizeClusterName(pair[1])
		if a == b {
			t.Errorf("SanitizeClusterName(%q) and SanitizeClusterName(%q) must not collide, both = %q",
				pair[0], pair[1], a)
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
		name               string
		baseURL            string
		useDeploymentScope bool
		wantPath           string
	}{
		{
			name:               "empty base URL, deployment scope",
			baseURL:            "",
			useDeploymentScope: true,
			wantPath:           "/",
		},
		{
			name:               "base URL without leading slash, deployment scope",
			baseURL:            "headlamp",
			useDeploymentScope: true,
			wantPath:           "/headlamp/",
		},
		{
			name:               "base URL with leading slash, deployment scope",
			baseURL:            "/headlamp",
			useDeploymentScope: true,
			wantPath:           "/headlamp/",
		},
		{
			name:               "base URL with trailing slash, deployment scope",
			baseURL:            "/headlamp/",
			useDeploymentScope: true,
			wantPath:           "/headlamp/",
		},
		{
			name:               "empty base URL, cluster scope",
			baseURL:            "",
			useDeploymentScope: false,
			wantPath:           "/clusters/test-cluster",
		},
		{
			name:               "base URL, cluster scope",
			baseURL:            "/headlamp",
			useDeploymentScope: false,
			wantPath:           "/headlamp/clusters/test-cluster",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := auth.GetCookiePath(tt.baseURL, "test-cluster", tt.useDeploymentScope)
			if got != tt.wantPath {
				t.Errorf("getCookiePath() = %q, want %q", got, tt.wantPath)
			}
		})
	}
}

// TestGetCookiePath_CoversNonClusterScopedRoutes locks in the specific regression the deployment
// scope fixes: a cookie whose Path is under /clusters/<cluster> is never sent by a browser to
// routes outside that prefix, such as /wsMultiplexer or /drain-node. The cluster scope, used
// when impersonation does not apply, intentionally does not cover those routes: widening every
// OIDC deployment's cookies unconditionally would grow the Cookie header with every cluster a
// user logs into (see GetCookiePath's doc comment).
func TestGetCookiePath_CoversNonClusterScopedRoutes(t *testing.T) {
	for _, baseURL := range []string{"", "/headlamp"} {
		deploymentPath := auth.GetCookiePath(baseURL, "main", true)

		for _, route := range []string{"/wsMultiplexer", "/drain-node", "/clusters/main/api/v1/pods"} {
			full := strings.TrimSuffix(baseURL, "/") + route
			if !strings.HasPrefix(full, strings.TrimSuffix(deploymentPath, "/")) {
				t.Errorf("deployment-scoped cookie path %q does not cover route %q (baseURL %q)",
					deploymentPath, full, baseURL)
			}
		}

		clusterPath := auth.GetCookiePath(baseURL, "main", false)
		if strings.HasPrefix(strings.TrimSuffix(baseURL, "/")+"/wsMultiplexer", clusterPath) {
			t.Errorf("cluster-scoped cookie path %q unexpectedly covers /wsMultiplexer", clusterPath)
		}
	}
}

func TestSetAndGetAuthCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhost, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Test setting a cookie
	testTTL := 100
	require.NoError(t, auth.SetTokenCookie(w, req, "test-cluster", "test-token", "", testTTL, false))

	// ClearTokenCookie's pre-step (see its doc comment) also unconditionally emits clearing
	// cookies for a floor of chunk indices at every scope, regardless of whether anything
	// exists there to clear, so the real cookie is not necessarily the only one in the
	// response -- find it by name and value instead of assuming it is alone.
	wantName := "headlamp-auth-" + auth.SanitizeClusterName("test-cluster") + ".0"

	var cookie *http.Cookie

	for _, c := range w.Result().Cookies() {
		if c.Name == wantName && c.Value == "test-token" {
			cookie = c

			break
		}
	}

	if cookie == nil {
		t.Fatalf("expected a cookie named %q with value %q among the response cookies, got %v",
			wantName, "test-token", w.Result().Cookies())
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
	applyResponseCookies(t, w, req)

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetAuthCookie failed: %v", err)
	}

	if token != "test-token" {
		t.Errorf("Expected token 'test-token', got %q", token)
	}
}

// applyResponseCookies simulates a browser's cookie jar receiving every Set-Cookie header from w
// and then presenting the result on req: for a given cookie name, only the last value set (by
// header order) is kept, and a clear (MaxAge < 0) removes that name unless a later Set-Cookie for
// it re-adds it. This is what SetTokenCookie's clear-then-write sequence relies on in a real
// browser; a test that instead attached every Set-Cookie header verbatim, clears included, would
// see whichever one happened to come first on the wire, not the one a real jar would end up
// holding.
func applyResponseCookies(t *testing.T, w *httptest.ResponseRecorder, req *http.Request) {
	t.Helper()

	byName := map[string]*http.Cookie{}

	for _, cookie := range w.Result().Cookies() {
		if cookie.MaxAge < 0 {
			delete(byName, cookie.Name)
			continue
		}

		byName[cookie.Name] = cookie
	}

	for _, cookie := range byName {
		req.AddCookie(cookie)
	}
}

// TestSetTokenCookie_ClearsLegacyCookieOnFreshLogin locks in the specific regression found in
// the cookie-path change: a browser holding a pre-upgrade cookie (legacy name, legacy path)
// that then logs in again must have that stale cookie cleared, not merely shadowed by the new
// one. Browsers send the more path-specific of two same-named cookies first, and
// GetTokenFromCookie reads only that first match, so a stale cookie left in place would
// silently keep a fresh login from taking effect.
func TestSetTokenCookie_ClearsLegacyCookieOnFreshLogin(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	// A cookie set by a pre-upgrade version: legacy name, no hash suffix, scoped to the
	// cluster-specific path browsers sent it on before.
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-test-cluster.0",
		Value:    "stale-token",
		Path:     "/clusters/test-cluster",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	w := httptest.NewRecorder()
	require.NoError(t, auth.SetTokenCookie(w, req, "test-cluster", "fresh-token", "", 3600, false))

	const legacyName = "headlamp-auth-test-cluster.0"

	var sawLegacyClear bool

	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == legacyName && cookie.Value == "" && cookie.MaxAge < 0 {
			sawLegacyClear = true
		}
	}

	if !sawLegacyClear {
		t.Errorf("SetTokenCookie did not clear the legacy cookie %q; a fresh login would be "+
			"shadowed by it", legacyName)
	}
}

// TestFilterAuthCookies checks that it removes only Headlamp's own auth cookies, leaving any
// other cookie a caller attached to the request untouched.
func TestFilterAuthCookies(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-" + auth.SanitizeClusterName("test-cluster") + ".0", Value: "token",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})
	req.AddCookie(&http.Cookie{
		Name: "session_id", Value: "caller-owned",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})
	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-" + auth.SanitizeClusterName("test-cluster") + ".1", Value: "more-token",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})

	filtered := auth.FilterAuthCookies(req)

	if len(filtered) != 1 {
		t.Fatalf("expected 1 non-auth cookie to remain, got %d: %v", len(filtered), filtered)
	}

	if filtered[0].Name != "session_id" || filtered[0].Value != "caller-owned" {
		t.Errorf("expected the caller's own cookie to remain untouched, got %+v", filtered[0])
	}
}

func TestGetAuthCookieChunked(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Create a long token that will be chunked
	longToken := strings.Repeat("a", 5000)

	// Test setting a cookie
	require.NoError(t, auth.SetTokenCookie(w, req, "test-cluster", longToken, "", 86400, false))

	// Check if cookie was set. ClearTokenCookie's pre-step also emits its own clearing cookies
	// (see applyResponseCookies), so this counts only the real, non-cleared ones.
	var realCookieCount int

	for _, cookie := range w.Result().Cookies() {
		if cookie.Value != "" && cookie.MaxAge >= 0 {
			realCookieCount++
		}
	}

	if realCookieCount < 2 {
		t.Fatalf("Expected at least 2 cookies for a chunked token, got %d", realCookieCount)
	}

	// Test getting the cookie
	applyResponseCookies(t, w, req)

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetAuthCookie failed: %v", err)
	}

	if token != longToken {
		t.Errorf("Expected token to be %q, got %q", longToken, token)
	}
}

// TestSetTokenCookie_RejectsOversizedToken locks in the fix for a correctness gap in the
// ClearTokenCookie clearing floor: that floor (minClearedCookieChunks) only guarantees full
// cleanup because SetTokenCookie refuses to ever store more chunks than the floor covers
// (maxTokenChunks), when useDeploymentScope applies. Were a larger token allowed through in
// that case, a chunk beyond the floor could survive a future clear issued from a path that
// cannot see it (see TestClearAuthCookie_ClearsStaleCookieInvisibleFromCurrentPath), and a
// later, shorter token would then have readChunkedCookie silently splice that stale tail onto
// itself, producing an invalid token instead of either a valid one or a clean failure.
//
// It also checks the rejection is reported (not silently swallowed) and that any previously
// stored cookie for this cluster is left in place: clearing it before determining whether the
// replacement can be stored would destroy a valid pre-impersonation session during migration.
func TestSetTokenCookie_RejectsOversizedToken(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	// Comfortably more than maxTokenChunks (5) chunks at the current chunkSize (3800).
	oversizedToken := strings.Repeat("a", 20000)

	// Simulate a valid pre-impersonation cookie, which may be larger than the deployment-scope
	// cap because cluster-scoped cookies retain the legacy uncapped behavior.
	existingWriter := httptest.NewRecorder()
	require.NoError(t, auth.SetTokenCookie(
		existingWriter, req, "test-cluster", oversizedToken, "", 3600, false,
	))
	applyResponseCookies(t, existingWriter, req)

	w := httptest.NewRecorder()

	err := auth.SetTokenCookie(w, req, "test-cluster", oversizedToken, "", 3600, true)
	if err == nil {
		t.Error("expected an oversized token to be rejected with a non-nil error when useDeploymentScope applies")
	}

	assert.Empty(t, w.Result().Cookies(), "rejected replacement must not clear or write cookies")

	got, err := auth.GetTokenFromCookie(req, "test-cluster")
	require.NoError(t, err)
	assert.Equal(t, oversizedToken, got, "the previous session must remain available")
}

// TestSetTokenCookie_UncappedWhenNotDeploymentScoped locks in the other half of the fix above:
// the tighter maxTokenChunks cap must not apply when useDeploymentScope is false, since a
// deployment that never uses --oidc-use-impersonation (or a cluster it does not apply to) never
// changes that cluster's cookie scope between logins, so the stale-tail risk that cap exists to
// prevent cannot occur for it. A cluster-scoped token is still bounded by the larger
// maxTrackedTokenChunks (see TestSetTokenCookie_RejectsClusterScopedTokenBeyondTrackedChunks),
// comfortably past docs/installation/in-cluster/oidc.md's documented 64KiB, so that must keep
// working unchanged when the flag is off.
func TestSetTokenCookie_UncappedWhenNotDeploymentScoped(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// Comfortably more than maxTokenChunks (5) chunks at the current chunkSize (3800), but well
	// within maxTrackedTokenChunks.
	largeToken := strings.Repeat("a", 20000)

	err := auth.SetTokenCookie(w, req, "test-cluster", largeToken, "", 3600, false)
	require.NoError(t, err, "a large token must still be accepted when useDeploymentScope is false")

	applyResponseCookies(t, w, req)
	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-" + auth.SanitizeClusterName("test-cluster") + ".6", Value: "stale-tail",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})

	got, err := auth.GetTokenFromCookie(req, "test-cluster")
	require.NoError(t, err)
	assert.Equal(t, largeToken, got)
}

// TestSetTokenCookie_RejectsClusterScopedTokenBeyondTrackedChunks locks in the fix for a gap
// between two caps that must agree: a cluster-scoped token could previously exceed
// maxTrackedTokenChunks (the most this package will ever write or trust chunk-count metadata
// for) while still being accepted by SetTokenCookie (which only capped deployment-scoped
// tokens). The metadata it wrote for such a token recorded a count tokenCookieMetadata would
// then refuse to trust on a later read, silently losing the exact-count guarantee for a token
// that was never rejected -- reintroducing the stale-tail risk the metadata mechanism exists to
// close, just for an oversized cluster-scoped token instead of a deployment-scoped one. A
// cluster-scoped token now shares the same upper bound its metadata can represent.
func TestSetTokenCookie_RejectsClusterScopedTokenBeyondTrackedChunks(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// More than maxTrackedTokenChunks (20) chunks at the current chunkSize (3800).
	oversizedToken := strings.Repeat("a", 90000)

	err := auth.SetTokenCookie(w, req, "test-cluster", oversizedToken, "", 3600, false)
	require.Error(t, err,
		"a cluster-scoped token beyond maxTrackedTokenChunks must be rejected, not stored with untrustworthy metadata")
}

// TestSetTokenCookie_ClusterScopedMetadataStaysTrustworthyNearTrackedBound locks in the other
// half of the fix above: a cluster-scoped token right at the edge of what SetTokenCookie now
// accepts must still be fully, correctly clearable via its metadata on a later request that can
// see it (an ordinary cluster-scoped request, not just the 5-chunk fallback floor that is all a
// request without metadata visibility -- such as /oidc-callback -- could ever guarantee).
func TestSetTokenCookie_ClusterScopedMetadataStaysTrustworthyNearTrackedBound(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// 19 chunks: within maxTrackedTokenChunks (20), and comfortably past the 64KiB docs call out.
	largeToken := strings.Repeat("a", 19*3800-100)

	require.NoError(t, auth.SetTokenCookie(w, req, "test-cluster", largeToken, "", 3600, false))

	// Simulate a later request that can see this cluster's cookies (unlike /oidc-callback).
	applyResponseCookies(t, w, req)

	cleared := httptest.NewRecorder()
	auth.ClearTokenCookie(cleared, req, "test-cluster", "")

	lastChunk := "headlamp-auth-" + auth.SanitizeClusterName("test-cluster") + ".18"

	var sawLastChunkCleared bool

	for _, cookie := range cleared.Result().Cookies() {
		if cookie.Name == lastChunk && cookie.MaxAge < 0 {
			sawLastChunkCleared = true
		}
	}

	assert.True(t, sawLastChunkCleared,
		"the 19th chunk, beyond the 5-chunk fallback floor, must still be cleared via trustworthy metadata")
}

// TestSetTokenCookie_MetadataNotWidenedWhenNotDeploymentScoped locks in a fix to the chunk-count
// metadata mechanism: it must be written at the same path as the real chunks, not unconditionally
// at the deployment-wide one. Without this, a deployment that never uses
// --oidc-use-impersonation would gain an extra deployment-wide cookie per cluster a user logs
// into -- exactly the unconditional-width accumulation GetCookiePath's useDeploymentScope
// parameter exists to avoid in the first place (see its doc comment).
func TestSetTokenCookie_MetadataNotWidenedWhenNotDeploymentScoped(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	require.NoError(t, auth.SetTokenCookie(w, req, "test-cluster", "token-value", "", 3600, false))

	metadataName := "headlamp-auth-chunks-" + auth.SanitizeClusterName("test-cluster")

	// ClearTokenCookie's own pre-step also emits clearing cookies (empty value, MaxAge < 0)
	// for this same metadata name at both scopes; only the real, non-cleared one matters here.
	var found bool

	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == metadataName && cookie.Value != "" && cookie.MaxAge >= 0 {
			found = true

			assert.Equal(t, "/clusters/test-cluster", cookie.Path,
				"a narrow-scoped login's metadata cookie must not be widened to the deployment root")
		}
	}

	assert.True(t, found, "expected a chunk-count metadata cookie to be set")
}

func TestClearTokenCookieUsesRecordedChunkCountAcrossScopes(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin+"/oidc-callback", nil)
	req.Host = localhost
	cluster := "test-cluster"
	sanitized := auth.SanitizeClusterName(cluster)
	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-chunks-" + sanitized, Value: "cluster:8",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})

	w := httptest.NewRecorder()
	auth.ClearTokenCookie(w, req, cluster, "")

	currentChunk := "headlamp-auth-" + sanitized + ".7"
	clearedPaths := map[string]bool{}

	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == currentChunk && cookie.MaxAge < 0 {
			clearedPaths[cookie.Path] = true
		}
	}

	assert.True(t, clearedPaths["/"], "clear the eighth chunk at deployment scope")
	assert.True(t, clearedPaths["/clusters/"+cluster], "clear the eighth chunk at cluster scope")
}

func TestClearTokenCookieBoundsClientControlledChunkCount(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin+"/oidc-callback", nil)
	req.Host = localhost
	req.AddCookie(&http.Cookie{
		Name: "headlamp-auth-chunks-" + auth.SanitizeClusterName("test-cluster"), Value: "cluster:100",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})

	w := httptest.NewRecorder()
	auth.ClearTokenCookie(w, req, "test-cluster", "")

	assert.LessOrEqual(t, len(w.Result().Cookies()), 100,
		"untrusted chunk metadata must not cause unbounded Set-Cookie generation")
}

func TestClearTokenCookieBoundsVisibleChunkCleanup(t *testing.T) {
	const cluster = "test-cluster"

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin+"/oidc-callback", nil)
	req.Host = localhost

	for i := 0; i < 1000; i++ {
		req.AddCookie(&http.Cookie{
			Name:     "headlamp-auth-" + auth.SanitizeClusterName(cluster) + "." + strconv.Itoa(i),
			Value:    "attacker-controlled",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})
	}

	w := httptest.NewRecorder()
	auth.ClearTokenCookie(w, req, cluster, "")

	cleared := w.Result().Cookies()
	// maxTrackedTokenChunks tracked chunk indices x up to 2 names x 2 paths, plus 2 metadata
	// names x 2 paths (metadata is cleared at both scopes, not just the deployment-wide one --
	// see ClearTokenCookie).
	assert.LessOrEqual(t, len(cleared), 4*20+4,
		"visible client cookies must not cause unbounded cleanup headers")

	lastBoundedChunk := "headlamp-auth-" + auth.SanitizeClusterName(cluster) + ".19"
	foundLastBoundedChunk := false

	for _, cookie := range cleared {
		if cookie.Name == lastBoundedChunk && cookie.MaxAge < 0 {
			foundLastBoundedChunk = true
			break
		}
	}

	assert.True(t, foundLastBoundedChunk, "cleanup should reach the final supported tracked chunk")
}

// TestGetTokenFromCookie_FallsBackToLegacyCookieName locks in the specific regression the
// hash-suffix rollout caused: SanitizeClusterName changed every cookie's name unconditionally,
// even for a deployment where impersonation is off and nothing about the cookie's path changed,
// so a browser still holding a pre-rollout, unhashed-name cookie must keep working until it logs
// in again (which clears the legacy cookie; see TestSetTokenCookie_ClearsLegacyCookieOnFreshLogin)
// rather than being silently logged out by the upgrade alone.
func TestGetTokenFromCookie_FallsBackToLegacyCookieName(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	// A cookie set by a pre-upgrade version: legacy name, no hash suffix.
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-test-cluster.0",
		Value:    "legacy-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	token, err := auth.GetTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetTokenFromCookie failed: %v", err)
	}

	if token != "legacy-token" {
		t.Errorf("Expected fallback to the legacy cookie name to return %q, got %q", "legacy-token", token)
	}
}

// TestClearAuthCookie checks that clearing a cookie set under the pre-hash-suffix name (what a
// browser that authenticated before this change would still be holding) clears it at both the
// per-cluster path and the deployment-wide path, and also clears the current name at both paths
// in case a cookie already exists under it too -- either scope is possible for either name,
// since useDeploymentScope can differ between logins (see ClearTokenCookie's doc comment).
func TestClearAuthCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	// A cookie set by a pre-upgrade version: legacy name, no hash suffix.
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-test-cluster.0",
		Value:    "test-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   86400, // 24 hours
	})

	auth.ClearTokenCookie(w, req, "test-cluster", "")

	cleared := w.Result().Cookies()

	currentName := "headlamp-auth-" + auth.SanitizeClusterName("test-cluster") + ".0"

	const legacyName = "headlamp-auth-test-cluster.0"

	wantPaths := map[string][]string{
		currentName: {"/", "/clusters/test-cluster"},
		legacyName:  {"/", "/clusters/test-cluster"},
	}

	gotPaths := map[string][]string{}

	for _, cookie := range cleared {
		if cookie.Value != "" {
			t.Errorf("cookie %q: expected empty value, got %q", cookie.Name, cookie.Value)
		}

		if cookie.MaxAge != -1 {
			t.Errorf("cookie %q: expected MaxAge -1, got %d", cookie.Name, cookie.MaxAge)
		}

		gotPaths[cookie.Name] = append(gotPaths[cookie.Name], cookie.Path)
	}

	for name, wantPathList := range wantPaths {
		got := gotPaths[name]

		sort.Strings(wantPathList)
		sort.Strings(got)

		if !reflect.DeepEqual(wantPathList, got) {
			t.Errorf("cookie %q: expected clears at paths %v, got %v", name, wantPathList, got)
		}
	}
}

// TestClearAuthCookie_ClearsStaleCookieInvisibleFromCurrentPath locks in the specific regression
// in ClearTokenCookie's visibility check: a request on a deployment-wide path, such as the
// /oidc-callback handler that calls this right after a fresh login, can never see a cookie
// scoped to /clusters/<cluster> -- r.Cookie() only sees cookies whose Path matches the CURRENT
// request's path. The old code used that visibility to decide whether to clear anything at all,
// so it silently cleared nothing from exactly the one place (fresh login) where clearing a stale
// cluster-scoped cookie matters most, letting it keep shadowing the fresh cookie afterward. This
// does not add the stale cookie to the request at all, simulating a request that genuinely
// cannot see it (unlike TestClearAuthCookie, where it is attached to the request), so the clear
// below can only happen because of the guaranteed minimum floor, not because of visibility.
func TestClearAuthCookie_ClearsStaleCookieInvisibleFromCurrentPath(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin+"/oidc-callback", nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	auth.ClearTokenCookie(w, req, "test-cluster", "")

	currentName := "headlamp-auth-" + auth.SanitizeClusterName("test-cluster") + ".0"

	var sawClusterScopedClear bool

	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == currentName && cookie.Path == "/clusters/test-cluster" {
			sawClusterScopedClear = true
		}
	}

	if !sawClusterScopedClear {
		t.Errorf("ClearTokenCookie did not clear %q at the cluster-scoped path from a request "+
			"that cannot see it there; a stale cookie there would keep shadowing a fresh login", currentName)
	}
}
