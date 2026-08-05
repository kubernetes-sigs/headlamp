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
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// MockCache is struct which help to mock caching for testing purpose.
type MockCache struct {
	mu    sync.RWMutex
	store map[string]string
	ttls  map[string]time.Duration
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
	if err := m.Set(ctx, key, value); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ttls == nil {
		m.ttls = make(map[string]time.Duration)
	}

	m.ttls[key] = ttl

	return nil
}

// TTL reports the time-to-live the last SetWithTTL stored key with.
func (m *MockCache) TTL(key string) time.Duration {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.ttls[key]
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

// GetAll Mocks retrieving all the values inside the cache that match selectFunc.
func (m *MockCache) GetAll(ctx context.Context, selectFunc cache.Matcher) (map[string]string, error) {
	if m.err != nil {
		return nil, m.err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	values := make(map[string]string)

	for key, value := range m.store {
		if selectFunc != nil && !selectFunc(key) {
			continue
		}

		values[key] = value
	}

	return values, nil
}

// UpdateTTL Mocks updating of time-to-live with the help of its corresponding key string.
func (m *MockCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	return nil
}

// SetOnEvicted Mocks setting a callback function to be called when an item is evicted.
func (m *MockCache) SetOnEvicted(f func(key string, value string)) {
}

// Close mocks closing the cache.
func (m *MockCache) Close() error {
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
			name:             "return empty apiGroup from direct API path",
			urlPath:          "/api/v1/pods",
			expectedAPIGroup: "",
			expectedVersion:  "v1",
			expectedError:    nil,
		},
		{
			name:             "return non-empty apiGroup from direct API path",
			urlPath:          "/apis/apps/v1/deployments",
			expectedAPIGroup: "apps",
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

// TestGenerateKey ensures the generated key carries the expected
// apiGroup+resource+namespace+context prefix for both normal and empty cluster name scenarios.
//
//nolint:funlen
func TestGenerateKey(t *testing.T) {
	tests := []struct {
		name           string
		urlPath        url.URL
		contextKey     string
		expectedPrefix string
		expectedErr    error
	}{
		{
			name:           "key with non-empty apiGroup, kind, namespace, contextId",
			urlPath:        url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io/v1beta1/namespaces/test-kube/pods"},
			contextKey:     "kind-kind",
			expectedPrefix: "k8s.metrics.io+pods+test-kube+kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key with empty apiGroup",
			urlPath:        url.URL{Path: "/clusters/kind-kind/api/v1/namespaces/test-kube/pods"},
			contextKey:     "kind-kind",
			expectedPrefix: "+pods+test-kube+kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key with direct api path",
			urlPath:        url.URL{Path: "/api/v1/namespaces/test-kube/pods"},
			contextKey:     "kind-kind",
			expectedPrefix: "+pods+test-kube+kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key with empty apiGroup and namespace",
			urlPath:        url.URL{Path: "/clusters/kind-kind/api/v1/pods"},
			contextKey:     "kind-kind",
			expectedPrefix: "+pods++kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key for core discovery path without version",
			urlPath:        url.URL{Path: "/clusters/kind-kind/api"},
			contextKey:     "kind-kind",
			expectedPrefix: "+api++kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key for core discovery path with trailing slash",
			urlPath:        url.URL{Path: "/clusters/kind-kind/api/"},
			contextKey:     "kind-kind",
			expectedPrefix: "+api++kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key for api group discovery root",
			urlPath:        url.URL{Path: "/clusters/kind-kind/apis"},
			contextKey:     "kind-kind",
			expectedPrefix: "+apis++kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key for api group discovery path without version",
			urlPath:        url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io"},
			contextKey:     "kind-kind",
			expectedPrefix: "k8s.metrics.io+k8s.metrics.io++kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "key for api group discovery path with trailing slash",
			urlPath:        url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io/"},
			contextKey:     "kind-kind",
			expectedPrefix: "k8s.metrics.io+k8s.metrics.io++kind-kind+",
			expectedErr:    nil,
		},
		{
			name:           "invalid url format",
			urlPath:        url.URL{Path: "/clusters/kind-kind"},
			contextKey:     "kind-kind",
			expectedPrefix: "",
			expectedErr:    errors.New("invalid url format"),
		},
		{
			name:           "context key containing a literal plus is escaped, not treated as delimiter",
			urlPath:        url.URL{Path: "/clusters/kind-kind/apis/apps/v1/namespaces/default/deployments"},
			contextKey:     "prod+cluster",
			expectedPrefix: "apps+deployments+default+prod%2Bcluster+",
			expectedErr:    nil,
		},
		{
			// Regression: ensures the escape is injective. If "%" weren't
			// escaped first, this input would collide with "prod+cluster"
			// above and both would produce the same cache key.
			name:           "context key containing a literal percent sequence does not collide with the plus-escaped form",
			urlPath:        url.URL{Path: "/clusters/kind-kind/apis/apps/v1/namespaces/default/deployments"},
			contextKey:     "prod%2Bcluster",
			expectedPrefix: "apps+deployments+default+prod%252Bcluster+",
			expectedErr:    nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			key, err := k8cache.GenerateKey(&tc.urlPath, tc.contextKey)

			if tc.expectedErr != nil {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tc.expectedErr.Error())

				return
			}

			assert.NoError(t, err)

			variant, found := strings.CutPrefix(key, tc.expectedPrefix+"+")
			assert.True(t, found, "key %q does not carry prefix %q", key, tc.expectedPrefix)
			assert.Regexp(t, "^[0-9a-f]{64}$", variant)
		})
	}
}

// TestCachedResponseIsNotServedToADifferentRequest drives the store and serve paths the
// middleware uses, so a colliding key would surface as one request being answered with
// another's cached body.
func TestCachedResponseIsNotServedToADifferentRequest(t *testing.T) {
	const secretBody = `{"kind":"Secret","data":{"password":"aHVudGVyMg=="}}`

	ctx := context.Background()
	k8scache := NewMockCache()

	store := func(rawURL, body string) string {
		parsed, err := url.Parse(rawURL)
		assert.NoError(t, err)

		key, err := k8cache.GenerateKey(parsed, "prod")
		assert.NoError(t, err)

		rcw := k8cache.NewResponseCapture(httptest.NewRecorder())
		rcw.WriteHeader(http.StatusOK)
		_, err = rcw.Write([]byte(body))
		assert.NoError(t, err)
		assert.NoError(t, k8cache.StoreK8sResponseInCache(k8scache, parsed, rcw, key))

		return key
	}

	// isAllowed is true throughout: the point is that authorization passes for the
	// requesting user and the cache still must not hand back another resource.
	load := func(rawURL string) (bool, string) {
		req := httptest.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)

		key, err := k8cache.GenerateKey(req.URL, "prod")
		assert.NoError(t, err)

		w := httptest.NewRecorder()
		served, err := k8cache.LoadFromCache(k8scache, true, key, w, req)
		assert.NoError(t, err)

		return served, w.Body.String()
	}

	store("/clusters/c/api/v1/namespaces/default/secrets/nginx", secretBody)

	served, body := load("/clusters/c/api/v1/namespaces/default/configmaps/nginx")
	assert.False(t, served, "configmap request was served the cached Secret: %s", body)

	served, body = load("/clusters/c/api/v1/namespaces/default/secrets/nginx")
	assert.True(t, served, "repeating the same request should hit the cache")
	assert.Equal(t, secretBody, body)

	store("/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo", `{"items":["foo-pod"]}`)

	served, body = load("/clusters/c/api/v1/namespaces/default/pods")
	assert.False(t, served, "unfiltered list was served the filtered response: %s", body)

	served, body = load("/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dbar")
	assert.False(t, served, "app=bar was served the app=foo response: %s", body)

	served, _ = load("/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo")
	assert.True(t, served, "repeating the same filtered request should hit the cache")
}

// TestNewCacheableRequest covers the requests that must never reach the response cache:
// watch streams, subresources, self-subject reviews, and non-API paths.
//
//nolint:funlen
func TestNewCacheableRequest(t *testing.T) {
	tests := []struct {
		name         string
		rawURL       string
		expectBypass bool
	}{
		{
			name:         "namespaced list is cacheable",
			rawURL:       "/clusters/c/api/v1/namespaces/default/pods",
			expectBypass: false,
		},
		{
			name:         "filtered list is cacheable",
			rawURL:       "/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo",
			expectBypass: false,
		},
		{
			name:         "named GET is cacheable",
			rawURL:       "/clusters/c/api/v1/namespaces/default/pods/mypod",
			expectBypass: false,
		},
		{
			name:         "discovery path is cacheable",
			rawURL:       "/clusters/c/apis/metrics.k8s.io",
			expectBypass: false,
		},
		{
			name:         "watch request is bypassed",
			rawURL:       "/clusters/c/api/v1/namespaces/default/pods?watch=true",
			expectBypass: true,
		},
		{
			name:         "watch request using 1 is bypassed",
			rawURL:       "/clusters/c/api/v1/namespaces/default/pods?watch=1",
			expectBypass: true,
		},
		{
			name:         "pod log subresource is bypassed",
			rawURL:       "/clusters/c/api/v1/namespaces/default/pods/mypod/log",
			expectBypass: true,
		},
		{
			name:         "scale subresource is bypassed",
			rawURL:       "/clusters/c/apis/apps/v1/namespaces/default/deployments/web/scale",
			expectBypass: true,
		},
		{
			name:         "self subject access review is bypassed",
			rawURL:       "/clusters/c/apis/authorization.k8s.io/v1/selfsubjectaccessreviews",
			expectBypass: true,
		},
		{
			name:         "non-API path is bypassed",
			rawURL:       "/clusters/c/version",
			expectBypass: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.rawURL, nil)
			cacheable, ok := k8cache.NewCacheableRequest(req)
			assert.Equal(t, tc.expectBypass, !ok)

			if ok {
				key, err := k8cache.GenerateKey(req.URL, "ctx")
				require.NoError(t, err)
				assert.Equal(t, key, cacheable.Key("ctx"), "both key paths must agree")
			}
		})
	}
}

// TestGenerateKeyVariantSeparatesCollidingRequests checks that requests sharing every
// apiGroup+resource+namespace+context segment still get distinct keys.
//
//nolint:funlen
func TestGenerateKeyVariantSeparatesCollidingRequests(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
	}{
		{
			name: "named GET of different resource types sharing a name",
			a:    "/clusters/c/api/v1/namespaces/default/secrets/nginx",
			b:    "/clusters/c/api/v1/namespaces/default/configmaps/nginx",
		},
		{
			name: "named GET of a service and a pod sharing a name",
			a:    "/clusters/c/api/v1/namespaces/default/services/nginx",
			b:    "/clusters/c/api/v1/namespaces/default/pods/nginx",
		},
		{
			name: "same subresource of two different pods",
			a:    "/clusters/c/api/v1/namespaces/default/pods/podA/log",
			b:    "/clusters/c/api/v1/namespaces/default/pods/podB/log",
		},
		{
			name: "list of a multi-version resource under two versions",
			a:    "/clusters/c/apis/example.io/v1alpha1/namespaces/default/widgets",
			b:    "/clusters/c/apis/example.io/v1/namespaces/default/widgets",
		},
		{
			name: "named GET of a multi-version resource under two versions",
			a:    "/clusters/c/apis/example.io/v1alpha1/namespaces/default/widgets/w1",
			b:    "/clusters/c/apis/example.io/v1/namespaces/default/widgets/w1",
		},
		{
			name: "core and named discovery roots requested directly",
			a:    "/api",
			b:    "/apis",
		},
		{
			name: "core resource under two versions",
			a:    "/clusters/c/api/v1/namespaces/default/pods",
			b:    "/clusters/c/api/v2/namespaces/default/pods",
		},
		{
			name: "list filtered by different label selectors",
			a:    "/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo",
			b:    "/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dbar",
		},
		{
			name: "filtered list and unfiltered list",
			a:    "/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo",
			b:    "/clusters/c/api/v1/namespaces/default/pods",
		},
		{
			name: "paginated list and unpaginated list",
			a:    "/clusters/c/api/v1/namespaces/default/pods?limit=1",
			b:    "/clusters/c/api/v1/namespaces/default/pods",
		},
		{
			name: "list filtered by different field selectors",
			a:    "/clusters/c/api/v1/namespaces/default/pods?fieldSelector=status.phase%3DRunning",
			b:    "/clusters/c/api/v1/namespaces/default/pods?fieldSelector=status.phase%3DPending",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			keyA, err := generateKeyForRawURL(t, tc.a)
			assert.NoError(t, err)

			keyB, err := generateKeyForRawURL(t, tc.b)
			assert.NoError(t, err)

			assert.NotEqual(t, keyA, keyB, "%s and %s must not share a cache key", tc.a, tc.b)
		})
	}
}

// TestGenerateKeyIsStableAndRouteIndependent ensures the variant does not split the
// cache on incidental request differences.
func TestGenerateKeyIsStableAndRouteIndependent(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
	}{
		{
			name: "identical requests",
			a:    "/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo",
			b:    "/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo",
		},
		{
			name: "query parameters in a different order",
			a:    "/clusters/c/api/v1/namespaces/default/pods?limit=5&labelSelector=app%3Dfoo",
			b:    "/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo&limit=5",
		},
		{
			name: "trailing slash",
			a:    "/clusters/c/api/v1/namespaces/default/pods",
			b:    "/clusters/c/api/v1/namespaces/default/pods/",
		},
		{
			name: "proxied and direct routing of the same request",
			a:    "/clusters/c/api/v1/namespaces/default/pods",
			b:    "/api/v1/namespaces/default/pods",
		},
		{
			name: "proxied and direct routing of a discovery root",
			a:    "/clusters/c/apis",
			b:    "/apis",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			keyA, err := generateKeyForRawURL(t, tc.a)
			assert.NoError(t, err)

			keyB, err := generateKeyForRawURL(t, tc.b)
			assert.NoError(t, err)

			assert.Equal(t, keyA, keyB, "%s and %s must share a cache key", tc.a, tc.b)
		})
	}
}

func generateKeyForRawURL(t *testing.T, rawURL string) (string, error) {
	t.Helper()

	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parsing %q: %v", rawURL, err)
	}

	return k8cache.GenerateKey(parsed, "mycluster")
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
			newCache := NewMockCache()
			err := k8cache.StoreK8sResponseInCache(newCache, tc.urlObj, rcw, tc.key)
			assert.NoError(t, err)
		})
	}
}

// TestStoreK8sResponseInCacheTTL checks that pages reached through a continue token, which
// a client never requests twice, expire well before ordinary responses.
func TestStoreK8sResponseInCacheTTL(t *testing.T) {
	tests := []struct {
		name     string
		rawURL   string
		expected time.Duration
	}{
		{
			name:     "list response",
			rawURL:   "/api/v1/namespaces/default/pods",
			expected: 10 * time.Minute,
		},
		{
			name:     "filtered list response",
			rawURL:   "/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo",
			expected: 10 * time.Minute,
		},
		{
			name:     "paginated page reached through a continue token",
			rawURL:   "/api/v1/namespaces/default/pods?limit=1&continue=ey4tokeu",
			expected: time.Minute,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			parsed, err := url.Parse(tc.rawURL)
			assert.NoError(t, err)

			rcw := k8cache.NewResponseCapture(httptest.NewRecorder())
			rcw.WriteHeader(http.StatusOK)
			_, err = rcw.Write([]byte(`{"kind":"PodList"}`))
			assert.NoError(t, err)

			mockCache := NewMockCache()
			assert.NoError(t, k8cache.StoreK8sResponseInCache(mockCache, parsed, rcw, "key"))
			assert.Equal(t, tc.expected, mockCache.TTL("key"))
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

// TestStoreK8sResponseInCache_SkipSelfSubjectReviews verifies that self-subject review
// responses are never written to the cache, through the same predicate that keeps them
// out of the serve path.
func TestStoreK8sResponseInCache_SkipSelfSubjectReviews(t *testing.T) {
	paths := []string{
		"/apis/authorization.k8s.io/v1/selfsubjectrulesreviews",
		"/apis/authorization.k8s.io/v1/selfsubjectaccessreviews",
		"/clusters/kind/apis/authorization.k8s.io/v1beta1/selfsubjectrulesreviews",
	}

	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			mockCache := NewMockCache()
			rcw := k8cache.NewResponseCapture(httptest.NewRecorder())
			rcw.WriteHeader(http.StatusCreated)
			_, err := rcw.Write([]byte(`{"kind":"SelfSubjectRulesReview"}`))
			assert.NoError(t, err)

			assert.NoError(t, k8cache.StoreK8sResponseInCache(mockCache, &url.URL{Path: path}, rcw, "skip-key"))

			_, getErr := mockCache.Get(context.Background(), "skip-key")
			assert.Error(t, getErr, "self-subject review responses should never be cached")
		})
	}
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

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, "gzip-key")
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

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, "failure-key")
	assert.NoError(t, err)

	// Key must NOT have been written to the cache.
	_, getErr := mockCache.Get(context.Background(), "failure-key")
	assert.Error(t, getErr, "Failure responses should never be cached")
}

func TestStoreK8sResponseInCache_5xxResponseShouldNotBeCached(t *testing.T) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/api/v1/pods"}
	rw := httptest.NewRecorder()
	rcw := k8cache.NewResponseCapture(rw)

	// Simulate a load balancer 502 — body has no K8s "Failure" string
	rcw.WriteHeader(http.StatusBadGateway)
	_, _ = rcw.Write([]byte(`<html><body>Bad Gateway</body></html>`))

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, "infra-error-key")
	assert.NoError(t, err)

	// Key must NOT be in cache — infrastructure errors should not be cached
	_, getErr := mockCache.Get(context.Background(), "infra-error-key")
	assert.Error(t, getErr, "5xx infrastructure errors should not be cached")
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
	cacheTests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "invalid cache key with fewer segments",
			input:    "api+pods+default",
			expected: "api+pods+default",
		},
		{
			name:     "valid cache key with 4 segments and short context",
			input:    "api+pods+default+dev",
			expected: "api+pods+default+[redacted]",
		},
		{
			name:     "valid cache key with 4 segments and medium context",
			input:    "api+pods+default+prod",
			expected: "api+pods+default+pro...[redacted]",
		},
		{
			name:     "valid cache key with 4 segments and long context",
			input:    "api+pods+default+my-production-cluster",
			expected: "api+pods+default+my-...[redacted]",
		},
	}

	for _, tc := range cacheTests {
		t.Run(tc.name, func(t *testing.T) {
			result := k8cache.ExportedRedactCacheKey(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}
