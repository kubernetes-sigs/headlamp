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
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

// TestResponseCapture_WriteHeader tests that WriteHeader sets the status code and calls the underlying ResponseWriter.
func TestResponseCapture_WriteHeader(t *testing.T) {
	rec := httptest.NewRecorder()
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           &bytes.Buffer{},
	}

	capture.WriteHeader(http.StatusTeapot)

	if capture.StatusCode != http.StatusTeapot {
		t.Errorf("expected StatusCode %d, got %d", http.StatusTeapot, capture.StatusCode)
	}

	if rec.Result().StatusCode != http.StatusTeapot {
		t.Errorf("expected recorder StatusCode %d, got %d", http.StatusTeapot, rec.Result().StatusCode)
	}
}

// TestResponseCapture_Integration tests integration with an HTTP handler.
func TestResponseCapture_Integration(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)

		if _, err := w.Write([]byte("integration test")); err != nil {
			t.Errorf("unexpected error writing response: %v", err)
		}
	})

	rec := httptest.NewRecorder()
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           &bytes.Buffer{},
	}

	handler.ServeHTTP(capture, httptest.NewRequest("GET", "/", nil))

	if capture.StatusCode != http.StatusAccepted {
		t.Errorf("expected StatusCode %d, got %d", http.StatusAccepted, capture.StatusCode)
	}

	if capture.Body.String() != "integration test" {
		t.Errorf("expected body %q, got %q", "integration test", capture.Body.String())
	}

	if rec.Result().StatusCode != http.StatusAccepted {
		t.Errorf("expected recorder StatusCode %d, got %d", http.StatusAccepted, rec.Result().StatusCode)
	}

	if rec.Body.String() != "integration test" {
		t.Errorf("expected recorder body %q, got %q", "integration test", rec.Body.String())
	}
}

type errorWriter struct {
	http.ResponseWriter
}

func (e *errorWriter) Write(p []byte) (int, error) {
	return 0, errors.New("simulated write error")
}

func TestResponseCapture_Write_Error(t *testing.T) {
	rec := httptest.NewRecorder()
	ew := &errorWriter{ResponseWriter: rec}

	capture := &k8cache.ResponseCapture{
		ResponseWriter: ew,
		Body:           &bytes.Buffer{}, // still a *bytes.Buffer
	}

	n, err := capture.Write([]byte("fail"))
	if err == nil {
		t.Errorf("expected error from ResponseWriter.Write, got nil")
	}

	if n != 0 {
		t.Errorf("expected written length 0, got %d", n)
	}
}

// Update the existing TestResponseCapture_Write to ensure no error is returned.
func TestResponseCapture_Write(t *testing.T) {
	rec := httptest.NewRecorder()
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           &bytes.Buffer{},
	}

	data := []byte("hello world")

	n, err := capture.Write(data)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if n != len(data) {
		t.Errorf("expected written length %d, got %d", len(data), n)
	}

	if capture.Body.String() != "hello world" {
		t.Errorf("expected body %q, got %q", "hello world", capture.Body.String())
	}

	if rec.Body.String() != "hello world" {
		t.Errorf("expected recorder body %q, got %q", "hello world", rec.Body.String())
	}
}

// TestResponseCapture_Write_BodySuccess tests that ResponseCapture.Write writes to
// Body and ResponseWriter when Body.Write succeeds.
func TestResponseCapture_Write_BodySuccess(t *testing.T) {
	rec := httptest.NewRecorder()
	buf := &bytes.Buffer{}
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           buf,
	}

	data := []byte("body success")

	n, err := capture.Write(data)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if n != len(data) {
		t.Errorf("expected written length %d, got %d", len(data), n)
	}

	if buf.String() != "body success" {
		t.Errorf("expected body %q, got %q", "body success", buf.String())
	}

	if rec.Body.String() != "body success" {
		t.Errorf("expected recorder body %q, got %q", "body success", rec.Body.String())
	}
}

// TestInitialize verifies that responseCapture is initialized with
// the original http.ResponseWriter and an empty buffer.
func TestInitialize(t *testing.T) {
	t.Run("initializes responseCapture with defaults", func(t *testing.T) {
		recorder := httptest.NewRecorder()

		rc := k8cache.CreateResponseCapture(recorder)

		assert.NotNil(t, rc)
		assert.Equal(t, http.StatusOK, rc.StatusCode)
		assert.Equal(t, recorder, rc.ResponseWriter)
		assert.NotNil(t, rc.Body)
		assert.Equal(t, 0, rc.Body.Len())
	})
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

// TestGetAPIGroup tests whether the GetAPIGroup returning correct
// apiGroup and version from the URL.
func TestGetAPIGroup(t *testing.T) {
	tests := []struct {
		name             string
		urlPath          *url.URL
		expectedAPIGroup string
		expectedVersion  string
	}{
		{
			name:             "return non-empty apiGroup and version",
			urlPath:          &url.URL{Path: "/clusters/kind-kind/apis/metrics.k8s.io/v1beta1/pods"},
			expectedAPIGroup: "metrics.k8s.io",
			expectedVersion:  "v1beta1",
		},
		{
			name:             "return empty apiGroup",
			urlPath:          &url.URL{Path: "/clusters/kind-kind/api/v1/pods"},
			expectedAPIGroup: "",
			expectedVersion:  "v1",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			apiGroup, version := k8cache.GetAPIGroup(tc.urlPath.Path)
			assert.Equal(t, tc.expectedAPIGroup, apiGroup)
			assert.Equal(t, tc.expectedVersion, version)
		})
	}
}

// TestExtractNamespace verifies namespace extraction from different kinds
// of URLs, including valid, empty, and malformed ones.
func TestExtractNamespace(t *testing.T) {
	tests := []struct {
		name       string
		urlPath    url.URL
		namespaces string
		kind       string
	}{
		{
			name:       "return empty namespaces",
			urlPath:    url.URL{Path: "/clusters/kind-kind/api/v1/pods"},
			namespaces: "",
			kind:       "pods",
		},
		{
			name:       "return namespace and kind",
			urlPath:    url.URL{Path: "/clusters/kind-kind/api/v1/namespaces/test-namespace/pods"},
			namespaces: "test-namespace",
			kind:       "pods",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			namespace, kind := k8cache.ExtractNamespace(tc.urlPath.Path)
			assert.Equal(t, tc.namespaces, namespace)
			assert.Equal(t, tc.kind, kind)
		})
	}
}

// TestGenerateKey ensures the generated key is valid for both normal
// and empty cluster name scenarios.
func TestGenerateKey(t *testing.T) {
	tests := []struct {
		name        string
		urlPath     url.URL
		contextKey  string
		expectedKey string
	}{
		{
			name:        "key with non-empty apiGroup, kind , namespace, contextId",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io/v1beta1/namespaces/test-kube/pods"},
			contextKey:  "kind-kind",
			expectedKey: "k8s.metrics.io+pods+test-kube+kind-kind",
		},
		{
			name:        "key with empty apiGroup",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/v1/namespaces/test-kube/pods"},
			contextKey:  "kind-kind",
			expectedKey: "+pods+test-kube+kind-kind",
		},
		{
			name:        "key with empty apiGroup and namespace",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/v1/pods"},
			contextKey:  "kind-kind",
			expectedKey: "+pods++kind-kind",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			key, _ := k8cache.GenerateKey(&tc.urlPath, tc.contextKey)
			assert.Equal(t, tc.expectedKey, key)
		})
	}
}

// TestUnMarshallCacheData tests whether the resource Data unserialized correctly.
// It contains different test cases where the inputs empty , valid and invalid.
func TestUnMarshallCacheData(t *testing.T) {
	tests := []struct {
		name                   string
		cacheResource          string
		cacheData              k8cache.CachedResponseData
		expectedCachedResponse k8cache.CachedResponseData
		expectedError          error
	}{
		{
			name:          "cache Resource is valid",
			cacheResource: `{"key": "1234" , "body":"testing-data"}`,
			cacheData:     k8cache.CachedResponseData{},
			expectedCachedResponse: k8cache.CachedResponseData{
				Body: "testing-data",
			},
			expectedError: nil,
		},
		{
			name:                   "cache Resource input is valid but cacheResponse is empty",
			cacheResource:          `{"key" :"1234" , "value": "testing-data"}`,
			cacheData:              k8cache.CachedResponseData{},
			expectedCachedResponse: k8cache.CachedResponseData{},
			expectedError:          nil,
		},
		{
			name:                   "cache Resource is invalid",
			cacheResource:          "testing-string",
			cacheData:              k8cache.CachedResponseData{},
			expectedCachedResponse: k8cache.CachedResponseData{},
			expectedError:          errors.New("invalid character 'e' in literal true (expecting 'r')"),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result, err := k8cache.UnmarshalCacheData(tc.cacheResource)
			assert.Equal(t, tc.expectedCachedResponse, result)

			if err != nil {
				assert.ErrorContains(t, err, tc.expectedError.Error())
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestSetHeader tests whether the SetHeader is providing correct metadata for
// the given cacheData that will going to be served to the client.
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
