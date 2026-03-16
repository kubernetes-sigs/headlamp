package kubeconfig_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockRoundTripper struct {
	capturedRequest *http.Request
	response        *http.Response
	err             error
}

func (m *mockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	m.capturedRequest = req

	if m.response != nil {
		return m.response, m.err
	}

	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       http.NoBody,
	}, m.err
}

func TestBuildUserAgent(t *testing.T) {
	tests := []struct {
		name       string
		version    string
		appName    string
		expectedUA string
	}{
		{
			name:       "default values",
			version:    "unknown",
			appName:    "Headlamp",
			expectedUA: "Headlamp unknown (" + runtime.GOOS + "/" + runtime.GOARCH + ")",
		},
		{
			name:       "custom version",
			version:    "1.2.3",
			appName:    "Headlamp",
			expectedUA: "Headlamp 1.2.3 (" + runtime.GOOS + "/" + runtime.GOARCH + ")",
		},
		{
			name:       "custom app name",
			version:    "1.0.0",
			appName:    "Custom App",
			expectedUA: "Custom App 1.0.0 (" + runtime.GOOS + "/" + runtime.GOARCH + ")",
		},
		{
			name:       "app name with spaces",
			version:    "2.0.0",
			appName:    "My Custom Headlamp",
			expectedUA: "My Custom Headlamp 2.0.0 (" + runtime.GOOS + "/" + runtime.GOARCH + ")",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Store original values
			origVersion := kubeconfig.Version
			origAppName := kubeconfig.AppName

			defer func() {
				kubeconfig.Version = origVersion
				kubeconfig.AppName = origAppName
			}()

			kubeconfig.Version = tt.version
			kubeconfig.AppName = tt.appName

			// Test
			userAgent := kubeconfig.BuildUserAgent()
			assert.Equal(t, tt.expectedUA, userAgent)
		})
	}
}

func TestUserAgentRoundTripper_RoundTrip(t *testing.T) {
	t.Run("adds user agent header", func(t *testing.T) {
		testAddsUserAgentHeader(t)
	})

	t.Run("overwrites existing user agent", func(t *testing.T) {
		testOverwritesExistingUserAgent(t)
	})

	t.Run("preserves other headers", func(t *testing.T) {
		testPreservesOtherHeaders(t)
	})

	t.Run("does not modify original request", func(t *testing.T) {
		testDoesNotModifyOriginalRequest(t)
	})

	t.Run("propagates errors from base round tripper", func(t *testing.T) {
		testPropagatesErrors(t)
	})
}

func testAddsUserAgentHeader(t *testing.T) {
	t.Helper()

	mockRT := &mockRoundTripper{}
	userAgent := "TestApp/1.0.0 (linux/amd64)"
	rt := &kubeconfig.UserAgentRoundTripper{
		Base:      mockRT,
		UserAgent: userAgent,
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com/api", nil)
	originalReq := req.Clone(context.Background())

	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	if resp.Body != nil {
		defer resp.Body.Close()
	}

	require.NotNil(t, mockRT.capturedRequest)

	// Check that User-Agent header was added
	assert.Equal(t, userAgent, mockRT.capturedRequest.Header.Get("User-Agent"))

	// Verify original request was not modified
	assert.Empty(t, originalReq.Header.Get("User-Agent"))
}

func testOverwritesExistingUserAgent(t *testing.T) {
	t.Helper()

	mockRT := &mockRoundTripper{}
	userAgent := "Headlamp/2.0.0 (darwin/arm64)"
	rt := &kubeconfig.UserAgentRoundTripper{
		Base:      mockRT,
		UserAgent: userAgent,
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com/api", nil)
	req.Header.Set("User-Agent", "OldUserAgent/1.0")

	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	if resp.Body != nil {
		defer resp.Body.Close()
	}

	// Check that User-Agent header was replaced
	assert.Equal(t, userAgent, mockRT.capturedRequest.Header.Get("User-Agent"))
}

func testPreservesOtherHeaders(t *testing.T) {
	t.Helper()

	mockRT := &mockRoundTripper{}
	userAgent := "Headlamp/3.0.0 (windows/amd64)"
	rt := &kubeconfig.UserAgentRoundTripper{
		Base:      mockRT,
		UserAgent: userAgent,
	}

	// Create a request with multiple headers
	req := httptest.NewRequest(http.MethodPost, "http://example.com/api", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer token123")
	req.Header.Set("X-Custom-Header", "custom-value")

	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	if resp.Body != nil {
		defer resp.Body.Close()
	}

	// Check all headers are preserved
	assert.Equal(t, userAgent, mockRT.capturedRequest.Header.Get("User-Agent"))
	assert.Equal(t, "application/json", mockRT.capturedRequest.Header.Get("Content-Type"))
	assert.Equal(t, "Bearer token123", mockRT.capturedRequest.Header.Get("Authorization"))
	assert.Equal(t, "custom-value", mockRT.capturedRequest.Header.Get("X-Custom-Header"))
}

func testDoesNotModifyOriginalRequest(t *testing.T) {
	t.Helper()

	mockRT := &mockRoundTripper{}
	userAgent := "Headlamp/1.0.0 (linux/amd64)"
	rt := &kubeconfig.UserAgentRoundTripper{
		Base:      mockRT,
		UserAgent: userAgent,
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com/api", nil)
	req.Header.Set("X-Test-Header", "test-value")

	// Store original header count
	originalHeaderCount := len(req.Header)

	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}

	// Original request should not have User-Agent header added
	assert.Empty(t, req.Header.Get("User-Agent"))
	assert.Equal(t, originalHeaderCount, len(req.Header))
	assert.Equal(t, "test-value", req.Header.Get("X-Test-Header"))
}

func testPropagatesErrors(t *testing.T) {
	t.Helper()

	expectedErr := assert.AnError
	mockRT := &mockRoundTripper{
		err: expectedErr,
	}
	userAgent := "Headlamp/1.0.0 (linux/amd64)"
	rt := &kubeconfig.UserAgentRoundTripper{
		Base:      mockRT,
		UserAgent: userAgent,
	}

	// Create a test request
	req := httptest.NewRequest(http.MethodGet, "http://example.com/api", nil)

	resp, err := rt.RoundTrip(req)

	// Verify
	require.Error(t, err)
	assert.Equal(t, expectedErr, err)
	assert.NotNil(t, resp) // Our mock still returns a response

	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}
}

func TestUserAgentIntegration(t *testing.T) {
	t.Run("user agent in real HTTP request", func(t *testing.T) {
		// Setup a test server that captures the User-Agent
		var capturedUserAgent string

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			capturedUserAgent = r.Header.Get("User-Agent")

			w.WriteHeader(http.StatusOK)
		}))

		defer server.Close()

		// Store original values
		origVersion := kubeconfig.Version
		origAppName := kubeconfig.AppName

		defer func() {
			kubeconfig.Version = origVersion
			kubeconfig.AppName = origAppName
		}()

		kubeconfig.Version = "1.2.3"
		kubeconfig.AppName = "TestHeadlamp"

		client := &http.Client{
			Transport: &kubeconfig.UserAgentRoundTripper{
				Base:      http.DefaultTransport,
				UserAgent: kubeconfig.BuildUserAgent(),
			},
		}

		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL, nil)
		require.NoError(t, err)

		resp, err := client.Do(req)
		require.NoError(t, err)

		defer resp.Body.Close()

		// Verify
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		expectedUA := "TestHeadlamp 1.2.3 (" + runtime.GOOS + "/" + runtime.GOARCH + ")"
		assert.Equal(t, expectedUA, capturedUserAgent)
	})
}
