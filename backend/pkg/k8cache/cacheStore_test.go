// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package k8cache_test

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

// TestGetResponseBody checks that the response body is correctly decoded
// based on the content encoding (e.g., gzip).
func TestGetResponseBody(t *testing.T) {
	tests := []struct {
		name            string
		bodyBytes       []byte
		contentEncoding string
		expectedBody    string
		expectError     bool
	}{
		{
			name: "valid gzip response",
			bodyBytes: func() []byte {
				var buf bytes.Buffer

				gz := gzip.NewWriter(&buf)

				_, _ = gz.Write([]byte("test-response"))
				_ = gz.Close()

				return buf.Bytes()
			}(),
			contentEncoding: "gzip",
			expectedBody:    "test-response",
			expectError:     false,
		},
		{
			name: "empty gzip response",
			bodyBytes: func() []byte {
				var buf bytes.Buffer

				gz := gzip.NewWriter(&buf)
				_ = gz.Close()

				return buf.Bytes()
			}(),
			contentEncoding: "gzip",
			expectedBody:    "",
			expectError:     false,
		},
		{
			name:            "invalid gzip data - should return error",
			bodyBytes:       []byte("not-gzip-data"),
			contentEncoding: "gzip",
			expectedBody:    "",
			expectError:     true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body, err := k8cache.GetResponseBody(tc.bodyBytes, tc.contentEncoding)

			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tc.expectedBody, body)
			}
		})
	}
}

func TestIsKubernetesAPIPath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected bool
	}{
		{
			name:     "proxied core resource path",
			path:     "/clusters/kind-kind/api/v1/pods",
			expected: true,
		},
		{
			name:     "proxied named resource path",
			path:     "/clusters/kind-kind/apis/apps/v1/deployments",
			expected: true,
		},
		{
			name:     "direct core resource path",
			path:     "/api/v1/pods",
			expected: true,
		},
		{
			name:     "direct named resource path",
			path:     "/apis/apps/v1/deployments",
			expected: true,
		},
		{
			name:     "direct core api root",
			path:     "/api",
			expected: true,
		},
		{
			name:     "proxied named api root with trailing slash",
			path:     "/clusters/kind-kind/apis/",
			expected: true,
		},
		{
			name:     "proxied discovery path",
			path:     "/clusters/kind-kind/api/",
			expected: true,
		},
		{
			name:     "proxied healthz path",
			path:     "/clusters/kind-kind/healthz",
			expected: false,
		},
		{
			name:     "proxied version path",
			path:     "/clusters/kind-kind/version",
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, k8cache.IsKubernetesAPIPath(tc.path))
		})
	}
}

// TestGenerateKey checks that distinct resources and response variants cannot collide.
func TestGenerateKey(t *testing.T) {
	pairs := [][2]string{
		{"/api/v1/namespaces/ns/pods/shared", "/api/v1/namespaces/ns/secrets/shared"},
		{"/apis/apps/v1/namespaces/ns/deployments/app", "/apis/apps/v1beta1/namespaces/ns/deployments/app"},
		{"/api/v1/namespaces/ns/pods/app", "/api/v1/namespaces/other/pods/app"},
		{"/api/v1/namespaces/ns/pods/app", "/api/v1/namespaces/ns/pods/app/status"},
		{"/api/v1/pods?labelSelector=app%3Da", "/api/v1/pods?labelSelector=app%3Db"},
		{"/api/v1/pods?fieldSelector=metadata.name%3Da", "/api/v1/pods?fieldSelector=metadata.name%3Db"},
		{"/api/v1/pods?continue=a", "/api/v1/pods?continue=b"},
	}
	for _, pair := range pairs {
		left, _ := url.Parse(pair[0])
		right, _ := url.Parse(pair[1])
		a, err := k8cache.GenerateKey(left, "connection")
		assert.NoError(t, err)
		b, err := k8cache.GenerateKey(right, "connection")
		assert.NoError(t, err)
		assert.NotEqual(t, a, b, "%v", pair)
	}

	left, _ := url.Parse("/clusters/main/api/v1/pods?b=2&a=1")
	right, _ := url.Parse("/api/v1/pods?a=1&b=2")
	a, _ := k8cache.GenerateKey(left, "connection")
	b, _ := k8cache.GenerateKey(right, "connection")
	assert.Equal(t, a, b)

	for _, context := range []string{"prod+cluster", "prod%2Bcluster"} {
		different, err := k8cache.GenerateKey(left, context)
		assert.NoError(t, err)
		assert.NotEqual(t, a, different)
	}

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, right.String(), nil)
	request.Header.Set("Accept", "application/json;as=Table;g=meta.k8s.io;v=v1")
	representation, err := k8cache.GenerateRequestKey(request, "connection")
	assert.NoError(t, err)
	assert.NotEqual(t, b, representation)

	_, err = k8cache.GenerateKey(&url.URL{Path: "/not-api"}, "connection")
	assert.Error(t, err)
}

func TestSetHeader(t *testing.T) {
	tests := []struct {
		name              string
		cacheData         k8cache.CachedResponseData
		expectedCacheData k8cache.CachedResponseData
	}{
		{
			name: "cache data is valid",
			cacheData: k8cache.CachedResponseData{
				StatusCode: 200,
				Headers: http.Header{
					"Content-Type": {"application/json"},
					"X-Test":       {"true"},
				},
				Body: `{"message": "OK"}`,
			},
		},
		{
			name: "cache return X-HEADLAMP-CACHE as true",
			cacheData: k8cache.CachedResponseData{
				StatusCode: 200,
				Headers: http.Header{
					"Content-Type":     {"application/json"},
					"X-HEADLAMP-CACHE": {"true"},
				},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			k8cache.SetHeader(tc.cacheData, rr)

			for key, expectedValue := range tc.cacheData.Headers {
				actualValues := rr.Header().Values(key)
				if !reflect.DeepEqual(actualValues, expectedValue) {
					t.Errorf("Header %s: expected %v, got %v", key, expectedValue, actualValues)
				}
			}
		})
	}
}

// TestFilterToCache verifies that headers are correctly filtered before caching,
// specifically removing Content-Encoding and the compressed Content-Length
// when the body is decompressed.
func TestFilterToCache(t *testing.T) {
	tests := []struct {
		name           string
		responseHeader http.Header
		encoding       string
		expectedHeader http.Header
	}{
		{
			name: "headers are valid",
			responseHeader: http.Header{
				"Content-Type":     {"application/json"},
				"Content-Encoding": {"gzip"},
				"Content-Length":   {"12"},
				"X-Test":           {"test"},
			},
			encoding: "gzip",
			expectedHeader: http.Header{
				"Content-Type": {"application/json"},
				"X-Test":       {"test"},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			header := k8cache.FilterHeaderForCache(tc.responseHeader, tc.encoding)
			assert.Equal(t, tc.expectedHeader, header)
		})
	}
}

// TestGetResponseBody_PlainEncoding verifies that non-gzip bodies are
// returned as-is without any decompression.
func TestGetResponseBody_PlainEncoding(t *testing.T) {
	tests := []struct {
		name         string
		body         []byte
		encoding     string
		expectedBody string
	}{
		{
			name:         "plain text body with no encoding",
			body:         []byte("hello world"),
			encoding:     "",
			expectedBody: "hello world",
		},
		{
			name:         "json body with identity encoding",
			body:         []byte(`{"kind":"PodList"}`),
			encoding:     "identity",
			expectedBody: `{"kind":"PodList"}`,
		},
		{
			name:         "empty body with no encoding",
			body:         []byte{},
			encoding:     "",
			expectedBody: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body, err := k8cache.GetResponseBody(tc.body, tc.encoding)
			assert.NoError(t, err)
			assert.Equal(t, tc.expectedBody, body)
		})
	}
}

// TestFilterHeaderForCache_NonGzip verifies that when encoding is not gzip,
// all headers (including Content-Encoding) are passed through unchanged.
func TestFilterHeaderForCache_NonGzip(t *testing.T) {
	tests := []struct {
		name           string
		responseHeader http.Header
		encoding       string
		expectedHeader http.Header
	}{
		{
			name: "non-gzip encoding keeps all headers intact",
			responseHeader: http.Header{
				"Content-Type":     {"application/json"},
				"Content-Encoding": {"identity"},
				"X-Custom-Header":  {"value1"},
			},
			encoding: "identity",
			expectedHeader: http.Header{
				"Content-Type":     {"application/json"},
				"Content-Encoding": {"identity"},
				"X-Custom-Header":  {"value1"},
			},
		},
		{
			name: "no encoding keeps all headers intact",
			responseHeader: http.Header{
				"Content-Type": {"text/plain"},
				"X-Request-Id": {"abc-123"},
			},
			encoding: "",
			expectedHeader: http.Header{
				"Content-Type": {"text/plain"},
				"X-Request-Id": {"abc-123"},
			},
		},
		{
			name:           "empty headers with no encoding",
			responseHeader: http.Header{},
			encoding:       "",
			expectedHeader: http.Header{},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := k8cache.FilterHeaderForCache(tc.responseHeader, tc.encoding)
			assert.Equal(t, tc.expectedHeader, result)
		})
	}
}

// TestEncodeResponse checks which upstream responses may be shared between users.
//
//nolint:funlen // Table-driven test covering response sharing rules.
func TestEncodeResponse(t *testing.T) {
	const (
		podList = `{"kind":"PodList","items":[]}`
		failure = `{"kind":"Status","status":"Failure"}`
	)

	tests := []struct {
		name    string
		status  int
		headers map[string]string
		body    string
		stored  bool
	}{
		{name: "ok resource", status: http.StatusOK, body: podList, stored: true},
		{
			name: "object with status block", status: http.StatusOK, stored: true,
			body: `{"kind":"Pod","status":{"phase":"Running"}}`,
		},
		{
			name: "gzip body", status: http.StatusOK, body: podList, stored: true,
			headers: map[string]string{"Content-Encoding": "gzip"},
		},
		{
			name: "vary on negotiation only", status: http.StatusOK, body: podList, stored: true,
			headers: map[string]string{"Vary": "Accept, Accept-Encoding"},
		},
		{name: "forbidden status object", status: http.StatusForbidden, body: failure},
		{name: "ok failure status object", status: http.StatusOK, body: failure},
		{
			name: "escaped failure status", status: http.StatusOK,
			body: `{"kind":"Status","status":"F\u0061ilure"}`,
		},
		{
			name: "successful status object", status: http.StatusOK, stored: true,
			body: `{"kind":"Status","status":"Success"}`,
		},
		{name: "gateway error", status: http.StatusBadGateway, body: `<html>Bad Gateway</html>`},
		{name: "not a kubernetes object", status: http.StatusOK, body: `{"items":[]}`},
		{
			name: "no-store", status: http.StatusOK, body: podList,
			headers: map[string]string{"Cache-Control": "private, no-store"},
		},
		{
			name: "set-cookie", status: http.StatusOK, body: podList,
			headers: map[string]string{"Set-Cookie": "session=1"},
		},
		{
			name: "vary on credentials", status: http.StatusOK, body: podList,
			headers: map[string]string{"Vary": "Authorization"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body := []byte(tc.body)

			if tc.headers["Content-Encoding"] == "gzip" {
				var buf bytes.Buffer

				gz := gzip.NewWriter(&buf)
				_, _ = gz.Write(body)
				_ = gz.Close()
				body = buf.Bytes()
			}

			rcw := k8cache.NewResponseCapture(httptest.NewRecorder())
			for name, value := range tc.headers {
				rcw.Header().Set(name, value)
			}

			rcw.WriteHeader(tc.status)
			_, _ = rcw.Write(body)

			encoded, err := k8cache.ExportedEncodeResponse(rcw)
			assert.NoError(t, err)

			if !tc.stored {
				assert.Empty(t, encoded)
				return
			}

			var data k8cache.CachedResponseData

			assert.NoError(t, json.Unmarshal([]byte(encoded), &data))
			assert.Equal(t, tc.body, data.Body)
			assert.NotContains(t, data.Headers, "Content-Encoding")
		})
	}
}

func TestRedactContextKey(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty context key",
			input:    "",
			expected: "",
		},
		{
			name:     "very short context key",
			input:    "dev",
			expected: "[redacted]",
		},
		{
			name:     "medium context key",
			input:    "prod",
			expected: "pro...[redacted]",
		},
		{
			name:     "long context key",
			input:    "my-production-cluster",
			expected: "my-...[redacted]",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := k8cache.ExportedRedactContextKey(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestRedactCacheKey(t *testing.T) {
	key, err := k8cache.GenerateKey(
		&url.URL{Path: "/api/v1/pods", RawQuery: "labelSelector=private-value"}, "sensitive-context",
	)
	assert.NoError(t, err)

	redacted := k8cache.ExportedRedactCacheKey(key)
	assert.NotContains(t, redacted, "sensitive-context")
	assert.NotContains(t, redacted, "private-value")
	assert.Equal(t, "[invalid cache key]", k8cache.ExportedRedactCacheKey("malformed"))
}
