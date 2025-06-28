// Copyright 2025 The Kubernetes Authors.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
package k8cache_test

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

// TestInitialize verifies that responseCapture is initialized with
// the original http.ResponseWriter and an empty buffer.
func TestInitialize(t *testing.T) {
	t.Run("initializes responseCapture with defaults", func(t *testing.T) {
		recorder := httptest.NewRecorder()

		rc := k8cache.Initialize(recorder)

		assert.NotNil(t, rc)
		assert.Equal(t, http.StatusOK, rc.StatusCode)
		assert.Equal(t, recorder, rc.ResponseWriter)
		assert.NotNil(t, rc.Body)
		assert.Equal(t, 0, rc.Body.Len())
	})
}

// TestExtractNamespace verifies namespace extraction from different kinds
// of URLs, including valid, empty, and malformed ones.
func TestExtractNamespace(t *testing.T) {
	tests := []struct {
		name        string
		rawURL      string
		wantNS      string
		expectError bool
		errContains string
	}{
		{
			name:        "valid url with namespace",
			rawURL:      "http://localhost/api?namespace=default",
			wantNS:      "default",
			expectError: false,
		},
		{
			name:        "empty url",
			rawURL:      "",
			wantNS:      "",
			expectError: false,
		},
		{
			name:        "invalid url format",
			rawURL:      "://localhost/api/v1/pods",
			wantNS:      "",
			expectError: true,
			errContains: "missing protocol scheme",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ns, err := k8cache.ExtractNamespace(tc.rawURL)

			assert.Equal(t, tc.wantNS, ns)

			if tc.expectError {
				assert.Error(t, err)

				if tc.errContains != "" {
					assert.Contains(t, err.Error(), tc.errContains)
				}
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestGetResponseBody checks that the response body is correctly decoded
// based on the content encoding (e.g., gzip).
func TestGetResponseBody(t *testing.T) {
	tests := []struct {
		name            string
		original        string
		contentEncoding string
		responseBody    string
		expectedError   error
	}{
		{
			name:            "valid response",
			original:        "test-response",
			contentEncoding: "gzip",
			responseBody:    "test-response",
			expectedError:   nil,
		},
		{
			name:            "empty Response",
			original:        "",
			contentEncoding: "gzip",
			responseBody:    "",
			expectedError:   nil,
		},
		{
			name:            "empty contentType",
			original:        "",
			contentEncoding: "",
			responseBody:    "\x1f\x8b\b\x00\x00\x00\x00\x00\x00\xff\x01\x00\x00\xff\xff\x00\x00\x00\x00\x00\x00\x00\x00",
			expectedError:   nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			original := tc.original

			var buf bytes.Buffer
			gz := gzip.NewWriter(&buf)
			_, err := gz.Write([]byte(original))
			assert.NoError(t, err)
			gz.Close()

			body, err := k8cache.GetResponseBody(buf.Bytes(), tc.contentEncoding)
			assert.NoError(t, err)
			assert.Equal(t, tc.responseBody, body)
		})
	}
}

// TestGenerateKey ensures the generated key is valid for both normal
// and empty cluster name scenarios.
func TestGenerateKey(t *testing.T) {
	t.Run("url was valid ", func(t *testing.T) {
		u, _ := url.Parse("https://example.com/api/resource?namespace=myns")
		key, err := k8cache.GenerateKey(u, "mycluster", "")
		assert.NoError(t, err)
		assert.NotEmpty(t, key)
	})

	t.Run("empty cluster", func(t *testing.T) {
		u, _ := url.Parse("https://example.com/api/resource?namespace=myns")
		key, err := k8cache.GenerateKey(u, "", "")
		assert.NoError(t, err)
		assert.NotEmpty(t, key)
	})
}
