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
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

// MockCache is struct which help to mock caching for testing purpose.
type MockCache struct {
	mu    sync.RWMutex
	store map[string]string
	err   error
}

// NewMockCache Helps to initialize cache struct for tests.
func NewMockCache() *MockCache {
	return &MockCache{
		store: make(map[string]string),
	}
}

// Set mocks storing of value with its corresponding key string.
func (m *MockCache) Set(ctx context.Context, key, value string) error {
	if m.err != nil {
		return m.err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.store[key] = value

	return nil
}

// SetWithTTL Mocks storing of value with its corresponding key string with time-to-live.
func (m *MockCache) SetWithTTL(ctx context.Context, key, value string, ttl time.Duration) error {
	return m.Set(ctx, key, value)
}

// Delete Mocks deleting value with the help of key string.
func (m *MockCache) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.store, key)

	return nil
}

// Get Mocks retrieval of value with its corresponding key string.
func (m *MockCache) Get(ctx context.Context, key string) (string, error) {
	if m.err != nil {
		return "", m.err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	val, ok := m.store[key]

	if !ok {
		return "", errors.New("not found")
	}

	return val, nil
}

// GetAll Mocks retrieving all the values inside the cache.
func (m *MockCache) GetAll(ctx context.Context, selectFunc cache.Matcher) (map[string]string, error) {
	return nil, nil
}

// UpdateTTL Mocks updating of time-to-live with the help of its corresponding key string.
func (m *MockCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	return nil
}

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

// TestGetAPIGroup tests whether the GetAPIGroup returning correct
// apiGroup and version from the URL.
//
//nolint:funlen
func TestGetAPIGroup(t *testing.T) {
	tests := []struct {
		name             string
		urlPath          string
		expectedAPIGroup string
		expectedVersion  string
		expectedError    error
	}{
		{
			name:             "return non-empty apiGroup and version",
			urlPath:          "/clusters/kind-kind/apis/metrics.k8s.io/v1beta1/pods",
			expectedAPIGroup: "metrics.k8s.io",
			expectedVersion:  "v1beta1",
			expectedError:    nil,
		},
		{
			name:             "return empty apiGroup",
			urlPath:          "/clusters/kind-kind/api/v1/pods",
			expectedAPIGroup: "",
			expectedVersion:  "v1",
			expectedError:    nil,
		},
		{
			name:             "core discovery path with trailing slash",
			urlPath:          "/clusters/kind-kind/api/",
			expectedAPIGroup: "",
			expectedVersion:  "",
			expectedError:    nil,
		},
		{
			name:             "api group discovery root without group",
			urlPath:          "/clusters/kind-kind/apis",
			expectedAPIGroup: "",
			expectedVersion:  "",
			expectedError:    nil,
		},
		{
			name:             "api group discovery path with trailing slash",
			urlPath:          "/clusters/kind-kind/apis/metrics.k8s.io/",
			expectedAPIGroup: "metrics.k8s.io",
			expectedVersion:  "",
			expectedError:    nil,
		},
		{
			name:             "invalid url format",
			urlPath:          "/clusters/kind-kind",
			expectedAPIGroup: "",
			expectedVersion:  "",
			expectedError:    fmt.Errorf("invalid url format"),
		},
		{
			name:             "short url path api",
			urlPath:          "/clusters/kind-kind/api",
			expectedAPIGroup: "",
			expectedVersion:  "",
			expectedError:    nil,
		},
		{
			name:             "short url path apis",
			urlPath:          "/clusters/kind-kind/apis/metrics.k8s.io",
			expectedAPIGroup: "metrics.k8s.io",
			expectedVersion:  "",
			expectedError:    nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			apiGroup, version, err := k8cache.GetAPIGroup(tc.urlPath)
			assert.Equal(t, tc.expectedAPIGroup, apiGroup)

			if tc.expectedError != nil {
				assert.EqualError(t, err, tc.expectedError.Error())
			} else {
				assert.NoError(t, err)
			}

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
		{
			name:       "two namespaces in the url",
			urlPath:    url.URL{Path: "/api/v1/namespaces/foo/services/namespaces/bar/pods"},
			namespaces: "foo",
			kind:       "pods",
		},
		{
			name:       "cluster-scoped resource with query string",
			urlPath:    url.URL{Path: "/api/v1/pods?label=app=nginx"},
			namespaces: "",
			kind:       "pods",
		},
		{
			name:       "malformed path with only namespaces",
			urlPath:    url.URL{Path: "/api/v1/namespaces"},
			namespaces: "",
			kind:       "namespaces",
		},
		{
			name:       "valid namespaced resource with trailing slash",
			urlPath:    url.URL{Path: "/api/v1/namespaces/dev/services/"},
			namespaces: "dev",
			kind:       "services",
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
//
//nolint:funlen
func TestGenerateKey(t *testing.T) {
	tests := []struct {
		name        string
		urlPath     url.URL
		contextKey  string
		expectedKey string
		expectedErr error
	}{
		{
			name:        "key with non-empty apiGroup, kind, namespace, contextId",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io/v1beta1/namespaces/test-kube/pods"},
			contextKey:  "kind-kind",
			expectedKey: "k8s.metrics.io+pods+test-kube+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key with empty apiGroup",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/v1/namespaces/test-kube/pods"},
			contextKey:  "kind-kind",
			expectedKey: "+pods+test-kube+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key with empty apiGroup and namespace",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/v1/pods"},
			contextKey:  "kind-kind",
			expectedKey: "+pods++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for core discovery path without version",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api"},
			contextKey:  "kind-kind",
			expectedKey: "+api++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for core discovery path with trailing slash",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/"},
			contextKey:  "kind-kind",
			expectedKey: "+api++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for api group discovery root",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis"},
			contextKey:  "kind-kind",
			expectedKey: "+apis++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for api group discovery path without version",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io"},
			contextKey:  "kind-kind",
			expectedKey: "k8s.metrics.io+k8s.metrics.io++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for api group discovery path with trailing slash",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io/"},
			contextKey:  "kind-kind",
			expectedKey: "k8s.metrics.io+k8s.metrics.io++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "invalid url format",
			urlPath:     url.URL{Path: "/clusters/kind-kind"},
			contextKey:  "kind-kind",
			expectedKey: "",
			expectedErr: errors.New("invalid url format"),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			key, err := k8cache.GenerateKey(&tc.urlPath, tc.contextKey)

			if tc.expectedErr != nil {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tc.expectedErr.Error())
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tc.expectedKey, key)
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

// TestFilterToCache verifies that headers are correctly filtered before caching,
// specifically removing Content-Encoding when the body is decompressed.
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

// TestLoadFromCache tests whether the cache data is being served to the
// client correctly.
func TestLoadFromCache(t *testing.T) {
	tests := []struct {
		name          string
		key           string
		isLoaded      bool
		value         string
		urlObj        *url.URL
		expectedError error
	}{
		{
			name:          "Served from cache",
			key:           "test-key",
			value:         `{"Body":"from_cache","StatusCode":200}`,
			urlObj:        &url.URL{Path: "/api/v1/pods"},
			isLoaded:      true,
			expectedError: nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockCache := NewMockCache()
			err := mockCache.SetWithTTL(context.Background(), tc.key, tc.value, 0)
			assert.NoError(t, err)

			w := httptest.NewRecorder()
			r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.urlObj.Path, nil)
			isLoaded, err := k8cache.LoadFromCache(mockCache, tc.isLoaded, tc.key, w, r)
			assert.Equal(t, tc.isLoaded, isLoaded)
			assert.NoError(t, err)
		})
	}
}

// TestStoreK8sResponseInCache tests whether the cache storing the response data.
func TestStoreK8sResponseInCache(t *testing.T) {
	tests := []struct {
		name          string
		urlObj        *url.URL
		key           string
		expectedError error
	}{
		{
			name:          "valid workflow",
			urlObj:        &url.URL{Path: "/api/v1/pods"},
			key:           "1234",
			expectedError: nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rw := httptest.NewRecorder()
			rcw := k8cache.NewResponseCapture(rw)
			r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.urlObj.Path, nil)
			newCache := NewMockCache()
			err := k8cache.StoreK8sResponseInCache(newCache, tc.urlObj, rcw, r, tc.key)
			assert.NoError(t, err)
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

// TestLoadFromCache_Misses covers cache-miss and permission-denied paths
// that are absent from the existing tests.
func TestLoadFromCache_Misses(t *testing.T) {
	tests := []struct {
		name         string
		seedKey      string
		seedValue    string
		lookupKey    string
		isAllowed    bool
		expectLoaded bool
	}{
		{
			name:         "cache miss returns false with no error",
			seedKey:      "other-key",
			seedValue:    `{"Body":"data","StatusCode":200}`,
			lookupKey:    "missing-key",
			isAllowed:    true,
			expectLoaded: false,
		},
		{
			name:         "cache hit but isAllowed=false returns false",
			seedKey:      "my-key",
			seedValue:    `{"Body":"secret","StatusCode":200}`,
			lookupKey:    "my-key",
			isAllowed:    false,
			expectLoaded: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockCache := NewMockCache()
			err := mockCache.Set(context.Background(), tc.seedKey, tc.seedValue)
			assert.NoError(t, err)

			w := httptest.NewRecorder()
			r := httptest.NewRequestWithContext(
				context.Background(), http.MethodGet, "/api/v1/pods", nil,
			)

			loaded, err := k8cache.LoadFromCache(mockCache, tc.isAllowed, tc.lookupKey, w, r)
			assert.Equal(t, tc.expectLoaded, loaded)
			assert.NoError(t, err)
		})
	}
}

func TestLoadFromCache_MissesEdgeCases(t *testing.T) {
	tests := []struct {
		name         string
		seedKey      string
		seedValue    string
		lookupKey    string
		expectLoaded bool
		expectError  bool
	}{
		{
			name:         "cache hit with whitespace-only body returns false",
			seedKey:      "blank-key",
			seedValue:    "   ",
			lookupKey:    "blank-key",
			expectLoaded: false,
			expectError:  false,
		},
		{
			name:         "cache hit with invalid JSON returns error",
			seedKey:      "bad-json",
			seedValue:    `not-valid-json`,
			lookupKey:    "bad-json",
			expectLoaded: false,
			expectError:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockCache := NewMockCache()
			err := mockCache.Set(context.Background(), tc.seedKey, tc.seedValue)
			assert.NoError(t, err)

			w := httptest.NewRecorder()
			r := httptest.NewRequestWithContext(
				context.Background(), http.MethodGet, "/api/v1/pods", nil,
			)

			loaded, err := k8cache.LoadFromCache(mockCache, true, tc.lookupKey, w, r)
			assert.Equal(t, tc.expectLoaded, loaded)

			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestStoreK8sResponseInCache_SkipSelfSubjectRulesReview verifies that
// responses for selfsubjectrulesreviews are never written to the cache.
func TestStoreK8sResponseInCache_SkipSelfSubjectRulesReview(t *testing.T) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/api/v1/selfsubjectrulesreviews"}

	rw := httptest.NewRecorder()
	rcw := k8cache.NewResponseCapture(rw)

	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, targetURL.Path, nil,
	)

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, r, "skip-key")
	assert.NoError(t, err)

	// Key must NOT have been written to the cache.
	_, getErr := mockCache.Get(context.Background(), "skip-key")
	assert.Error(t, getErr, "selfsubjectrulesreviews response should never be cached")
}

// TestStoreK8sResponseInCache_GzipBody verifies that a gzip-compressed
// response body is correctly decompressed before being stored.
func TestStoreK8sResponseInCache_GzipBody(t *testing.T) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/api/v1/pods"}

	rw := httptest.NewRecorder()
	rcw := k8cache.NewResponseCapture(rw)

	// Write a gzip-compressed body into the capture writer.
	var buf bytes.Buffer

	gz := gzip.NewWriter(&buf)
	_, _ = gz.Write([]byte(`{"kind":"PodList","items":[]}`))
	_ = gz.Close()

	rcw.Header().Set("Content-Encoding", "gzip")
	rcw.WriteHeader(http.StatusOK)
	_, _ = rcw.Write(buf.Bytes())

	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, targetURL.Path, nil,
	)

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, r, "gzip-key")
	assert.NoError(t, err)

	// The stored value must exist and must NOT contain the Content-Encoding header.
	stored, getErr := mockCache.Get(context.Background(), "gzip-key")
	assert.NoError(t, getErr)
	assert.NotEmpty(t, stored)
	assert.NotContains(t, stored, "Content-Encoding")
}

// TestStoreK8sResponseInCache_FailureBodyNotCached ensures responses
// whose JSON body contains "Failure" (e.g. k8s error objects) are
// not written to cache.
func TestStoreK8sResponseInCache_FailureBodyNotCached(t *testing.T) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/api/v1/pods"}

	rw := httptest.NewRecorder()
	rcw := k8cache.NewResponseCapture(rw)

	failureBody := `{"kind":"Status","status":"Failure","message":"Forbidden"}`

	rcw.WriteHeader(http.StatusForbidden)
	_, _ = rcw.Write([]byte(failureBody))

	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, targetURL.Path, nil,
	)

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, r, "failure-key")
	assert.NoError(t, err)

	// Key must NOT have been written to the cache.
	_, getErr := mockCache.Get(context.Background(), "failure-key")
	assert.Error(t, getErr, "Failure responses should never be cached")
}

// TestExtractNamespace_QueryStringOnNamespacedURL verifies that query
// parameters are stripped correctly even when a namespace is present.
func TestExtractNamespace_QueryStringOnNamespacedURL(t *testing.T) {
	tests := []struct {
		name              string
		rawURL            string
		expectedNamespace string
		expectedKind      string
	}{
		{
			name:              "namespaced resource with query string",
			rawURL:            "/api/v1/namespaces/prod/pods?labelSelector=app%3Dnginx",
			expectedNamespace: "prod",
			expectedKind:      "pods",
		},
		{
			name:              "cluster-scoped resource with multiple query params",
			rawURL:            "/api/v1/nodes?limit=500&continue=token123",
			expectedNamespace: "",
			expectedKind:      "nodes",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			namespace, kind := k8cache.ExtractNamespace(tc.rawURL)
			assert.Equal(t, tc.expectedNamespace, namespace)
			assert.Equal(t, tc.expectedKind, kind)
		})
	}
}
