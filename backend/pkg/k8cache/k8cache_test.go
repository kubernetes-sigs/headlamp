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

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
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

// UpdateTTL Mocks updating of time-to-live with the helo of its corresponding key string.
func (m *MockCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	return nil
}

type MockKubeConfig struct {
	*kubeconfig.Context
}

func (k *MockKubeConfig) ClientSetWithToken(token string) (kubernetes.Interface, error) {
	return fake.NewSimpleClientset(), nil
}

type MockClientConfig struct{}

func (k *MockKubeConfig) ClientConfig() (clientcmd.ClientConfig, error) {
	conf := api.Config{
		Clusters: map[string]*api.Cluster{
			k.KubeContext.Cluster: k.Cluster,
		},
		AuthInfos: map[string]*api.AuthInfo{
			k.KubeContext.AuthInfo: k.AuthInfo,
		},
		Contexts: map[string]*api.Context{
			k.Name: k.KubeContext,
		},
	}

	return clientcmd.NewNonInteractiveClientConfig(conf, "kind-headlamp-admin", nil, nil), nil
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

// TestMarshalToStore tests whether the MarshallToStore
// serialized correctly that will be stored into the cache.
func TestMarshalToStore(t *testing.T) {
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

func TestGetClientSet(t *testing.T) {
	tests := []struct {
		name          string
		mockK         MockKubeConfig
		token         string
		clientSet     *kubernetes.Clientset
		expectedError error
	}{
		{
			name: "return non-empty clientset",
			mockK: MockKubeConfig{
				&kubeconfig.Context{
					ClusterID:   "/home/user/.kubeconfig+kind-headlamp-admin",
					Cluster:     &api.Cluster{Server: "https://example.com"},
					AuthInfo:    &api.AuthInfo{Token: "abcdef"},
					KubeContext: &api.Context{Cluster: "kind-headlamp-admin"},
				},
			},
			token:         "token-1245",
			expectedError: nil,
		},
		{
			name: "return unexpected ClusterID format",
			mockK: MockKubeConfig{
				&kubeconfig.Context{
					ClusterID:   "/home/user/.kubeconfig/kind-headlamp-admin",
					Cluster:     &api.Cluster{Server: "https://example.com"},
					AuthInfo:    &api.AuthInfo{Token: "abcdef"},
					KubeContext: &api.Context{Cluster: "kind-headlamp-admin"},
				},
			},
			token: "token-54321",
			expectedError: fmt.Errorf("unexpected ClusterID format in getClientSet: " +
				"\"/home/user/.kubeconfig/kind-headlamp-admin\""),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cs, err := k8cache.GetClientSet(tc.mockK.Context, tc.token)
			if tc.clientSet != nil {
				assert.NotEmpty(t, cs)
				assert.NoError(t, err)
			} else {
				assert.Equal(t, tc.expectedError, err)
			}
		})
	}
}

func TestGetKindAndVerb(t *testing.T) {
	t.Run("get kind and verb from url", func(t *testing.T) {
		urlObj := url.URL{Path: "/clusters/kind-headlamp-admin/api/v1/pods"}
		expectedVerb := "get"
		expectedKind := "pods"
		// Simulate mux.Vars
		r := httptest.NewRequest(http.MethodGet, urlObj.Path, nil)
		// Simulate mux.Vars
		vars := map[string]string{
			"api": "v1/pods", // Whatever you'd expect to be captured by the route
		}
		r = mux.SetURLVars(r, vars)
		kind, verb := k8cache.GetKindAndVerb(r)
		assert.Equal(t, expectedVerb, verb)
		assert.Equal(t, expectedKind, kind)
	})
}

func TestIsAllowed(t *testing.T) {
	tests := []struct {
		name      string
		urlObj    *url.URL
		token     string
		mockK     MockKubeConfig
		isAllowed bool
	}{
		{
			name:   "user is not allowed",
			urlObj: &url.URL{Path: "/clusters/kind-headlamp-admin/api/v1/pods"},
			token:  "token-example",
			mockK: MockKubeConfig{
				&kubeconfig.Context{
					ClusterID: "/home/saurav/.kubeconfig+kind-headlamp-admin",
					Cluster: &api.Cluster{
						Server: "https://example.com",
					},
					AuthInfo: &api.AuthInfo{
						Token: "abcdef",
					},
					KubeContext: &api.Context{
						Cluster: "kind-headlamp-admin",
					},
				},
			},
			isAllowed: false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodGet, tc.urlObj.Path, nil)

			_, err := tc.mockK.ClientSetWithToken(tc.token)
			_, _ = tc.mockK.ClientConfig()

			assert.NoError(t, err)

			isAllowed, _ := k8cache.IsAllowed(tc.mockK.Context, w, r)
			assert.Equal(t, tc.isAllowed, isAllowed)
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
			rcw := k8cache.CreateResponseCapture(rw)
			r := httptest.NewRequest(http.MethodGet, tc.urlObj.Path, nil)
			newCache := NewMockCache()
			err := k8cache.StoreK8sResponseInCache(newCache, tc.urlObj, rcw, r, tc.key)
			assert.NoError(t, err)
		})
	}
}
