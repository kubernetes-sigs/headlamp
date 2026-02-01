package serviceproxy

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// httpClientFactory is a function type for creating HTTP clients.
// This allows injection of custom clients for testing.
type httpClientFactory func(timeout time.Duration) *http.Client

// defaultClientFactory is the production client factory that creates SSRF-safe clients.
var defaultClientFactory httpClientFactory = newSSRFSafeClient

// SetHTTPClientFactory allows overriding the HTTP client factory for testing.
// This should only be used in tests.
func SetHTTPClientFactory(factory httpClientFactory) {
	defaultClientFactory = factory
}

// ResetHTTPClientFactory restores the default SSRF-safe client factory.
func ResetHTTPClientFactory() {
	defaultClientFactory = newSSRFSafeClient
}

// IsPrivateIP checks if an IP address is in a private, loopback, or link-local range.
// This is used to prevent SSRF attacks by blocking connections to internal network resources.
func IsPrivateIP(ip net.IP) bool {
	// Check for loopback addresses (127.0.0.0/8, ::1)
	if ip.IsLoopback() {
		return true
	}

	// Check for link-local addresses (169.254.0.0/16, fe80::/10)
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}

	// Check for private addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7)
	if ip.IsPrivate() {
		return true
	}

	// Check for unspecified addresses (0.0.0.0, ::)
	if ip.IsUnspecified() {
		return true
	}

	return false
}

// SSRFSafeDialContext returns a DialContext function that validates resolved IP addresses
// to prevent SSRF attacks by blocking connections to private network ranges.
func SSRFSafeDialContext(dialer *net.Dialer) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		// Extract host from address
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("invalid address: %w", err)
		}

		// Resolve the hostname to IP addresses
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, fmt.Errorf("DNS resolution failed: %w", err)
		}

		// Check all resolved IPs - block if any are private
		for _, ip := range ips {
			if IsPrivateIP(ip.IP) {
				return nil, fmt.Errorf("connection to private IP address %s is not allowed", ip.IP.String())
			}
		}

		// All IPs are safe, proceed with the connection
		return dialer.DialContext(ctx, network, net.JoinHostPort(host, port))
	}
}

// newSSRFSafeClient creates an HTTP client configured with transport-level SSRF protections.
// It uses a custom DialContext that validates resolved IP addresses are not in private ranges.
func newSSRFSafeClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		DialContext:           SSRFSafeDialContext(dialer),
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		// Disable automatic redirect following to prevent redirect-based SSRF
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			// The next request will go through our SSRF-safe transport,
			// so redirects to private IPs will be blocked at the dial level
			return nil
		},
	}
}

// HTTPGet sends an HTTP GET request to the specified URI.
func HTTPGet(ctx context.Context, uri string) ([]byte, error) {
	cli := defaultClientFactory(10 * time.Second)

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("make request to %s", uri))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %v", err)
	}

	resp, err := cli.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed HTTP GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed HTTP GET, status code %v", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return body, nil
}
