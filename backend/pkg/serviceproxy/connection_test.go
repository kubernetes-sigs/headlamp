package serviceproxy //nolint:testpackage // Tests exercise unexported service proxy internals.

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

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

type getTest struct {
	name        string
	uri         string
	requestURI  string
	wantPath    string
	wantRawPath string
	wantBody    []byte
	wantErr     bool
}

var getTests = []getTest{
	{
		name:       "valid request",
		uri:        "http://example.com",
		requestURI: "/test",
		wantPath:   "/test",
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
		requestURI: "%zz",
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
	{
		name:       "protocol-relative URI rejected",
		uri:        "http://example.com",
		requestURI: "//evil.example/path",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "path traversal with ../ rejected",
		uri:        "http://example.com",
		requestURI: "../secret",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "empty path resolves without error",
		uri:        "http://example.com",
		requestURI: "",
		wantPath:   "/",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
	{
		name:       "prefixed URI preserves base path",
		uri:        "http://example.com/api/v1/proxy",
		requestURI: "/status",
		wantPath:   "/api/v1/proxy/status",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
	{
		name:       "prefixed URI with traversal preserves prefix",
		uri:        "http://example.com/api/v1/proxy",
		requestURI: "/../status",
		wantPath:   "/api/v1/proxy/status",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
	{
		name:       "prefixed URI with trailing slash and empty requestURI",
		uri:        "http://example.com/api/v1/proxy/",
		requestURI: "",
		wantPath:   "/api/v1/proxy/",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
	{
		name:       "requestURI with trailing slash preserves trailing slash",
		uri:        "http://example.com/api/v1/proxy",
		requestURI: "/status/",
		wantPath:   "/api/v1/proxy/status/",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
	{
		name:        "requestURI with encoded slash preserves raw path",
		uri:         "http://example.com/api/v1/proxy",
		requestURI:  "/items/a%2Fb",
		wantPath:    "/api/v1/proxy/items/a/b",
		wantRawPath: "/api/v1/proxy/items/a%2Fb",
		wantBody:    []byte("Hello, World!"),
		wantErr:     false,
	},
	{
		name:        "encoded slash in base path keeps raw path consistent",
		uri:         "http://example.com/api%2F",
		requestURI:  "/status",
		wantPath:    "/api//status",
		wantRawPath: "/api%2F/status",
		wantBody:    []byte("Hello, World!"),
		wantErr:     false,
	},
	{
		name:       "encoded dot segments escaping base path rejected",
		uri:        "http://example.com/api/v1",
		requestURI: "/%2e%2e/secret",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "encoded dot segments nested escaping base path rejected",
		uri:        "http://example.com/api/v1",
		requestURI: "/a/%2e%2e/%2e%2e/secret",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "traversal escaping base path rejected",
		uri:        "http://example.com/api/v1/proxy",
		requestURI: "../secret",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "deep traversal within prefixed URI normalized",
		uri:        "http://example.com/api/v1/proxy",
		requestURI: "/../../status",
		wantPath:   "/api/v1/proxy/status",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
	{
		name:       "multi-level relative traversal rejected",
		uri:        "http://example.com/api/v1/proxy",
		requestURI: "../../secret",
		wantBody:   nil,
		wantErr:    true,
	},
	{
		name:       "dot-dot-slash within absolute path confined to base",
		uri:        "http://example.com/api",
		requestURI: "/../../../etc/passwd",
		wantPath:   "/api/etc/passwd",
		wantBody:   []byte("Hello, World!"),
		wantErr:    false,
	},
}

func newGetTestServer(t *testing.T, tt getTest) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if tt.wantPath != "" && r.URL.Path != tt.wantPath {
			t.Errorf("Expected path %s, got %s", tt.wantPath, r.URL.Path)
		}

		if tt.wantRawPath != "" && r.URL.RawPath != tt.wantRawPath {
			t.Errorf("Expected raw path %s, got %s", tt.wantRawPath, r.URL.RawPath)
		}

		if _, err := w.Write(tt.wantBody); err != nil {
			t.Fatal(err)
		}
	}))
}

func TestGet(t *testing.T) {
	for _, tt := range getTests {
		t.Run(tt.name, func(t *testing.T) {
			conn := &Connection{URI: tt.uri}

			if tt.wantBody != nil {
				ts := newGetTestServer(t, tt)
				defer ts.Close()

				conn.URI = ts.URL

				if u, err := url.Parse(tt.uri); err == nil {
					conn.URI = ts.URL + u.EscapedPath()
				}
			}

			w := httptest.NewRecorder()

			err := conn.Get(context.Background(), tt.requestURI, w)
			if (err != nil) != tt.wantErr {
				t.Errorf("Get() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && !bytes.Equal(w.Body.Bytes(), tt.wantBody) {
				t.Errorf("Get() body = %s, want %s", w.Body.Bytes(), tt.wantBody)
			}
		})
	}
}

func TestGetNonOKStatusCode(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)

		if _, err := w.Write([]byte("upstream error")); err != nil {
			t.Fatal(err)
		}
	}))
	defer ts.Close()

	conn := &Connection{URI: ts.URL}
	w := httptest.NewRecorder()

	err := conn.Get(context.Background(), "/test", w)
	if err != nil {
		t.Errorf("Get() error = %v, want nil", err)
	}

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Get() status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
}

func TestGetUsesContext(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer ts.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	conn := &Connection{URI: ts.URL}
	w := httptest.NewRecorder()

	err := conn.Get(ctx, "/test", w)
	if err == nil {
		t.Errorf("Get() error = nil, want error")
	}
}
