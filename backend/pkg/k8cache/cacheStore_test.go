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
	"github.com/stretchr/testify/require"
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
	m.mu.Lock()
	defer m.mu.Unlock()

	result := make(map[string]string)

	for k, v := range m.store {
		if selectFunc == nil || selectFunc(k) {
			result[k] = v
		}
	}

	return result, nil
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
//nolint:funlen // Table-driven test function covering API group and version parsing from URL paths.
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

// TestExtractNamespace verifies namespace extraction from different kinds
// of URLs, including valid, empty, and malformed ones.
//
//nolint:funlen // Table-driven test function covering namespace extraction from request URLs.
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
		{
			name:       "valid namespaced resource with multiple trailing slashes",
			urlPath:    url.URL{Path: "/api/v1/namespaces/dev/services//"},
			namespaces: "dev",
			kind:       "services",
		},
		{
			name:       "internal cluster URL without API group",
			urlPath:    url.URL{Path: "/clusters/production-cluster"},
			namespaces: "",
			kind:       "",
		},
		{
			name:       "internal cluster URL with literal api segment",
			urlPath:    url.URL{Path: "/clusters/api/overview"},
			namespaces: "",
			kind:       "",
		},
		{
			name:       "internal plugin URL without API group",
			urlPath:    url.URL{Path: "/plugins/my-custom-plugin"},
			namespaces: "",
			kind:       "",
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

// TestGenerateKey ensures the generated key is valid for both normal
// and empty cluster name scenarios.
//
//nolint:funlen // Table-driven test function covering cache key generation scenarios.
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
			expectedKey: "k8s.metrics.io+v1beta1+pods+test-kube+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key with empty apiGroup",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/v1/namespaces/test-kube/pods"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods+test-kube+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key with direct api path",
			urlPath:     url.URL{Path: "/api/v1/namespaces/test-kube/pods"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods+test-kube+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key with empty apiGroup and namespace",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/v1/pods"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for core discovery path without version",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api"},
			contextKey:  "kind-kind",
			expectedKey: "++api++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for core discovery path with trailing slash",
			urlPath:     url.URL{Path: "/clusters/kind-kind/api/"},
			contextKey:  "kind-kind",
			expectedKey: "++api++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for api group discovery root",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis"},
			contextKey:  "kind-kind",
			expectedKey: "++apis++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for api group discovery path without version",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io"},
			contextKey:  "kind-kind",
			expectedKey: "k8s.metrics.io++k8s.metrics.io++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "key for api group discovery path with trailing slash",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/k8s.metrics.io/"},
			contextKey:  "kind-kind",
			expectedKey: "k8s.metrics.io++k8s.metrics.io++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "invalid url format",
			urlPath:     url.URL{Path: "/clusters/kind-kind"},
			contextKey:  "kind-kind",
			expectedKey: "",
			expectedErr: errors.New("invalid url format"),
		},
		{
			name:        "context key containing a literal plus is escaped, not treated as delimiter",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/apps/v1/namespaces/default/deployments"},
			contextKey:  "prod+cluster",
			expectedKey: "apps+v1+deployments+default+prod%2Bcluster",
			expectedErr: nil,
		},
		{
			// Regression: ensures the escape is injective. If "%" weren't
			// escaped first, this input would collide with "prod+cluster"
			// above and both would produce the same cache key.
			name:        "context key containing a literal percent sequence does not collide with the plus-escaped form",
			urlPath:     url.URL{Path: "/clusters/kind-kind/apis/apps/v1/namespaces/default/deployments"},
			contextKey:  "prod%2Bcluster",
			expectedKey: "apps+v1+deployments+default+prod%252Bcluster",
			expectedErr: nil,
		},
		{
			name:        "pod log request includes named resource, subresource, and query parameter",
			urlPath:     url.URL{Path: "/api/v1/namespaces/payments/pods/api-1/log", RawQuery: "container=app"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods/api-1/log?container=app+payments+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "distinct pod log request does not collide",
			urlPath:     url.URL{Path: "/api/v1/namespaces/payments/pods/api-2/log", RawQuery: "container=app"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods/api-2/log?container=app+payments+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "list request includes labelSelector query parameter",
			urlPath:     url.URL{Path: "/api/v1/namespaces/default/pods", RawQuery: "labelSelector=env%3Dprod"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods?labelSelector=env%253Dprod+default+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "list request with pagination token",
			urlPath:     url.URL{Path: "/api/v1/namespaces/default/pods", RawQuery: "limit=50&continue=token-1"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods?continue=token-1&limit=50+default+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "named GET request includes resource type and name",
			urlPath:     url.URL{Path: "/api/v1/namespaces/default/pods/my-pod"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+pods/my-pod+default+kind-kind",
			expectedErr: nil,
		},
		{
			name:        "cluster-scoped GET for namespace named default produces canonical namespaces/default key",
			urlPath:     url.URL{Path: "/api/v1/namespaces/default"},
			contextKey:  "kind-kind",
			expectedKey: "+v1+namespaces/default++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "multiple CRD versions produce distinct canonical keys",
			urlPath:     url.URL{Path: "/apis/example.io/v1/widgets"},
			contextKey:  "kind-kind",
			expectedKey: "example.io+v1+widgets++kind-kind",
			expectedErr: nil,
		},
		{
			name:        "distinct CRD version produces distinct canonical key",
			urlPath:     url.URL{Path: "/apis/example.io/v2/widgets"},
			contextKey:  "kind-kind",
			expectedKey: "example.io+v2+widgets++kind-kind",
			expectedErr: nil,
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

// TestGenerateKey_CollisionAvoidance verifies that distinct pod logs,
// containers, selectors, and pagination tokens do not produce colliding keys.
func TestGenerateKey_CollisionAvoidance(t *testing.T) {
	ctx := "cluster-ctx"

	// 1. Distinct pods with the same container and namespace
	u1, _ := url.Parse("/api/v1/namespaces/payments/pods/api-1/log?container=app")
	k1, err1 := k8cache.GenerateKey(u1, ctx)
	require.NoError(t, err1)

	u2, _ := url.Parse("/api/v1/namespaces/payments/pods/api-2/log?container=app")
	k2, err2 := k8cache.GenerateKey(u2, ctx)
	require.NoError(t, err2)

	assert.NotEqual(t, k1, k2, "pod log keys for different pods must not collide")

	// 2. Distinct containers on the same pod
	u3, _ := url.Parse("/api/v1/namespaces/payments/pods/api-1/log?container=sidecar")
	k3, err3 := k8cache.GenerateKey(u3, ctx)
	require.NoError(t, err3)

	assert.NotEqual(t, k1, k3, "log keys for different containers must not collide")

	// 3. Distinct label selectors on list calls
	l1, _ := url.Parse("/api/v1/namespaces/default/pods?labelSelector=tier%3Dbackend")
	kl1, errL1 := k8cache.GenerateKey(l1, ctx)
	require.NoError(t, errL1)

	l2, _ := url.Parse("/api/v1/namespaces/default/pods?labelSelector=tier%3Dfrontend")
	kl2, errL2 := k8cache.GenerateKey(l2, ctx)
	require.NoError(t, errL2)

	assert.NotEqual(t, kl1, kl2, "list keys with different labelSelectors must not collide")

	// 4. Distinct pagination tokens
	p1, _ := url.Parse("/api/v1/namespaces/default/pods?limit=50&continue=page-token-1")
	kp1, errP1 := k8cache.GenerateKey(p1, ctx)
	require.NoError(t, errP1)

	p2, _ := url.Parse("/api/v1/namespaces/default/pods?limit=50&continue=page-token-2")
	kp2, errP2 := k8cache.GenerateKey(p2, ctx)
	require.NoError(t, errP2)

	assert.NotEqual(t, kp1, kp2, "list keys with different pagination tokens must not collide")

	// 5. Distinct resource types sharing the same name
	r1, _ := url.Parse("/api/v1/namespaces/default/pods/web-svc")
	kr1, errR1 := k8cache.GenerateKey(r1, ctx)
	require.NoError(t, errR1)

	r2, _ := url.Parse("/api/v1/namespaces/default/services/web-svc")
	kr2, errR2 := k8cache.GenerateKey(r2, ctx)
	require.NoError(t, errR2)

	assert.NotEqual(t, kr1, kr2, "keys for different resource types sharing the same name must not collide")
}

// TestGenerateKey_VersionDiscoveryVsResourceNamedVersion verifies that
// API group version discovery endpoints (e.g., /apis/example.io/v1 or /api/v1)
// do not collide with endpoints accessing a resource named after the version
// (e.g., /apis/example.io/v1/v1 or /api/v1/v1).
func TestGenerateKey_VersionDiscoveryVsResourceNamedVersion(t *testing.T) {
	ctx := "cluster-ctx"

	// Core API: /api/v1 (discovery) vs /api/v1/v1 (resource named v1)
	uCoreDiscovery, err := url.Parse("/api/v1")
	require.NoError(t, err)
	kCoreDiscovery, err := k8cache.GenerateKey(uCoreDiscovery, ctx)
	require.NoError(t, err)

	uCoreResource, err := url.Parse("/api/v1/v1")
	require.NoError(t, err)
	kCoreResource, err := k8cache.GenerateKey(uCoreResource, ctx)
	require.NoError(t, err)

	assert.NotEqual(t, kCoreDiscovery, kCoreResource,
		"core API version discovery key must not collide with resource named after version")

	// Group API: /apis/example.io/v1 (discovery) vs /apis/example.io/v1/v1 (resource named v1)
	uGroupDiscovery, err := url.Parse("/apis/example.io/v1")
	require.NoError(t, err)
	kGroupDiscovery, err := k8cache.GenerateKey(uGroupDiscovery, ctx)
	require.NoError(t, err)

	uGroupResource, err := url.Parse("/apis/example.io/v1/v1")
	require.NoError(t, err)
	kGroupResource, err := k8cache.GenerateKey(uGroupResource, ctx)
	require.NoError(t, err)

	assert.NotEqual(t, kGroupDiscovery, kGroupResource,
		"group API version discovery key must not collide with resource named after version")
}

// TestGenerateKey_EncodedQuestionMarkInPath verifies that an escaped %3F in the URL path
// is treated as part of the path and does not split into a query parameter or collide
// with an actual query string.
func TestGenerateKey_EncodedQuestionMarkInPath(t *testing.T) {
	ctx := "cluster-ctx"

	// URL with %3F encoded in path
	uEncoded, err := url.Parse("/api/v1/namespaces/default/services/proxy/foo%3Fa=1")
	require.NoError(t, err)
	kEncoded, err := k8cache.GenerateKey(uEncoded, ctx)
	require.NoError(t, err)

	// URL with actual query delimiter ?
	uQuery, err := url.Parse("/api/v1/namespaces/default/services/proxy/foo?a=1")
	require.NoError(t, err)
	kQuery, err := k8cache.GenerateKey(uQuery, ctx)
	require.NoError(t, err)

	assert.NotEqual(t, kEncoded, kQuery,
		"encoded %3F in path must not collide with actual query delimiter ?")
}

// TestGenerateKey_CanonicalQueryOrdering verifies that query parameters are sorted
// so that requests with the same parameters in different orders hit the same cache entry.
func TestGenerateKey_CanonicalQueryOrdering(t *testing.T) {
	ctx := "cluster-ctx"

	u1, _ := url.Parse("/api/v1/namespaces/default/pods?limit=50&labelSelector=app%3Dtest")
	u2, _ := url.Parse("/api/v1/namespaces/default/pods?labelSelector=app%3Dtest&limit=50")

	k1, err1 := k8cache.GenerateKey(u1, ctx)
	k2, err2 := k8cache.GenerateKey(u2, ctx)

	require.NoError(t, err1)
	require.NoError(t, err2)
	assert.Equal(t, k1, k2, "query parameters must be canonicalized and sorted")
}

// TestGenerateKey_MalformedQueryPreservesPartition verifies that requests with
// malformed query parameters retain their query partition and do not collide
// with unfiltered list requests.
func TestGenerateKey_MalformedQueryPreservesPartition(t *testing.T) {
	ctx := "cluster-ctx"

	unfilteredURL, err := url.Parse("/api/v1/namespaces/default/pods")
	require.NoError(t, err)

	unfilteredKey, err := k8cache.GenerateKey(unfilteredURL, ctx)
	require.NoError(t, err)

	malformedURL, err := url.Parse("/api/v1/namespaces/default/pods?labelSelector=app%3Dbackend&unused=%ZZ")
	require.NoError(t, err)

	malformedKey, err := k8cache.GenerateKey(malformedURL, ctx)
	require.NoError(t, err)

	assert.NotEqual(t, unfilteredKey, malformedKey,
		"malformed query request must not collapse to unfiltered list cache key")
	assert.Contains(t, malformedKey, "labelSelector=app%253Dbackend")
	assert.Contains(t, malformedKey, "unused=%25ZZ")
}

// TestShouldSkipCache_StreamingEndpoints verifies that streaming query parameters bypass cache.
func TestShouldSkipCache_StreamingEndpoints(t *testing.T) {
	tests := []struct {
		name     string
		rawURL   string
		expected bool
	}{
		{
			name:     "watch=true query parameter bypasses cache",
			rawURL:   "/api/v1/namespaces/default/pods?watch=true",
			expected: true,
		},
		{
			name:     "watch=1 query parameter bypasses cache",
			rawURL:   "/api/v1/namespaces/default/pods?watch=1",
			expected: true,
		},
		{
			name:     "follow=true log stream bypasses cache",
			rawURL:   "/api/v1/namespaces/default/pods/p1/log?follow=true",
			expected: true,
		},
		{
			name:     "regular pod snapshot log does not bypass cache",
			rawURL:   "/api/v1/namespaces/default/pods/p1/log?container=app",
			expected: false,
		},
		{
			name:     "regular list query does not bypass cache",
			rawURL:   "/api/v1/namespaces/default/pods",
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, tc.rawURL, nil)
			require.NoError(t, err)
			assert.Equal(t, tc.expected, k8cache.ShouldSkipCache(req))
		})
	}

	assert.False(t, k8cache.ShouldSkipCache(nil))
}

// TestShouldSkipCache_InteractiveSubresources verifies subresources bypass cache while objects do not.
func TestShouldSkipCache_InteractiveSubresources(t *testing.T) {
	tests := []struct {
		name     string
		rawURL   string
		expected bool
	}{
		{
			name:     "exec interactive subresource bypasses cache",
			rawURL:   "/api/v1/namespaces/default/pods/p1/exec",
			expected: true,
		},
		{
			name:     "attach interactive subresource bypasses cache",
			rawURL:   "/api/v1/namespaces/default/pods/p1/attach",
			expected: true,
		},
		{
			name:     "portforward interactive subresource bypasses cache",
			rawURL:   "/api/v1/namespaces/default/pods/p1/portforward",
			expected: true,
		},
		{
			name:     "object named exec does not bypass cache",
			rawURL:   "/api/v1/namespaces/default/widgets/exec",
			expected: false,
		},
		{
			name:     "pod named exec does not bypass cache",
			rawURL:   "/api/v1/namespaces/default/pods/exec",
			expected: false,
		},
		{
			name:     "cluster-scoped object named exec does not bypass cache",
			rawURL:   "/api/v1/nodes/exec",
			expected: false,
		},
		{
			name:     "custom resource named attach does not bypass cache",
			rawURL:   "/apis/example.io/v1/namespaces/default/widgets/attach",
			expected: false,
		},
		{
			name:     "custom resource with attach subresource bypasses cache",
			rawURL:   "/apis/example.io/v1/namespaces/default/widgets/w1/attach",
			expected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, tc.rawURL, nil)
			require.NoError(t, err)
			assert.Equal(t, tc.expected, k8cache.ShouldSkipCache(req))
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
			newCache := NewMockCache()
			err := k8cache.StoreK8sResponseInCache(newCache, tc.urlObj, rcw, tc.key)
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

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, "skip-key")
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

func TestStoreK8sResponseInCache_5xxResponseShouldNotBeCached(t *testing.T) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/api/v1/pods"}
	rw := httptest.NewRecorder()
	rcw := k8cache.NewResponseCapture(rw)

	// Simulate a load balancer 502 : body has no K8s "Failure" string
	rcw.WriteHeader(http.StatusBadGateway)
	_, _ = rcw.Write([]byte(`<html><body>Bad Gateway</body></html>`))

	err := k8cache.StoreK8sResponseInCache(mockCache, targetURL, rcw, "infra-error-key")
	assert.NoError(t, err)

	// Key must NOT be in cache : infrastructure errors should not be cached
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
		{
			name:     "valid cache key with 5 segments and long context",
			input:    "apps+v1+deployments+default+my-production-cluster",
			expected: "apps+v1+deployments+default+my-...[redacted]",
		},
		{
			name:     "redacts sensitive query parameter values in logs",
			input:    "+v1+pods/api-1/proxy?token=secret-token-123+default+my-cluster",
			expected: "+v1+pods/api-1/proxy?token=%5Bredacted%5D+default+my-...[redacted]",
		},
	}

	for _, tc := range cacheTests {
		t.Run(tc.name, func(t *testing.T) {
			result := k8cache.ExportedRedactCacheKey(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

// TestGenerateKey_CoreNamespaceSubresources verifies that /api/v1/namespaces/{name}/status and
// /finalize are treated as cluster-scoped subresources of the Namespace resource with an empty namespace.
func TestGenerateKey_CoreNamespaceSubresources(t *testing.T) {
	contextID := "test-cluster"

	statusURL, err := url.Parse("/api/v1/namespaces/default/status")
	require.NoError(t, err)

	statusKey, err := k8cache.GenerateKey(statusURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, "+v1+namespaces/default/status++test-cluster", statusKey)

	finalizeURL, err := url.Parse("/api/v1/namespaces/default/finalize")
	require.NoError(t, err)

	finalizeKey, err := k8cache.GenerateKey(finalizeURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, "+v1+namespaces/default/finalize++test-cluster", finalizeKey)

	// Contrast with namespaced pod status which has namespace="default"
	podStatusURL, err := url.Parse("/api/v1/namespaces/default/pods/p1/status")
	require.NoError(t, err)

	podStatusKey, err := k8cache.GenerateKey(podStatusURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, "+v1+pods/p1/status+default+test-cluster", podStatusKey)

	// Contrast with namespaced custom resource whose plural happens to be "status"
	crdStatusURL, err := url.Parse("/apis/example.com/v1/namespaces/default/status")
	require.NoError(t, err)

	crdStatusKey, err := k8cache.GenerateKey(crdStatusURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, "example.com+v1+status+default+test-cluster", crdStatusKey)
}

// TestGenerateKey_ProxyTrailingSlashPreserved verifies that trailing slashes on proxy
// subresources produce distinct cache keys to avoid redirect and route collisions.
func TestGenerateKey_ProxyTrailingSlashPreserved(t *testing.T) {
	contextID := "test-cluster"

	serviceNoSlash, err := url.Parse("/api/v1/namespaces/default/services/web/proxy/docs")
	require.NoError(t, err)

	keyNoSlash, err := k8cache.GenerateKey(serviceNoSlash, contextID)
	require.NoError(t, err)

	serviceWithSlash, err := url.Parse("/api/v1/namespaces/default/services/web/proxy/docs/")
	require.NoError(t, err)

	keyWithSlash, err := k8cache.GenerateKey(serviceWithSlash, contextID)
	require.NoError(t, err)

	assert.NotEqual(t, keyNoSlash, keyWithSlash, "proxy routes with and without trailing slash must not share key")
	assert.Equal(t, "+v1+services/web/proxy/docs+default+test-cluster", keyNoSlash)
	assert.Equal(t, "+v1+services/web/proxy/docs/+default+test-cluster", keyWithSlash)

	// Verify standard non-proxy paths still trim trailing slashes
	podNoSlash, err := url.Parse("/api/v1/namespaces/default/pods")
	require.NoError(t, err)

	podWithSlash, err := url.Parse("/api/v1/namespaces/default/pods/")
	require.NoError(t, err)

	keyPodNoSlash, err := k8cache.GenerateKey(podNoSlash, contextID)
	require.NoError(t, err)

	keyPodWithSlash, err := k8cache.GenerateKey(podWithSlash, contextID)
	require.NoError(t, err)

	assert.Equal(t, keyPodNoSlash, keyPodWithSlash, "non-proxy paths should trim trailing slashes")
}

// TestGenerateKey_EncodedAPIPrefixDistinctKeys verifies that requests with percent-encoded
// API prefixes generate distinct cache keys for different objects and do not collapse to
// the version discovery key.
func TestGenerateKey_EncodedAPIPrefixDistinctKeys(t *testing.T) {
	clusterCtx := "c"

	reqPodA, err := url.Parse("/clusters/c/%61pi/v1/namespaces/default/pods/pod-a/log")
	require.NoError(t, err)

	keyPodA, err := k8cache.GenerateKey(reqPodA, clusterCtx)
	require.NoError(t, err)
	assert.Equal(t, "+v1+pods/pod-a/log+default+c", keyPodA)

	reqPodB, err := url.Parse("/clusters/c/%61pi/v1/namespaces/default/pods/pod-b/log")
	require.NoError(t, err)

	keyPodB, err := k8cache.GenerateKey(reqPodB, clusterCtx)
	require.NoError(t, err)
	assert.Equal(t, "+v1+pods/pod-b/log+default+c", keyPodB)

	assert.NotEqual(t, keyPodA, keyPodB, "different pods must produce distinct cache keys")

	// Compare with core version discovery which generates +v1+++c
	discoveryURL, err := url.Parse("/clusters/c/api/v1")
	require.NoError(t, err)

	discoveryKey, err := k8cache.GenerateKey(discoveryURL, clusterCtx)
	require.NoError(t, err)
	assert.Equal(t, "+v1+++c", discoveryKey)

	assert.NotEqual(t, keyPodA, discoveryKey, "pod log key must not collide with version discovery")
	assert.NotEqual(t, keyPodB, discoveryKey, "pod log key must not collide with version discovery")
}

// TestGenerateKey_NormalizedIdentifiers verifies that percent-encoded Kubernetes identifiers
// (namespaces, resource names, subresources) normalize so they match unencoded requests and
// can be reliably indexed and invalidated.
func TestGenerateKey_NormalizedIdentifiers(t *testing.T) {
	contextID := "test-cluster"

	// Encoded namespace and pod name
	encodedURL, err := url.Parse("/api/v1/namespaces/%64efault/pods/my%2Dpod")
	require.NoError(t, err)

	unencodedURL, err := url.Parse("/api/v1/namespaces/default/pods/my-pod")
	require.NoError(t, err)

	encodedKey, err := k8cache.GenerateKey(encodedURL, contextID)
	require.NoError(t, err)

	unencodedKey, err := k8cache.GenerateKey(unencodedURL, contextID)
	require.NoError(t, err)

	assert.Equal(t, "+v1+pods/my-pod+default+test-cluster", encodedKey)
	assert.Equal(t, unencodedKey, encodedKey, "encoded identifiers must normalize to match unencoded key")

	// Encoded custom resource path
	crdURL, err := url.Parse("/apis/%65xample.io/v1/namespaces/%64efault/%77idgets/my%2Ditem")
	require.NoError(t, err)

	crdKey, err := k8cache.GenerateKey(crdURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, "example.io+v1+widgets/my-item+default+test-cluster", crdKey)

	// Encoded core namespace status subresource
	nsStatusURL, err := url.Parse("/%61pi/v1/namespaces/%64efault/%73tatus")
	require.NoError(t, err)

	nsStatusKey, err := k8cache.GenerateKey(nsStatusURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, "+v1+namespaces/default/status++test-cluster", nsStatusKey)
}

// TestGenerateKey_ProxyPreservesEscapedDelimiters verifies that proxy subresource paths
// preserve percent-encoded delimiters (such as %2F and %3F) in suffixes after /proxy.
func TestGenerateKey_ProxyPreservesEscapedDelimiters(t *testing.T) {
	contextID := "test-cluster"

	// Namespaced service proxy with encoded slash in path suffix
	serviceProxyURL, err := url.Parse("/api/v1/namespaces/default/services/web/proxy/docs/foo%2Fbar")
	require.NoError(t, err)

	serviceProxyKey, err := k8cache.GenerateKey(serviceProxyURL, contextID)
	require.NoError(t, err)
	// %2F in kind segment is escaped to %252F by buildCacheKey so the key can safely use + delimiters
	assert.Equal(t, "+v1+services/web/proxy/docs/foo%252Fbar+default+test-cluster", serviceProxyKey)

	// Contrast with unescaped slash path: docs/foo/bar must produce distinct key
	serviceUnescapedURL, err := url.Parse("/api/v1/namespaces/default/services/web/proxy/docs/foo/bar")
	require.NoError(t, err)

	serviceUnescapedKey, err := k8cache.GenerateKey(serviceUnescapedURL, contextID)
	require.NoError(t, err)
	assert.NotEqual(t, serviceProxyKey, serviceUnescapedKey, "paths with encoded vs unencoded slash must not collide")
	assert.Equal(t, "+v1+services/web/proxy/docs/foo/bar+default+test-cluster", serviceUnescapedKey)

	// Encoded structural segment before proxy normalizes, while suffix preserves encoding
	normBeforeProxyURL, err := url.Parse("/api/v1/namespaces/%64efault/services/%77eb/proxy/docs/foo%2Fbar")
	require.NoError(t, err)

	normBeforeProxyKey, err := k8cache.GenerateKey(normBeforeProxyURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, serviceProxyKey, normBeforeProxyKey)

	// Node proxy with encoded delimiters
	nodeProxyURL, err := url.Parse("/api/v1/nodes/node-1/proxy/metrics%2Ffoo")
	require.NoError(t, err)

	nodeProxyKey, err := k8cache.GenerateKey(nodeProxyURL, contextID)
	require.NoError(t, err)
	assert.Equal(t, "+v1+nodes/node-1/proxy/metrics%252Ffoo++test-cluster", nodeProxyKey)
}
