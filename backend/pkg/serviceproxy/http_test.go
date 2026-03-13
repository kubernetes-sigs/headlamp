package serviceproxy_test

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"
)

// newTestClient creates an HTTP client without SSRF protection for testing.
func newTestClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout}
}

//nolint:funlen
func TestHTTPGet(t *testing.T) {
	// Use test client without SSRF protection for these tests
	serviceproxy.SetHTTPClientFactory(newTestClient)
	t.Cleanup(serviceproxy.ResetHTTPClientFactory)

	tests := []struct {
		name       string
		url        string
		statusCode int
		body       string
		wantErr    bool
	}{
		{
			name:       "valid URL",
			url:        "http://example.com",
			statusCode: http.StatusOK,
			body:       "Hello, World!",
			wantErr:    false,
		},
		{
			name:       "invalid URL",
			url:        " invalid-url",
			statusCode: 0,
			body:       "",
			wantErr:    true,
		},
		{
			name:       "server returns error response",
			url:        "http://example.com/error",
			statusCode: http.StatusInternalServerError,
			body:       "",
			wantErr:    true,
		},
		{
			name:       "context cancellation",
			url:        "http://example.com/cancel",
			statusCode: http.StatusOK,
			body:       "Hello, World!",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case tt.url == "http://example.com/error":
					w.WriteHeader(http.StatusInternalServerError)
				case tt.name == "context cancellation":
					<-r.Context().Done()
					w.WriteHeader(http.StatusOK)

					if _, err := w.Write([]byte(tt.body)); err != nil {
						t.Fatal(err)
					}
				default:
					if _, err := w.Write([]byte(tt.body)); err != nil {
						t.Fatalf("write test: %v", err)
					}
				}
			}))
			defer ts.Close()

			url := ts.URL
			if tt.url == " invalid-url" {
				url = tt.url
			} else if tt.url == "http://example.com/error" {
				url = ts.URL + "/error"
			}

			if ctx := context.Background(); tt.name == "context cancellation" {
				var cancel context.CancelFunc
				_, cancel = context.WithCancel(ctx)
				cancel()
			}

			resp, err := serviceproxy.HTTPGet(context.Background(), url)
			if (err != nil) != tt.wantErr {
				t.Errorf("HTTPGet() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && string(resp) != tt.body {
				t.Errorf("HTTPGet() response = %s, want %s", resp, tt.body)
			}
		})
	}
}

func TestHTTPGetTimeout(t *testing.T) {
	// Use test client without SSRF protection for this test
	serviceproxy.SetHTTPClientFactory(newTestClient)
	t.Cleanup(serviceproxy.ResetHTTPClientFactory)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(15 * time.Second)

		if _, err := w.Write([]byte("Hello, World!")); err != nil {
			t.Fatalf("write test: %v", err)
		}
	}))
	t.Cleanup(ts.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	t.Cleanup(cancel)

	_, err := serviceproxy.HTTPGet(ctx, ts.URL)
	if err == nil {
		t.Errorf("HTTPGet() error = nil, want error")
	}
}

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		name      string
		ip        string
		isPrivate bool
	}{
		// Loopback addresses
		{"IPv4 loopback", "127.0.0.1", true},
		{"IPv4 loopback alternate", "127.0.0.2", true},
		{"IPv6 loopback", "::1", true},
		// Private ranges
		{"10.x.x.x private", "10.0.0.1", true},
		{"10.x.x.x private alt", "10.255.255.255", true},
		{"172.16.x.x private", "172.16.0.1", true},
		{"172.31.x.x private", "172.31.255.255", true},
		{"192.168.x.x private", "192.168.0.1", true},
		{"192.168.x.x private alt", "192.168.255.255", true},
		// Link-local
		{"IPv4 link-local", "169.254.0.1", true},
		{"IPv4 link-local alt", "169.254.255.255", true},
		{"IPv6 link-local", "fe80::1", true},
		// Unspecified
		{"IPv4 unspecified", "0.0.0.0", true},
		{"IPv6 unspecified", "::", true},
		// Public IPs (should not be private)
		{"public IP 1", "8.8.8.8", false},
		{"public IP 2", "1.1.1.1", false},
		{"public IP 3", "93.184.216.34", false},
		// Edge cases near private ranges
		{"172.15.x.x not private", "172.15.255.255", false},
		{"172.32.x.x not private", "172.32.0.0", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP: %s", tt.ip)
			}

			result := serviceproxy.IsPrivateIP(ip)
			if result != tt.isPrivate {
				t.Errorf("IsPrivateIP(%s) = %v, want %v", tt.ip, result, tt.isPrivate)
			}
		})
	}
}

//nolint:funlen // Table-driven test with comprehensive security test cases
func TestSSRFSafeDialContext(t *testing.T) {
	dialer := &net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 5 * time.Second,
	}

	dialFunc := serviceproxy.SSRFSafeDialContext(dialer)

	tests := []struct {
		name    string
		addr    string
		wantErr bool
		errMsg  string
	}{
		{
			name:    "localhost should be blocked",
			addr:    "127.0.0.1:80",
			wantErr: true,
			errMsg:  "connection to private IP address",
		},
		{
			name:    "private 10.x.x.x should be blocked",
			addr:    "10.0.0.1:80",
			wantErr: true,
			errMsg:  "connection to private IP address",
		},
		{
			name:    "private 192.168.x.x should be blocked",
			addr:    "192.168.1.1:80",
			wantErr: true,
			errMsg:  "connection to private IP address",
		},
		{
			name:    "private 172.16.x.x should be blocked",
			addr:    "172.16.0.1:80",
			wantErr: true,
			errMsg:  "connection to private IP address",
		},
		{
			name:    "link-local should be blocked",
			addr:    "169.254.1.1:80",
			wantErr: true,
			errMsg:  "connection to private IP address",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			_, err := dialFunc(ctx, "tcp", tt.addr)

			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error for %s, got nil", tt.addr)
					return
				}

				if !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("error %q should contain %q", err.Error(), tt.errMsg)
				}
			} else if err != nil {
				t.Errorf("unexpected error for %s: %v", tt.addr, err)
			}
		})
	}
}

func TestHTTPGetSSRFProtection(t *testing.T) {
	// Ensure SSRF-safe client is used (default)
	serviceproxy.ResetHTTPClientFactory()

	// Create a test server on localhost (which should be blocked)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte("This should not be reachable")); err != nil {
			t.Fatalf("write test: %v", err)
		}
	}))
	defer ts.Close()

	// Try to reach the localhost server - should be blocked
	_, err := serviceproxy.HTTPGet(context.Background(), ts.URL)
	if err == nil {
		t.Error("HTTPGet to localhost should have been blocked by SSRF protection")
	}

	if !strings.Contains(err.Error(), "private IP address") {
		t.Errorf("error should mention private IP address blocking, got: %v", err)
	}
}
