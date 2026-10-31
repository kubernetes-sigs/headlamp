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

func addRequestCookie(req *http.Request, name, value string) {
	//nolint:gosec // Request cookie fixture; response security attributes do not apply.
	req.AddCookie(&http.Cookie{Name: name, Value: value})
}

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

//nolint:funlen // Table-driven test covering every base-URL/scope/cluster-name combination.
func TestGetCookiePath(t *testing.T) {
	tests := []struct {
		name string
		// cluster defaults to "test-cluster" when empty.
		cluster            string
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
		{
			name:     "slash-containing cluster",
			baseURL:  "/headlamp",
			cluster:  "team/cluster",
			wantPath: "/headlamp/clusters/team/cluster",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cluster := tt.cluster
			if cluster == "" {
				cluster = "test-cluster"
			}

			got := auth.GetCookiePath(tt.baseURL, cluster, tt.useDeploymentScope)
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
	// maxLegacyAuthTokenChunks tracked chunk indices x up to 2 names x 2 paths, plus 2 metadata
	// names x 2 paths (metadata is cleared at both scopes, not just the deployment-wide one --
	// see ClearTokenCookie). The scan reaches maxLegacyAuthTokenChunks (32), not the tighter
	// maxTrackedTokenChunks (20): it must still fully clear a legacy cookie written with up to
	// that many chunks (see maxLegacyAuthTokenChunks's doc comment).
	assert.LessOrEqual(t, len(cleared), 4*32+4,
		"visible client cookies must not cause unbounded cleanup headers")

	lastBoundedChunk := "headlamp-auth-" + auth.SanitizeClusterName(cluster) + ".31"
	foundLastBoundedChunk := false

	for _, cookie := range cleared {
		if cookie.Name == lastBoundedChunk && cookie.MaxAge < 0 {
			foundLastBoundedChunk = true
			break
		}
	}

	assert.True(t, foundLastBoundedChunk, "cleanup should reach the final supported tracked chunk")
}

// TestGetTokenFromCookie_BoundsUnboundedReadWhenMetadataMissing covers the read side of the same
// attacker-controlled-chunk-count concern ClearTokenCookie is already bounded against: with no
// chunk-count metadata cookie at all, readChunkedCookie's loop previously had no exit besides an
// r.Cookie miss or an empty value -- both fully in an unauthenticated caller's own control by how
// many sequential, non-empty chunk cookies it sends. 1000 such cookies, with no metadata, must
// still only cost a bounded number of r.Cookie lookups, not one per attacker-supplied cookie.
func TestGetTokenFromCookie_BoundsUnboundedReadWhenMetadataMissing(t *testing.T) {
	const cluster = "test-cluster"

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	for i := 0; i < 1000; i++ {
		req.AddCookie(&http.Cookie{
			Name:     "headlamp-auth-" + auth.SanitizeClusterName(cluster) + "." + strconv.Itoa(i),
			Value:    "x",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})
	}

	token, err := auth.GetTokenFromCookie(req, cluster)
	require.NoError(t, err)
	// maxTrackedTokenChunks (20): the most this package will ever trust, matching
	// TestClearTokenCookieBoundsVisibleChunkCleanup's own bound for the same attack shape.
	assert.LessOrEqual(t, len(token), 20,
		"without chunk-count metadata, reading must stop at maxTrackedTokenChunks regardless of "+
			"how many chunk cookies the caller supplies")
}

// TestGetTokenFromCookie_BoundsUnboundedReadViaLegacyNameWhenMetadataMissing is the legacy-name
// counterpart of TestGetTokenFromCookie_BoundsUnboundedReadWhenMetadataMissing: the legacy
// fallback read uses maxLegacyAuthTokenChunks (32), a higher bound than the current cookie
// name's maxTrackedTokenChunks (20), to keep working for a pre-rollout session that used more
// than 20 chunks (see maxLegacyAuthTokenChunks's doc comment). That higher bound must still be a
// bound: an unauthenticated caller supplying any number of legacy-named chunk cookies, with no
// metadata (the legacy name never has any), must only cost up to maxLegacyAuthTokenChunks
// lookups, not one per attacker-supplied cookie.
func TestGetTokenFromCookie_BoundsUnboundedReadViaLegacyNameWhenMetadataMissing(t *testing.T) {
	const cluster = "test-cluster"

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	for i := 0; i < 1000; i++ {
		req.AddCookie(&http.Cookie{
			Name:     "headlamp-auth-" + cluster + "." + strconv.Itoa(i), // legacy: no hash suffix.
			Value:    "x",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})
	}

	token, err := auth.GetTokenFromCookie(req, cluster)
	require.NoError(t, err)
	assert.LessOrEqual(t, len(token), 32,
		"without chunk-count metadata, reading the legacy cookie name must stop at "+
			"maxLegacyAuthTokenChunks regardless of how many chunk cookies the caller supplies")
}

// TestGetTokenFromCookie_ReadsLegacySessionAboveNewTrackedChunkBound covers the specific upgrade
// regression maxLegacyAuthTokenChunks exists to prevent: maxTrackedTokenChunks (20) is this
// package's CURRENT write/trust bound, but the implementation shipping before
// --oidc-use-impersonation allowed up to 32 chunks when writing the (now legacy-named) cookie. A
// real pre-upgrade session using more than 20 chunks must still be read back in full after the
// upgrade -- capping the legacy read at the new, tighter bound would silently truncate it instead.
func TestGetTokenFromCookie_ReadsLegacySessionAboveNewTrackedChunkBound(t *testing.T) {
	const (
		cluster    = "test-cluster"
		chunkCount = 25 // above maxTrackedTokenChunks (20), within maxLegacyAuthTokenChunks (32).
	)

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	var want strings.Builder

	for i := 0; i < chunkCount; i++ {
		chunk := "chunk" + strconv.Itoa(i)
		want.WriteString(chunk)

		req.AddCookie(&http.Cookie{
			Name:     "headlamp-auth-" + cluster + "." + strconv.Itoa(i), // legacy: no hash suffix.
			Value:    chunk,
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})
	}

	token, err := auth.GetTokenFromCookie(req, cluster)
	require.NoError(t, err)
	assert.Equal(t, want.String(), token,
		"a legacy session with more than maxTrackedTokenChunks chunks must still be read in full")
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

// TestGetTokenFromCookie_LegacyFallbackDoesNotCollideWithAnotherClustersCurrentCookie covers a
// cross-cluster cookie confusion: a cluster named exactly like another cluster's
// SanitizeClusterName output has a legacySanitizedClusterName equal to that other cluster's
// current cookie name. Without the hashSuffixPattern guard in legacySanitizedClusterName, reading
// cluster B's token would silently fall back to and return cluster A's current cookie.
func TestGetTokenFromCookie_LegacyFallbackDoesNotCollideWithAnotherClustersCurrentCookie(t *testing.T) {
	const clusterA = "main"

	clusterB := auth.SanitizeClusterName(clusterA)

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	// Cluster A's real, current, hash-suffixed cookie.
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-" + auth.SanitizeClusterName(clusterA) + ".0",
		Value:    "a-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	token, err := auth.GetTokenFromCookie(req, clusterB)
	if err != nil {
		t.Fatalf("GetTokenFromCookie failed: %v", err)
	}

	if token != "" {
		t.Errorf("GetTokenFromCookie(%q) = %q, want \"\" -- it must not read cluster %q's current cookie",
			clusterB, token, clusterA)
	}
}

// TestClearTokenCookie_ClearsLegacySessionAboveNewTrackedChunkBound is the clear-side counterpart
// of TestGetTokenFromCookie_ReadsLegacySessionAboveNewTrackedChunkBound: a legacy session written
// with more than maxTrackedTokenChunks (20) chunks -- up to the old implementation's own 32-chunk
// cap -- must have every one of its chunks cleared on logout, not just the first 20, or its tail
// is left behind in the browser instead of cleared.
func TestClearTokenCookie_ClearsLegacySessionAboveNewTrackedChunkBound(t *testing.T) {
	const (
		cluster    = "test-cluster"
		chunkCount = 25 // above maxTrackedTokenChunks (20), within maxLegacyAuthTokenChunks (32).
	)

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin+"/oidc-callback", nil)
	req.Host = localhost

	for i := 0; i < chunkCount; i++ {
		req.AddCookie(&http.Cookie{
			Name:     "headlamp-auth-" + cluster + "." + strconv.Itoa(i), // legacy: no hash suffix.
			Value:    "chunk" + strconv.Itoa(i),
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})
	}

	w := httptest.NewRecorder()
	auth.ClearTokenCookie(w, req, cluster, "")

	lastChunkName := "headlamp-auth-" + cluster + "." + strconv.Itoa(chunkCount-1)
	foundLastChunkCleared := false

	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == lastChunkName && cookie.MaxAge < 0 {
			foundLastChunkCleared = true
			break
		}
	}

	assert.True(t, foundLastChunkCleared,
		"ClearTokenCookie must clear every chunk of a legacy session, including beyond "+
			"maxTrackedTokenChunks, not just the first 20")
}

// TestClearTokenCookie_DoesNotClearAnotherClustersCurrentCookieViaLegacyCollision is the
// ClearTokenCookie side of the same collision: clearing cluster B must not expire cluster A's
// current cookie or chunk-count metadata.
func TestClearTokenCookie_DoesNotClearAnotherClustersCurrentCookieViaLegacyCollision(t *testing.T) {
	const clusterA = "main"

	clusterB := auth.SanitizeClusterName(clusterA)
	clusterACookieName := "headlamp-auth-" + auth.SanitizeClusterName(clusterA) + ".0"

	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	//nolint:gosec // Request cookie fixture; response security attributes do not apply.
	req.AddCookie(&http.Cookie{Name: clusterACookieName, Value: "a-token"})

	w := httptest.NewRecorder()
	auth.ClearTokenCookie(w, req, clusterB, "")

	for _, c := range w.Result().Cookies() {
		if c.Name == clusterACookieName {
			t.Errorf("ClearTokenCookie(%q) must not clear cluster %q's current cookie %q",
				clusterB, clusterA, c.Name)
		}
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

func TestLogoutCookiesPreserveDesktopRewriteAttributes(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, localhostOrigin, nil)

	w := httptest.NewRecorder()
	if err := auth.SetTokenCookie(w, req, "test-cluster", "short-token", "", 3600, false); err != nil {
		t.Fatal(err)
	}

	auth.ClearTokenCookie(w, req, "test-cluster", "")

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

	wantName := "headlamp-id-token-" + auth.SanitizeClusterName("test-cluster") + ".0"
	if cookie.Name != wantName {
		t.Errorf("Expected cookie name %q, got %q", wantName, cookie.Name)
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
		addRequestCookie(req, fmt.Sprintf("headlamp-id-token-%s.%d", auth.SanitizeClusterName("test-cluster"), i), "a")
	}

	addRequestCookie(req, "headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".16", "stale")

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
	addRequestCookie(req, "headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".0", "current")
	addRequestCookie(req, "headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".1", "")
	addRequestCookie(req, "headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".2", "stale")

	idToken, err := auth.GetIDTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetIDTokenFromCookie failed: %v", err)
	}

	if idToken != "current" {
		t.Fatalf("Expected terminal chunk to hide stale suffix, got %q", idToken)
	}
}

// TestGetIDTokenFromCookie_FallsBackToLegacyCookieName mirrors
// TestGetTokenFromCookie_FallsBackToLegacyCookieName for the ID-token-for-logout cookie family:
// SanitizeClusterName's hash suffix changed this cookie's name too, so a session that logged in
// (and so received an id_token_hint cookie) before that rollout must still be readable, or
// RP-initiated logout would have no id_token_hint to send the provider.
func TestGetIDTokenFromCookie_FallsBackToLegacyCookieName(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	// A cookie set by a pre-upgrade version: legacy name, no hash suffix.
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-id-token-test-cluster.0",
		Value:    "legacy-id-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	idToken, err := auth.GetIDTokenFromCookie(req, "test-cluster")
	if err != nil {
		t.Fatalf("GetIDTokenFromCookie failed: %v", err)
	}

	if idToken != "legacy-id-token" {
		t.Errorf("Expected fallback to the legacy cookie name to return %q, got %q", "legacy-id-token", idToken)
	}
}

// TestClearIDTokenCookie_ClearsLegacyCookieName is the ClearIDTokenCookie side of the same
// upgrade-compatibility gap: a browser still holding a legacy-named id_token_hint cookie must
// have it cleared on logout too, not just the current, hash-suffixed name.
func TestClearIDTokenCookie_ClearsLegacyCookieName(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost

	legacyName := "headlamp-id-token-test-cluster.0"

	//nolint:gosec // Request cookie fixture; response security attributes do not apply.
	req.AddCookie(&http.Cookie{Name: legacyName, Value: "legacy-id-token"})

	w := httptest.NewRecorder()
	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	found := false

	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == legacyName {
			found = true

			if cookie.MaxAge != -1 {
				t.Errorf("Expected legacy cookie %q to be cleared (MaxAge -1), got %d", legacyName, cookie.MaxAge)
			}
		}
	}

	if !found {
		t.Errorf("Expected legacy cookie %q among cleared cookies", legacyName)
	}
}

func TestClearIDTokenCookie(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", localhostOrigin, nil)
	req.Host = localhost
	w := httptest.NewRecorder()

	req.AddCookie(&http.Cookie{
		Name:     "headlamp-id-token-" + auth.SanitizeClusterName("test-cluster") + ".0",
		Value:    "test-id-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/clusters/test-cluster",
		MaxAge:   86400,
	})

	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	// 2, not 1: chunk zero is unconditionally invalidated at BOTH the current, hash-suffixed
	// name and the pre-rollout legacy name (see ClearIDTokenCookie's doc comment), not just the
	// current one this request happens to carry.
	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("Expected chunk-zero invalidation at both cookie names, got %d cookies", len(cookies))
	}

	wantName := "headlamp-id-token-" + auth.SanitizeClusterName("test-cluster") + ".0"

	var cookie *http.Cookie

	for _, c := range cookies {
		if c.Name == wantName {
			cookie = c
		}
	}

	if cookie == nil {
		t.Fatalf("Expected cookie named %q among cleared cookies, got %#v", wantName, cookies)
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
		Name:     "headlamp-id-token-" + auth.SanitizeClusterName("test-cluster") + ".0",
		Value:    "chunk0",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/clusters/test-cluster",
		MaxAge:   86400,
	})
	//nolint:gosec
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-id-token-" + auth.SanitizeClusterName("test-cluster") + ".1",
		Value:    "chunk1",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/clusters/test-cluster",
		MaxAge:   86400,
	})
	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	// 3, not 2: both visible current-name chunks, plus the legacy name's unconditional chunk
	// zero (not visible under this request, but still cleared -- see ClearIDTokenCookie).
	cookies := w.Result().Cookies()
	if len(cookies) != 3 {
		t.Fatalf("Expected both visible chunks plus the legacy chunk-zero cleared, got %d cookies", len(cookies))
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
		newSecureTestCookie("headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".0", "old0", logoutURL.Path),
		newSecureTestCookie("headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".1", "old1", logoutURL.Path),
		newSecureTestCookie("headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".2", "old2", logoutURL.Path),
		newSecureTestCookie("headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".3", "old3", logoutURL.Path),
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
	if terminalCookie.Name != "headlamp-id-token-"+auth.SanitizeClusterName("test-cluster")+".1" ||
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
		Name:  "headlamp-id-token-" + auth.SanitizeClusterName("test-cluster") + ".0",
		Value: "chunk0",
		Path:  auth.GetOIDCLogoutCookiePath("", "test-cluster"),
	})
	//nolint:gosec
	req.AddCookie(&http.Cookie{
		Name:  "headlamp-id-token-" + auth.SanitizeClusterName("test-cluster") + ".2",
		Value: "chunk2",
		Path:  auth.GetOIDCLogoutCookiePath("", "test-cluster"),
	})

	w := httptest.NewRecorder()

	auth.ClearIDTokenCookie(w, req, "test-cluster", "")

	// 3, not 2: both visible current-name chunks (.0 and .2), plus the legacy name's
	// unconditional chunk zero -- not visible under this request, but still cleared (see
	// ClearIDTokenCookie).
	cookies := w.Result().Cookies()
	if len(cookies) != 3 {
		t.Fatalf("Expected both visible chunks across gaps plus the legacy chunk-zero cleared, got %d cookies",
			len(cookies))
	}

	wantCurrent := []string{
		fmt.Sprintf("headlamp-id-token-%s.0", auth.SanitizeClusterName("test-cluster")),
		fmt.Sprintf("headlamp-id-token-%s.2", auth.SanitizeClusterName("test-cluster")),
	}
	wantLegacy := "headlamp-id-token-test-cluster.0"

	for _, name := range append(wantCurrent, wantLegacy) {
		found := false

		for _, cookie := range cookies {
			if cookie.Name == name {
				found = true

				if cookie.MaxAge != -1 {
					t.Errorf("Expected cleared cookie %q to have MaxAge -1, got %d", name, cookie.MaxAge)
				}
			}
		}

		if !found {
			t.Errorf("Expected cleared cookie %q among %#v", name, cookies)
		}
	}
}

// TestLogoutInvalidationSurvivesTokenResizeAndRelogin only covers the ID-token-for-logout
// cookie: unlike it, the main headlamp-auth-* cookie's ClearTokenCookie deliberately clears a
// minimum floor of chunk indices regardless of which ones are visible at the current request
// path (see its doc comment) -- relying on visibility alone, as a narrower bounded-clear once
// did, is exactly the stale-tail/cross-scope-migration bug that design closed, so it has no
// equivalent "only the visible chunk gets cleared" invariant to assert here.
func TestLogoutInvalidationSurvivesTokenResizeAndRelogin(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		set   func(http.ResponseWriter, *http.Request, string, string, string, int) error
		get   func(*http.Request, string) (string, error)
		clear func(http.ResponseWriter, *http.Request, string, string)
	}{
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
				// 2, not 1: chunk zero is unconditionally invalidated at both the current and
				// legacy cookie names (see ClearIDTokenCookie), not just the one in use here.
				require.Len(t, w.Result().Cookies(), 2,
					"Hidden chunks require only chunk-zero invalidation at each cookie name")
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
