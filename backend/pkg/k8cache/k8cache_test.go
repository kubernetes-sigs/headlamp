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
	"context"
	"errors"
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

// Helps to initialize cache struct for tests.
func NewMockCache() *MockCache {
	return &MockCache{
		store: make(map[string]string),
	}
}

// Mocks storing of value with its corresponding key string.
func (m *MockCache) Set(ctx context.Context, key, value string) error {
	if m.err != nil {
		return m.err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.store[key] = value

	return nil
}

// Mocks storing of value with its corresponding key string with time-to-live.
func (m *MockCache) SetWithTTL(ctx context.Context, key, value string, ttl time.Duration) error {
	return m.Set(ctx, key, value)
}

// Mocks deleting value with the help of key string.
func (m *MockCache) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.store, key)

	return nil
}

// Mocks retrieval of value with its corresponding key string.
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

// Mocks retrieving all the values inside the cache.
func (m *MockCache) GetAll(ctx context.Context, selectFunc cache.Matcher) (map[string]string, error) {
	return nil, nil
}

// Mocks updating of time-to-live with the helo of its corresponding key string.
func (m *MockCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	return nil
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
			result, err := k8cache.UnmarshalCacheData(tc.cacheResource, tc.cacheData)
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

// TestMarshallToStore tests whether the MarshallToStore
// serialized correctly that will be stored into the cache.
func TestMarshallToStore(t *testing.T) {
	tests := []struct {
		name          string
		cacheData     k8cache.CachedResponseData
		expectedData  string
		expectedError error
	}{
		{
			name: "cache data is valid",
			cacheData: k8cache.CachedResponseData{
				StatusCode: 200,
				Headers: http.Header{
					"Context-Type": {"application/json"},
					"X-Test":       {"true"},
				},
				Body: "test-body",
			},
			expectedData: `{"statusCode":200,"headers":{"Context-Type":["application/json"],"X-Test":["true"]},` +
				`"body":"test-body"}`,

			expectedError: nil,
		},

		{
			name:          "cache data is invalid",
			cacheData:     k8cache.CachedResponseData{},
			expectedData:  "{\"statusCode\":0,\"headers\":null,\"body\":\"\"}",
			expectedError: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			data, err := k8cache.MarshalToStore(tc.cacheData)
			assert.Equal(t, tc.expectedData, string(data))
			assert.NoError(t, err)
		})
	}
}

// TestSetHeaderToCache test whether the extracted header while capturing
// adding up headers that will going to store in the cache with their corresponding
// response body.
func TestSetHeaderToCache(t *testing.T) {
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
			header := k8cache.FilterHeadersForCache(tc.responseHeader, tc.encoding)
			assert.Equal(t, tc.expectedHeader, header)
		})
	}
}

// TestGenerateKey ensures the generated key is valid for both normal
// and empty cluster name scenarios.
func TestGenerateKey(t *testing.T) {
	t.Run("url was valid ", func(t *testing.T) {
		u, _ := url.Parse("https://example.com/api/resource?namespace=myns")
		key, err := k8cache.GenerateKey(u, "mycluster")
		assert.NoError(t, err)
		assert.NotEmpty(t, key)
	})

	t.Run("empty cluster", func(t *testing.T) {
		u, _ := url.Parse("https://example.com/api/resource?namespace=myns")
		key, err := k8cache.GenerateKey(u, "")
		assert.NoError(t, err)
		assert.NotEmpty(t, key)
	})
}

// TestLoadFromCache tests whether the cache data is being served to the
// client correctly.
func TestLoadfromCache(t *testing.T) {
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

// TestRequestToCache tests whether the cache storing the response data.
func TestRequestToK8AndStore(t *testing.T) {
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
			rcw := k8cache.CreateResponseCapture(rw)
			r := httptest.NewRequest(http.MethodGet, tc.urlObj.Path, nil)
			newCache := NewMockCache()
			err := k8cache.RequestK8ClusterAPIAndStore(newCache, tc.urlObj, rcw, r, tc.key)
			assert.NoError(t, err)
		})
	}
}
