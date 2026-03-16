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
				gz.Close()
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
				gz.Close()
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
			name:             "invalid url format",
			urlPath:          "/clusters/kind-kind",
			expectedAPIGroup: "",
			expectedVersion:  "",
			expectedError:    fmt.Errorf("invalid url format"),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			apiGroup, version, err := k8cache.GetAPIGroup(tc.urlPath)
			assert.Equal(t, tc.expectedAPIGroup, apiGroup)
			assert.Equal(t, tc.expectedError, err)
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
			r := httptest.NewRequest(http.MethodGet, tc.urlObj.Path, nil)
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
			r := httptest.NewRequest(http.MethodGet, tc.urlObj.Path, nil)
			newCache := NewMockCache()
			err := k8cache.StoreK8sResponseInCache(newCache, tc.urlObj, rcw, r, tc.key)
			assert.NoError(t, err)
		})
	}
}
