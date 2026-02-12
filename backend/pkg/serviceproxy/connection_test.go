package serviceproxy //nolint

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

// newTestClient creates an HTTP client without SSRF protection for testing.
func newTestClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout}
}

func TestNewConnection(t *testing.T) {
	tests := []struct {
		name string
		ps   *proxyService
		want ServiceConnection
	}{
		{
			name: "valid proxy service",
			ps: &proxyService{
				URIPrefix: "http://example.com",
			},
			want: &Connection{URI: "http://example.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conn := NewConnection(tt.ps)
			if conn == nil {
				t.Errorf("NewConnection() returned nil")
			}

			c, ok := conn.(*Connection)
			if !ok {
				t.Errorf("NewConnection() returned unexpected type")
			}

			if c.URI != tt.want.(*Connection).URI {
				t.Errorf("NewConnection() URI = %s, want %s", c.URI, tt.want.(*Connection).URI)
			}
		})
	}
}

var getTests = []struct {
	name       string
	uri        string
	requestURI string
	wantBody   []byte
	wantErr    bool
}{
	{
		name:       "valid request",
		uri:        "http://example.com",
		requestURI: "/test",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
	{
		name:       "invalid URI",
		uri:        " invalid-uri",
		requestURI: "/test",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "invalid request URI",
		uri:        "http://example.com",
		requestURI: " invalid-request-uri",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "absolute request URI rejected",
		uri:        "http://example.com",
		requestURI: "http://malicious.local",
		wantBody:   nil,
		wantErr:    true,
	},
}

func TestGet(t *testing.T) {
	for _, tt := range getTests {
		t.Run(tt.name, func(t *testing.T) {
			conn := &Connection{URI: tt.uri, clientFactory: newTestClient}

			if tt.wantBody != nil {
				ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					_, err := w.Write(tt.wantBody)
					if err != nil {
						t.Fatal(err)
					}
				}))
				defer ts.Close()

				conn.URI = ts.URL
			}

			body, err := conn.Get(tt.requestURI)
			if (err != nil) != tt.wantErr {
				t.Errorf("Get() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && !bytes.Equal(body, tt.wantBody) {
				t.Errorf("Get() body = %s, want %s", body, tt.wantBody)
			}
		})
	}
}

func TestGetNonOKStatusCode(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(ts.Close)

	conn := &Connection{URI: ts.URL, clientFactory: newTestClient}

	_, err := conn.Get("/test")
	if err == nil {
		t.Errorf("Get() error = nil, want error")
	}
}

// Security Tests - SSRF Prevention

//nolint:funlen // Table-driven test with comprehensive security test cases
func TestValidateRequestURI(t *testing.T) {
	tests := []struct {
		name       string
		requestURI string
		wantErr    bool
		errContain string
	}{
		{
			name:       "valid relative path",
			requestURI: "/api/v1/pods",
			wantErr:    false,
		},
		{
			name:       "valid path with query params",
			requestURI: "/api/v1/pods?watch=true&limit=10",
			wantErr:    false,
		},
		{
			name:       "valid path with label selector using comma",
			requestURI: "/api/v1/pods?labelSelector=app=foo,version=1",
			wantErr:    false,
		},
		{
			name:       "valid path with multiple label selectors",
			requestURI: "/api/v1/pods?labelSelector=app=nginx,env=prod,tier=frontend",
			wantErr:    false,
		},
		{
			name:       "empty URI should fail",
			requestURI: "",
			wantErr:    true,
			errContain: "empty request URI",
		},
		{
			name:       "absolute http URL should fail",
			requestURI: "http://attacker.com/steal",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "absolute https URL should fail",
			requestURI: "https://attacker.com/steal",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "mixed-case HTTP scheme should fail",
			requestURI: "HtTp://attacker.com/steal",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "mixed-case HTTPS scheme should fail",
			requestURI: "HtTpS://attacker.com/steal",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "uppercase HTTP scheme should fail",
			requestURI: "HTTP://attacker.com/steal",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "path traversal should fail",
			requestURI: "../../../etc/passwd",
			wantErr:    true,
			errContain: "path traversal not allowed",
		},
		{
			name:       "path traversal with encoded chars should fail",
			requestURI: "/api/../../../etc/passwd",
			wantErr:    true,
			errContain: "path traversal not allowed",
		},
		{
			name:       "URL-encoded path traversal should fail",
			requestURI: "%2e%2e/%2e%2e/etc/passwd",
			wantErr:    true,
			errContain: "path traversal not allowed",
		},
		{
			name:       "URL-encoded path traversal in path should fail",
			requestURI: "/api/%2e%2e/%2e%2e/%2e%2e/etc/passwd",
			wantErr:    true,
			errContain: "path traversal not allowed",
		},
		{
			name:       "mixed URL-encoded path traversal should fail",
			requestURI: "/api/..%2f..%2f../etc/passwd",
			wantErr:    true,
			errContain: "path traversal not allowed",
		},
		{
			name:       "double-encoded path traversal should fail",
			requestURI: "%252e%252e/%252e%252e/etc/passwd",
			wantErr:    true,
			errContain: "path traversal not allowed",
		},
		{
			name:       "URL-encoded absolute URL should fail",
			requestURI: "%68%74%74%70://attacker.com",
			wantErr:    true,
			errContain: "", // Rejected due to invalid URI format (colon in first path segment)
		},
		{
			name:       "URL-encoded https absolute URL should fail",
			requestURI: "%68%74%74%70%73://attacker.com",
			wantErr:    true,
			errContain: "", // Rejected due to invalid URI format (colon in first path segment)
		},
		{
			name:       "double-encoded absolute URL should fail",
			requestURI: "%2568%2574%2574%2570://attacker.com",
			wantErr:    true,
			errContain: "", // Rejected due to invalid URI format (colon in first path segment)
		},
		{
			name:       "file scheme should fail",
			requestURI: "file:///etc/passwd",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "ftp scheme should fail",
			requestURI: "ftp://attacker.com/file",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "gopher scheme should fail",
			requestURI: "gopher://attacker.com/",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "data scheme should fail",
			requestURI: "data:text/html,<script>alert(1)</script>",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "javascript scheme should fail",
			requestURI: "javascript:alert(1)",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "uppercase FILE scheme should fail",
			requestURI: "FILE:///etc/passwd",
			wantErr:    true,
			errContain: "absolute URLs not allowed",
		},
		{
			name:       "path with special chars should fail",
			requestURI: "/api/v1/pods<script>",
			wantErr:    true,
			errContain: "invalid characters",
		},
		{
			name:       "valid path with port",
			requestURI: "/api/v1/pods:8080/metrics",
			wantErr:    false,
		},
		{
			name:       "valid path with at sign",
			requestURI: "/api/v1/users@example.com",
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRequestURI(tt.requestURI)
			if tt.wantErr {
				if err == nil {
					t.Errorf("validateRequestURI(%q) expected error, got nil", tt.requestURI)
					return
				}

				if tt.errContain != "" && !bytes.Contains([]byte(err.Error()), []byte(tt.errContain)) {
					t.Errorf("validateRequestURI(%q) error = %v, want error containing %q", tt.requestURI, err, tt.errContain)
				}
			} else if err != nil {
				t.Errorf("validateRequestURI(%q) unexpected error: %v", tt.requestURI, err)
			}
		})
	}
}

func TestGetWithSSRFPrevention(t *testing.T) {
	// Create a test server that would be the legitimate target
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("legitimate response"))
	}))
	t.Cleanup(ts.Close)

	conn := &Connection{URI: ts.URL, clientFactory: newTestClient}

	// Test that SSRF attempts are blocked before reaching the server
	// (these are blocked by validateRequestURI, not transport-level protection)
	ssrfTests := []struct {
		name       string
		requestURI string
	}{
		{"absolute URL to metadata service", "http://169.254.169.254/latest/meta-data/"},
		{"path traversal attack", "../../../etc/passwd"},
		{"file protocol", "file:///etc/passwd"},
		{"URL-encoded path traversal", "%2e%2e/%2e%2e/etc/passwd"},
		{"URL-encoded absolute URL", "%68%74%74%70://attacker.com"},
		{"mixed-case HTTP scheme", "HtTp://attacker.com"},
		{"double-encoded path traversal", "%252e%252e/%252e%252e/etc/passwd"},
		{"double-encoded absolute URL", "%2568%2574%2574%2570://attacker.com"},
	}

	for _, tt := range ssrfTests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := conn.Get(tt.requestURI)
			if err == nil {
				t.Errorf("Get(%q) should have failed for SSRF prevention", tt.requestURI)
			}
		})
	}

	// Verify legitimate requests still work
	body, err := conn.Get("/api/v1/pods")
	if err != nil {
		t.Errorf("Get(/api/v1/pods) failed: %v", err)
	}

	if string(body) != "legitimate response" {
		t.Errorf("Get(/api/v1/pods) body = %q, want %q", body, "legitimate response")
	}
}

//nolint:funlen // Table-driven test with comprehensive security test cases
func TestValidateResolvedURL(t *testing.T) {
	tests := []struct {
		name       string
		resolved   string
		base       string
		wantErr    bool
		errContain string
	}{
		{
			name:     "valid resolved URL within base path",
			resolved: "http://example.com/api/v1/pods",
			base:     "http://example.com/api/v1/",
			wantErr:  false,
		},
		{
			name:     "valid resolved URL at base path",
			resolved: "http://example.com/api/v1/",
			base:     "http://example.com/api/v1/",
			wantErr:  false,
		},
		{
			name:       "scheme mismatch should fail",
			resolved:   "https://example.com/api/v1/pods",
			base:       "http://example.com/api/v1/",
			wantErr:    true,
			errContain: "scheme mismatch",
		},
		{
			name:       "host mismatch should fail",
			resolved:   "http://attacker.com/api/v1/pods",
			base:       "http://example.com/api/v1/",
			wantErr:    true,
			errContain: "host mismatch",
		},
		{
			name:       "host with port mismatch should fail",
			resolved:   "http://example.com:8080/api/v1/pods",
			base:       "http://example.com/api/v1/",
			wantErr:    true,
			errContain: "host mismatch",
		},
		{
			name:       "path escaped base prefix should fail",
			resolved:   "http://example.com/other/path",
			base:       "http://example.com/api/v1/",
			wantErr:    true,
			errContain: "path escaped base prefix",
		},
		{
			name:       "path traversal to different directory should fail",
			resolved:   "http://example.com/different",
			base:       "http://example.com/api/v1/",
			wantErr:    true,
			errContain: "path escaped base prefix",
		},
		{
			name:     "resolved URL with query params is valid",
			resolved: "http://example.com/api/v1/pods?watch=true",
			base:     "http://example.com/api/v1/",
			wantErr:  false,
		},
		{
			name:     "empty base path allows any path",
			resolved: "http://example.com/any/path",
			base:     "http://example.com",
			wantErr:  false,
		},
		{
			name:       "base path without trailing slash - different directory should fail",
			resolved:   "http://example.com/api/pods",
			base:       "http://example.com/api/v1",
			wantErr:    true,
			errContain: "path escaped base prefix",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolved, err := url.Parse(tt.resolved)
			if err != nil {
				t.Fatalf("failed to parse resolved URL: %v", err)
			}

			base, err := url.Parse(tt.base)
			if err != nil {
				t.Fatalf("failed to parse base URL: %v", err)
			}

			err = validateResolvedURL(resolved, base)
			if tt.wantErr {
				if err == nil {
					t.Errorf("validateResolvedURL() expected error, got nil")
					return
				}

				if tt.errContain != "" && !bytes.Contains([]byte(err.Error()), []byte(tt.errContain)) {
					t.Errorf("validateResolvedURL() error = %v, want error containing %q", err, tt.errContain)
				}
			} else if err != nil {
				t.Errorf("validateResolvedURL() unexpected error: %v", err)
			}
		})
	}
}

func TestGetWithResolvedURLValidation(t *testing.T) {
	// Test that requests escaping the base path are blocked
	// Using a base URL with a path prefix
	conn := &Connection{URI: "http://example.com/api/v1/"}

	// Test that leading slash resets path (this should be blocked by resolved URL validation)
	// When requestURI is "/different", ResolveReference makes it "http://example.com/different"
	// which escapes the /api/v1/ base path
	_, err := conn.Get("/different")
	if err == nil {
		t.Error("Get(/different) should fail when it escapes base path /api/v1/")
	}

	// Verify the error message indicates path escape
	if err != nil && !bytes.Contains([]byte(err.Error()), []byte("path escaped base prefix")) {
		t.Errorf("Get(/different) error = %v, want error containing 'path escaped base prefix'", err)
	}

	// Test that path traversal via leading slash is caught
	conn2 := &Connection{URI: "http://example.com/api/v1/"}

	_, err = conn2.Get("/etc/passwd")
	if err == nil {
		t.Error("Get(/etc/passwd) should fail when it escapes base path /api/v1/")
	}
}

// TestValidateRequestURI_EncodingBypass tests various URL encoding bypass attempts.
func TestValidateRequestURI_EncodingBypass(t *testing.T) {
	testCases := []struct {
		name      string
		uri       string
		wantError bool
	}{
		// URL-encoded path traversal
		{"encoded path traversal", "%2e%2e/%2e%2e/etc/passwd", true},
		{"double encoded traversal", "%252e%252e/etc/passwd", true},
		{"triple encoded traversal", "%25252e%25252e/etc/passwd", true},

		// URL-encoded schemes
		{"encoded http scheme", "%68%74%74%70://attacker.com", true},
		{"encoded https scheme", "%68%74%74%70%73://evil.com", true},

		// Mixed case schemes
		{"mixed case http", "Http://attacker.com", true},
		{"mixed case https", "HTTPS://attacker.com", true},
		{"all caps http", "HTTP://attacker.com", true},
		{"alternating case", "hTtP://attacker.com", true},

		// Backslash traversal (should be blocked by regex)
		{"backslash traversal", "..\\..\\etc\\passwd", true},
		{"mixed slash traversal", "../..\\etc/passwd", true},

		// Userinfo patterns
		{"userinfo pattern", "user:pass@evil.com/path", true},
		{"userinfo with encoded at", "user%40host.com/path", false}, // @ is encoded, not userinfo
		{"at sign in path is ok", "/api/v1/users@example.com", false},

		// Valid paths should still work
		{"valid api path", "/api/v1/pods", false},
		{"valid with query", "/api/v1/pods?labelSelector=app=foo,version=1", false},
		{"valid with multiple labels", "/api/v1/pods?labelSelector=app=nginx,env=prod,tier=frontend", false},
		{"valid with watch", "/api/v1/namespaces/default/pods?watch=true", false},
		{"valid with limit", "/api/v1/pods?limit=100", false},

		// Cloud metadata service patterns (blocked by transport, but test validation)
		{"metadata service path only", "/latest/meta-data/", false}, // Path-only is allowed
		{"metadata absolute URL", "http://169.254.169.254/latest/meta-data/", true},

		// Null byte injection attempts
		{"null byte in path", "/api/v1/pods%00.txt", true},

		// Unicode normalization attacks
		{"unicode dot", "/api/v1/\u002e\u002e/etc/passwd", true},

		// Fragment injection
		{"fragment in URI", "/api/v1/pods#fragment", true},

		// Empty segments
		{"double slash", "/api//v1/pods", false}, // Generally allowed
		{"triple slash", "/api///v1/pods", false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateRequestURI(tc.uri)
			if tc.wantError && err == nil {
				t.Errorf("expected error for %q, got nil", tc.uri)
			}

			if !tc.wantError && err != nil {
				t.Errorf("unexpected error for %q: %v", tc.uri, err)
			}
		})
	}
}

// TestValidateResolvedURL_BasePathBypass tests that base path validation cannot be bypassed.
func TestValidateResolvedURL_BasePathBypass(t *testing.T) {
	testCases := []struct {
		name      string
		base      string
		resolved  string
		wantError bool
	}{
		// Base path /api/v1 should NOT allow access to /api/v2
		{
			name:      "version bypass attempt",
			base:      "http://example.com/api/v1",
			resolved:  "http://example.com/api/v2/pods",
			wantError: true,
		},
		{
			name:      "version bypass with trailing slash",
			base:      "http://example.com/api/v1/",
			resolved:  "http://example.com/api/v2/pods",
			wantError: true,
		},
		// Valid subpaths should work
		{
			name:      "valid subpath",
			base:      "http://example.com/api/v1",
			resolved:  "http://example.com/api/v1/pods",
			wantError: false,
		},
		{
			name:      "valid exact match",
			base:      "http://example.com/api/v1",
			resolved:  "http://example.com/api/v1",
			wantError: false,
		},
		// Similar prefix but different path should be blocked
		{
			name:      "similar prefix different path",
			base:      "http://example.com/api/v1",
			resolved:  "http://example.com/api/v10/pods",
			wantError: true,
		},
		{
			name:      "prefix substring attack",
			base:      "http://example.com/api/v1",
			resolved:  "http://example.com/api/v1extra/pods",
			wantError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			base, _ := url.Parse(tc.base)
			resolved, _ := url.Parse(tc.resolved)

			err := validateResolvedURL(resolved, base)
			if tc.wantError && err == nil {
				t.Errorf("expected error for base=%q resolved=%q, got nil", tc.base, tc.resolved)
			}

			if !tc.wantError && err != nil {
				t.Errorf("unexpected error for base=%q resolved=%q: %v", tc.base, tc.resolved, err)
			}
		})
	}
}
