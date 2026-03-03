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

package externalproxy_test

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/externalproxy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewHandler(t *testing.T) {
	allowedURLs := []string{"https://example.com/*", "https://api.example.org/*"}
	handler := externalproxy.NewHandler(allowedURLs)

	assert.NotNil(t, handler)
	assert.Equal(t, allowedURLs, handler.AllowedURLs)
}

func TestHandler_ServeHTTP_EmptyProxyURL(t *testing.T) {
	handler := externalproxy.NewHandler([]string{"https://example.com/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "proxy URL is empty")
}

func TestHandler_ServeHTTP_InvalidProxyURL(t *testing.T) {
	handler := externalproxy.NewHandler([]string{"https://example.com/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", "://invalid-url")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "proxy URL is invalid")
}

func TestHandler_ServeHTTP_URLNotAllowed(t *testing.T) {
	handler := externalproxy.NewHandler([]string{"https://example.com/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", "https://malicious.com/api")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "no allowed proxy url match")
}

func TestHandler_ServeHTTP_ForwardToHeader(t *testing.T) {
	// Create a mock server to proxy to
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("proxied response"))
	}))
	defer mockServer.Close()

	handler := externalproxy.NewHandler([]string{mockServer.URL + "/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	req.Header.Set("Forward-to", mockServer.URL+"/api")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "proxied response", rr.Body.String())
}

func TestHandler_ServeHTTP_Success(t *testing.T) {
	// Create a mock server to proxy to
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom-Header", "test-value")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("proxied response"))
	}))
	defer mockServer.Close()

	handler := externalproxy.NewHandler([]string{mockServer.URL + "/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", mockServer.URL+"/api")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "proxied response", rr.Body.String())
	assert.Equal(t, "test-value", rr.Header().Get("X-Custom-Header"))
	// Check cache control headers are set
	assert.Contains(t, rr.Header().Get("Cache-Control"), "no-cache")
}

func TestHandler_ServeHTTP_GzipResponse(t *testing.T) {
	// Create a mock server that returns gzip compressed response
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		w.WriteHeader(http.StatusOK)

		gz := gzip.NewWriter(w)
		defer gz.Close()

		_, _ = gz.Write([]byte("compressed response"))
	}))
	defer mockServer.Close()

	handler := externalproxy.NewHandler([]string{mockServer.URL + "/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", mockServer.URL+"/api")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "compressed response", rr.Body.String())
}

func TestHandler_ServeHTTP_PostWithBody(t *testing.T) {
	// Create a mock server that echoes the request body
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer mockServer.Close()

	handler := externalproxy.NewHandler([]string{mockServer.URL + "/*"})

	body := strings.NewReader(`{"key": "value"}`)
	req := httptest.NewRequest(http.MethodPost, "/externalproxy", body)
	req.Header.Set("proxy-to", mockServer.URL+"/api")
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, `{"key": "value"}`, rr.Body.String())
}

func TestHandler_ServeHTTP_ProxyError(t *testing.T) {
	handler := externalproxy.NewHandler([]string{"http://localhost:99999/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", "http://localhost:99999/api")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadGateway, rr.Code)
}

func TestHandler_ServeHTTP_UpstreamStatusCode(t *testing.T) {
	// Create a mock server that returns a specific status code
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("not found"))
	}))
	defer mockServer.Close()

	handler := externalproxy.NewHandler([]string{mockServer.URL + "/*"})

	req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", mockServer.URL+"/missing")

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	// Should forward the upstream status code
	assert.Equal(t, http.StatusNotFound, rr.Code)
	assert.Equal(t, "not found", rr.Body.String())
}

func TestIsURLAllowed(t *testing.T) {
	tests := []struct {
		name        string
		allowedURLs []string
		testURL     string
		expected    bool
	}{
		{
			name:        "exact match allowed",
			allowedURLs: []string{"https://example.com/api"},
			testURL:     "https://example.com/api",
			expected:    true,
		},
		{
			name:        "wildcard match allowed",
			allowedURLs: []string{"https://example.com/*"},
			testURL:     "https://example.com/api/v1/resource",
			expected:    true,
		},
		{
			name:        "no match",
			allowedURLs: []string{"https://example.com/*"},
			testURL:     "https://malicious.com/api",
			expected:    false,
		},
		{
			name:        "multiple patterns - second matches",
			allowedURLs: []string{"https://example.com/*", "https://api.example.org/*"},
			testURL:     "https://api.example.org/v1",
			expected:    true,
		},
		{
			name:        "empty allowed list",
			allowedURLs: []string{},
			testURL:     "https://example.com/api",
			expected:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := externalproxy.NewHandler(tt.allowedURLs)
			parsedURL, err := url.Parse(tt.testURL)
			require.NoError(t, err)

			// We can test URL allowance by checking ServeHTTP behavior
			req := httptest.NewRequest(http.MethodGet, "/externalproxy", nil)
			req.Header.Set("proxy-to", tt.testURL)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			// Use the parsed URL to avoid unused warning
			_ = parsedURL.String()

			if tt.expected {
				// If URL should be allowed, we shouldn't get "no allowed proxy url match" error
				assert.NotContains(t, rr.Body.String(), "no allowed proxy url match")
			} else {
				// If URL should not be allowed, we should get the error
				assert.Contains(t, rr.Body.String(), "no allowed proxy url match")
			}
		})
	}
}
