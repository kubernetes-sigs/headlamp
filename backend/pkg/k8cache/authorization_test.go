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
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type MockKubeConfig struct {
	*kubeconfig.Context
}

func (k *MockKubeConfig) ClientSetWithToken(token string) (kubernetes.Interface, error) {
	return fake.NewClientset(), nil
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

func TestGetClientSet(t *testing.T) {
	tests := []struct {
		name               string
		mockK              MockKubeConfig
		headlampContextKey string
		token              string
		clientSet          *kubernetes.Clientset
		expectedError      error
	}{
		{
			name: "valid ClusterID returns cached clientset",
			mockK: MockKubeConfig{
				&kubeconfig.Context{
					ClusterID:   "/home/user/.kubeconfig+kind-headlamp-admin",
					Cluster:     &api.Cluster{Server: "https://example.com"},
					AuthInfo:    &api.AuthInfo{Token: "abcdef"},
					KubeContext: &api.Context{Cluster: "kind-headlamp-admin"},
				},
			},
			headlampContextKey: "kind-headlamp-admin",
			token:              "token-1245",
			expectedError:      nil,
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
			headlampContextKey: "kind-headlamp-admin",
			token:              "token-54321",
			expectedError: fmt.Errorf("unexpected ClusterID format in GetClientSet: " +
				"\"/home/user/.kubeconfig/kind-headlamp-admin\""),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cs, err := k8cache.GetClientSet(tc.headlampContextKey, tc.mockK.Context, tc.token)
			if tc.clientSet != nil { // It is difficult to compare the expected clientset with
				// the returned clientSet as it return nested-struct inside the clientset which
				// returns only memory references. To check whether the clientset was correct or
				// not we can check by checking whether there was an error, so if there was an
				// error clientset will be empty.
				assert.NotEmpty(t, cs)
				assert.NoError(t, err)
			} else {
				assert.Equal(t, tc.expectedError, err)
			}
		})
	}
}

func TestGetKindAndVerb(t *testing.T) {
	tests := []struct {
		name         string
		method       string
		urlPath      string
		muxVars      map[string]string
		expectedKind string
		expectedVerb string
	}{
		{
			name:         "Core API with no trailing slash",
			method:       "GET",
			urlPath:      "/api/v1/pods",
			muxVars:      map[string]string{"api": "api/v1/pods"},
			expectedKind: "pods",
			expectedVerb: "list",
		},
		{
			name:         "Named API with trailing slash",
			method:       "GET",
			urlPath:      "/apis/apps/v1/deployments/",
			muxVars:      map[string]string{"api": "apis/apps/v1/deployments"},
			expectedKind: "deployments",
			expectedVerb: "list",
		},
		{
			name:         "POST request",
			method:       "POST",
			urlPath:      "/api/v1/pods",
			muxVars:      map[string]string{"api": "api/v1/pods"},
			expectedKind: "pods",
			expectedVerb: "unknown",
		},
		{
			name:         "Watch request for a named API",
			method:       "GET",
			urlPath:      "/apis/apps/v1/deployments?watch=1",
			muxVars:      map[string]string{"api": "apis/apps/v1/deployments"},
			expectedKind: "deployments",
			expectedVerb: "watch",
		},
		{
			name:         "Watch query set to 0 (false)",
			method:       "GET",
			urlPath:      "/apis/apps/v1/deployments?watch=0",
			muxVars:      map[string]string{"api": "apis/apps/v1/deployments"},
			expectedKind: "deployments",
			expectedVerb: "list",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), tc.method, tc.urlPath, nil)
			req = mux.SetURLVars(req, tc.muxVars)
			kind, verb := k8cache.GetKindAndVerb(req)
			assert.Equal(t, tc.expectedKind, kind)
			assert.Equal(t, tc.expectedVerb, verb)
		})
	}
}

type getKindAndVerbTestCase struct {
	name         string
	urlPath      string
	muxVars      map[string]string
	expectedKind string
	expectedVerb string
}

func TestGetKindAndVerbNamedResources(t *testing.T) {
	tests := []getKindAndVerbTestCase{
		{
			name:         "Core API named namespaced resource",
			urlPath:      "/api/v1/namespaces/default/pods/nginx",
			muxVars:      map[string]string{"api": "api/v1/namespaces/default/pods/nginx"},
			expectedKind: "pods",
			expectedVerb: "get",
		},
		{
			name:         "Named API named namespaced resource",
			urlPath:      "/apis/apps/v1/namespaces/default/deployments/frontend",
			muxVars:      map[string]string{"api": "apis/apps/v1/namespaces/default/deployments/frontend"},
			expectedKind: "deployments",
			expectedVerb: "get",
		},
		{
			name:         "Core API named resource subresource",
			urlPath:      "/api/v1/namespaces/default/pods/nginx/log",
			muxVars:      map[string]string{"api": "api/v1/namespaces/default/pods/nginx/log"},
			expectedKind: "pods",
			expectedVerb: "get",
		},
	}

	runGetKindAndVerbTests(t, tests)
}

func TestGetKindAndVerbNamespaceResources(t *testing.T) {
	tests := []getKindAndVerbTestCase{
		{
			name:         "Core API namespace list",
			urlPath:      "/api/v1/namespaces",
			muxVars:      map[string]string{"api": "api/v1/namespaces"},
			expectedKind: "namespaces",
			expectedVerb: "list",
		},
		{
			name:         "Core API named namespace",
			urlPath:      "/api/v1/namespaces/default",
			muxVars:      map[string]string{"api": "api/v1/namespaces/default"},
			expectedKind: "namespaces",
			expectedVerb: "get",
		},
		{
			name:         "Core API namespace status subresource",
			urlPath:      "/api/v1/namespaces/default/status",
			muxVars:      map[string]string{"api": "api/v1/namespaces/default/status"},
			expectedKind: "namespaces",
			expectedVerb: "get",
		},
		{
			name:         "Core API namespace finalize subresource",
			urlPath:      "/api/v1/namespaces/default/finalize",
			muxVars:      map[string]string{"api": "api/v1/namespaces/default/finalize"},
			expectedKind: "namespaces",
			expectedVerb: "get",
		},
	}

	runGetKindAndVerbTests(t, tests)
}

func runGetKindAndVerbTests(t *testing.T, tests []getKindAndVerbTestCase) {
	t.Helper()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.urlPath, nil)
			req = mux.SetURLVars(req, tc.muxVars)
			kind, verb := k8cache.GetKindAndVerb(req)
			assert.Equal(t, tc.expectedKind, kind)
			assert.Equal(t, tc.expectedVerb, verb)
		})
	}
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
			r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.urlObj.Path, nil)

			_, err := tc.mockK.ClientSetWithToken(tc.token)
			_, _ = tc.mockK.ClientConfig()

			assert.NoError(t, err)

			isAllowed, _ := k8cache.IsAllowed("kind-headlamp-admin", tc.mockK.Context, r)
			assert.Equal(t, tc.isAllowed, isAllowed)
		})
	}
}

// ServeFromCacheOrForwardToK8s test whether it is returning from the cache if availables or
// storing the in cache when getting error while authorizing user.
func TestServeFromCacheOrForwardToK8s(t *testing.T) {
	t.Run("stores on miss and serves on hit", func(t *testing.T) {
		urlObj := url.URL{Path: "/clusters/kind-headlamp-admin/api/v1/pods"}
		r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, urlObj.Path, nil)
		cache := NewMockCache()

		// First call should MISS the cache and invoke next.
		w1 := httptest.NewRecorder()
		rcw1 := k8cache.NewResponseCapture(w1)
		next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusTeapot) // example response
			_, err := w.Write([]byte("next handler called"))
			assert.NoError(t, err)
		})

		k8cache.ServeFromCacheOrForwardToK8s(cache, true, next, "key", w1, r, rcw1)

		// Assert first call went through next handler
		assert.Equal(t, http.StatusTeapot, w1.Code)
		assert.Contains(t, w1.Body.String(), "next handler called")
		// Assert response was stored in cache
		val, err := cache.Get(context.Background(), "key")
		assert.NoError(t, err, "expected key to be stored in cache")
		assert.NotEmpty(t, val)

		// Second call should HIT the cache and skip next
		called := false
		nextNoCall := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true

			w.WriteHeader(http.StatusInternalServerError)
		})

		w2 := httptest.NewRecorder()
		rcw2 := k8cache.NewResponseCapture(w2)
		k8cache.ServeFromCacheOrForwardToK8s(cache, true, nextNoCall, "key", w2, r, rcw2)

		// Assert second call did not invoke next
		assert.False(t, called, "expected cache hit to skip next handler")

		// Assert second call's output matches what was cached
		assert.Equal(t, http.StatusTeapot, w2.Code)
		assert.Contains(t, w2.Body.String(), "next handler called")
	})
}

func testIsAllowedWithServer(
	t *testing.T,
	handler http.HandlerFunc,
	token string,
) (bool, error) {
	t.Helper()

	ts := httptest.NewServer(handler)
	defer ts.Close()

	ctx := &kubeconfig.Context{
		ClusterID:   "/home/user/.kubeconfig+test-cluster",
		Cluster:     &api.Cluster{Server: ts.URL},
		AuthInfo:    &api.AuthInfo{Token: token},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	urlPath := "/clusters/test-cluster/api/v1/namespaces/default/pods"
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, urlPath, nil)
	req = mux.SetURLVars(req, map[string]string{"api": "api/v1/namespaces/default/pods"})
	req.Header.Set("Authorization", "Bearer "+token)

	return k8cache.IsAllowed("test-cluster", ctx, req)
}

func TestIsAllowed_EvictsOnUnauthorized(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)

		statusResp := `{"kind":"Status","apiVersion":"v1","status":"Failure",` +
			`"message":"Unauthorized","reason":"Unauthorized","code":401}`
		_, _ = w.Write([]byte(statusResp))
	})

	allowed, err := testIsAllowedWithServer(t, handler, "unauth-token")
	assert.False(t, allowed)
	assert.Error(t, err)

	assert.False(t, k8cache.HasCachedClientset("test-cluster", "unauth-token"),
		"clientset with unauthorized token should be evicted from cache")
	assert.Equal(t, 0, k8cache.ClientsetCacheLen())
}

func TestIsAllowed_RetainsOnForbidden(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Cleanup(k8cache.ResetClientsetCache)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)

		ssarResp := `{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1",` +
			`"status":{"allowed":false,"reason":"RBAC: access denied"}}`
		_, _ = w.Write([]byte(ssarResp))
	})

	allowed, err := testIsAllowedWithServer(t, handler, "forbidden-token")
	assert.False(t, allowed)
	assert.NoError(t, err)

	assert.True(t, k8cache.HasCachedClientset("test-cluster", "forbidden-token"),
		"clientset with forbidden (authenticated) token should be retained in cache")
	assert.Equal(t, 1, k8cache.ClientsetCacheLen())
}

func newDelayed401Server(
	t *testing.T,
	reqStarted chan<- struct{},
) (*kubeconfig.Context, func()) {
	t.Helper()

	allowFinish := make(chan struct{})

	var (
		startOnce  sync.Once
		finishOnce sync.Once
	)

	releaseServer := func() {
		finishOnce.Do(func() {
			close(allowFinish)
		})
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startOnce.Do(func() {
			close(reqStarted)
		})

		<-allowFinish

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)

		statusResp := `{"kind":"Status","apiVersion":"v1","status":"Failure",` +
			`"message":"Unauthorized","reason":"Unauthorized","code":401}`
		_, _ = w.Write([]byte(statusResp))
	})

	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)
	t.Cleanup(releaseServer)

	ctx := &kubeconfig.Context{
		ClusterID:   "/home/user/.kubeconfig+test-cluster",
		Cluster:     &api.Cluster{Server: ts.URL},
		AuthInfo:    &api.AuthInfo{Token: "shared-token"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	return ctx, releaseServer
}

func TestIsAllowed_DelayedUnauthorizedDoesNotEvictNewerClientset(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()
		k8cache.ResetInFlight()
	})

	reqStarted := make(chan struct{})
	ctx, releaseServer := newDelayed401Server(t, reqStarted)

	urlPath := "/clusters/test-cluster/api/v1/namespaces/default/pods"
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, urlPath, nil)
	req = mux.SetURLVars(req, map[string]string{"api": "api/v1/namespaces/default/pods"})
	req.Header.Set("Authorization", "Bearer shared-token")

	type result struct {
		allowed bool
		err     error
	}

	resCh := make(chan result, 1)

	go func() {
		allowed, err := k8cache.IsAllowed("test-cluster", ctx, req)
		resCh <- result{allowed: allowed, err: err}
	}()

	// Wait until the older request has created its clientset and contacted the server.
	select {
	case <-reqStarted:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for older SSAR request to start")
	}

	// At this point, the older request is waiting for its SSAR response.
	// Store a distinct newer clientset under the same cache key.
	newCS := &kubernetes.Clientset{}
	k8cache.SeedClientsetCacheWithClientset("test-cluster\x00shared-token", newCS, time.Now())
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "shared-token"))

	// Allow the older request's delayed 401 response to proceed.
	releaseServer()

	// Wait for the older request's IsAllowed() call to finish.
	var res result

	select {
	case res = <-resCh:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for IsAllowed() to return 401 response")
	}

	assert.False(t, res.allowed)
	assert.Error(t, res.err)

	// The newer cached clientset must remain present after the older request returns 401.
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "shared-token"),
		"newer cached clientset must remain cached after delayed 401 from older clientset")
	assert.Same(t, newCS, k8cache.GetCachedClientsetForTesting("test-cluster", "shared-token"),
		"cached entry must still be the newer clientset pointer")
}

func TestClientsetCache_MaxCapacityEviction(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()
		k8cache.ResetInFlight()
	})

	restoreLimit := k8cache.SetMaxClientsetsForTesting(3)
	t.Cleanup(restoreLimit)

	restoreCreator := k8cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	)
	t.Cleanup(restoreCreator)

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	// Add 3 tokens to reach capacity.
	_, err := k8cache.GetClientSet("test-cluster", ctx, "token-1")
	assert.NoError(t, err)
	_, err = k8cache.GetClientSet("test-cluster", ctx, "token-2")
	assert.NoError(t, err)
	_, err = k8cache.GetClientSet("test-cluster", ctx, "token-3")
	assert.NoError(t, err)

	assert.Equal(t, 3, k8cache.ClientsetCacheLen())
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-1"))
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-2"))
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-3"))

	// Use distinct timestamps so the cache-hit refresh is tested deterministically.
	now := time.Now()
	k8cache.SeedClientsetCache("test-cluster\x00token-1", now.Add(-3*time.Minute))
	k8cache.SeedClientsetCache("test-cluster\x00token-2", now.Add(-2*time.Minute))
	k8cache.SeedClientsetCache("test-cluster\x00token-3", now.Add(-1*time.Minute))

	// Refresh token-1, making token-2 the least recently used entry.
	_, err = k8cache.GetClientSet("test-cluster", ctx, "token-1")
	assert.NoError(t, err)

	// Adding a 4th token should evict the least recently used token (token-2), not token-1.
	_, err = k8cache.GetClientSet("test-cluster", ctx, "token-4")
	assert.NoError(t, err)

	assert.Equal(t, 3, k8cache.ClientsetCacheLen(), "cache size should remain bounded by maxClientsets")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-1"), "recently accessed token-1 should remain cached")
	assert.False(t, k8cache.HasCachedClientset("test-cluster", "token-2"), "least-recently-used token-2 should be evicted")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-3"), "token-3 should remain cached")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-4"), "newly added token-4 should be cached")
}

func TestClientsetCache_SetMaxClientsets(t *testing.T) {
	origLimit := k8cache.MaxClientsets()

	k8cache.ResetClientsetCache()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()

		_ = k8cache.SetMaxClientsets(origLimit)
	})

	// Verify default capacity is DefaultMaxClientsets (256).
	assert.Equal(t, k8cache.DefaultMaxClientsets, k8cache.MaxClientsets())

	// Setting limit <= 0 should return error and leave limit unchanged.
	err := k8cache.SetMaxClientsets(0)
	assert.Error(t, err)
	assert.Equal(t, k8cache.DefaultMaxClientsets, k8cache.MaxClientsets())

	err = k8cache.SetMaxClientsets(-1)
	assert.Error(t, err)
	assert.Equal(t, k8cache.DefaultMaxClientsets, k8cache.MaxClientsets())

	// Valid limit update.
	err = k8cache.SetMaxClientsets(10)
	assert.NoError(t, err)
	assert.Equal(t, 10, k8cache.MaxClientsets())

	// Reducing limit below current cache size evicts oldest entries.
	now := time.Now()
	k8cache.SeedClientsetCache("test-cluster\x00token-1", now.Add(-3*time.Minute))
	k8cache.SeedClientsetCache("test-cluster\x00token-2", now.Add(-2*time.Minute))
	k8cache.SeedClientsetCache("test-cluster\x00token-3", now.Add(-1*time.Minute))
	assert.Equal(t, 3, k8cache.ClientsetCacheLen())

	err = k8cache.SetMaxClientsets(2)
	assert.NoError(t, err)
	assert.Equal(t, 2, k8cache.MaxClientsets())
	assert.Equal(t, 2, k8cache.ClientsetCacheLen())
	assert.False(
		t,
		k8cache.HasCachedClientset("test-cluster", "token-1"),
		"oldest token should be evicted on limit reduction",
	)
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-2"))
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-3"))
}

func TestClientsetCache_SetMaxClientsetsLRUEviction(t *testing.T) {
	origLimit := k8cache.MaxClientsets()

	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()
		k8cache.ResetInFlight()

		_ = k8cache.SetMaxClientsets(origLimit)
	})

	_ = k8cache.SetMaxClientsets(5)

	restoreCreator := k8cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	)
	t.Cleanup(restoreCreator)

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	_, err := k8cache.GetClientSet("test-cluster", ctx, "token-1")
	assert.NoError(t, err)

	_, err = k8cache.GetClientSet("test-cluster", ctx, "token-2")
	assert.NoError(t, err)

	_, err = k8cache.GetClientSet("test-cluster", ctx, "token-3")
	assert.NoError(t, err)

	now := time.Now()
	k8cache.SeedClientsetCache("test-cluster\x00token-1", now.Add(-3*time.Minute))
	k8cache.SeedClientsetCache("test-cluster\x00token-2", now.Add(-2*time.Minute))
	k8cache.SeedClientsetCache("test-cluster\x00token-3", now.Add(-1*time.Minute))

	// Re-access token-1 through the real cache-hit path, updating its lastUsed to now.
	cs, err := k8cache.GetClientSet("test-cluster", ctx, "token-1")
	assert.NoError(t, err)
	assert.NotNil(t, cs)

	// Reducing limit to 2 should evict least-recently-used token-2, not token-1.
	err = k8cache.SetMaxClientsets(2)
	assert.NoError(t, err)
	assert.Equal(t, 2, k8cache.MaxClientsets())
	assert.Equal(t, 2, k8cache.ClientsetCacheLen())
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-1"),
		"recently accessed token-1 should remain cached")
	assert.False(t, k8cache.HasCachedClientset("test-cluster", "token-2"),
		"least-recently-used token-2 should be evicted on limit reduction")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-3"),
		"token-3 should remain cached")
}

func TestClientsetCache_CapacityEvictionSkipsInFlight(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()
		k8cache.ResetInFlight()
	})

	restoreLimit := k8cache.SetMaxClientsetsForTesting(2)
	t.Cleanup(restoreLimit)

	// Seed 2 entries: "token-oldest" (older timestamp) and "token-newer" (newer timestamp)
	oldTime := time.Now().Add(-5 * time.Minute)
	newTime := time.Now().Add(-1 * time.Minute)

	k8cache.SeedClientsetCache("test-cluster\x00token-oldest", oldTime)
	k8cache.SeedClientsetCache("test-cluster\x00token-newer", newTime)
	assert.Equal(t, 2, k8cache.ClientsetCacheLen())

	// Mark token-oldest as currently in-flight
	k8cache.SeedInFlightClientsetKey("test-cluster\x00token-oldest")

	restoreCreator := k8cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	)
	t.Cleanup(restoreCreator)

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	// Creating token-newest should trigger eviction.
	// Since token-oldest is in-flight, it must NOT be evicted. Instead, token-newer should be evicted.
	_, err := k8cache.GetClientSet("test-cluster", ctx, "token-newest")
	assert.NoError(t, err)

	assert.Equal(t, 2, k8cache.ClientsetCacheLen())
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-oldest"), "in-flight entry must not be evicted")
	assert.False(t, k8cache.HasCachedClientset("test-cluster", "token-newer"), "non-in-flight entry should be evicted")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-newest"))
}

func TestClientsetCache_AllEntriesInFlightDoesNotExceedCapacity(t *testing.T) {
	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()
		k8cache.ResetInFlight()
	})

	restoreLimit := k8cache.SetMaxClientsetsForTesting(2)
	t.Cleanup(restoreLimit)

	// Seed 2 entries and mark BOTH as in-flight
	k8cache.SeedClientsetCache("test-cluster\x00token-1", time.Now())
	k8cache.SeedClientsetCache("test-cluster\x00token-2", time.Now())
	k8cache.SeedInFlightClientsetKey("test-cluster\x00token-1")
	k8cache.SeedInFlightClientsetKey("test-cluster\x00token-2")
	assert.Equal(t, 2, k8cache.ClientsetCacheLen())

	restoreCreator := k8cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	)
	t.Cleanup(restoreCreator)

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	// Adding a 3rd token when all existing cached entries are in-flight should NOT exceed capacity.
	cs, err := k8cache.GetClientSet("test-cluster", ctx, "token-3")
	assert.NoError(t, err)
	assert.NotNil(t, cs)

	// Capacity must be strictly preserved at 2, and in-flight creations must not be evicted.
	assert.Equal(t, 2, k8cache.ClientsetCacheLen(), "cache capacity must not be exceeded")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-1"))
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-2"))
	assert.False(t, k8cache.HasCachedClientset("test-cluster", "token-3"),
		"new entry should not be cached when capacity cannot be safely freed")
}

func TestClientsetCache_InFlightTrimmingOnCompletion(t *testing.T) {
	origLimit := k8cache.MaxClientsets()

	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()
		k8cache.ResetInFlight()

		_ = k8cache.SetMaxClientsets(origLimit)
	})

	_ = k8cache.SetMaxClientsets(5)

	token1Cached := make(chan struct{})
	token2Cached := make(chan struct{})
	proceedToken1 := make(chan struct{})
	proceedToken2 := make(chan struct{})

	setupInFlightHooks(t, proceedToken1, proceedToken2, token1Cached, token2Cached)

	ctx := &kubeconfig.Context{
		ClusterID:   "/path+test-cluster",
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo:    &api.AuthInfo{Token: "test"},
		KubeContext: &api.Context{Cluster: "test-cluster"},
	}

	var wg1, wg2 sync.WaitGroup

	startInFlightGetClientSet(t, &wg1, ctx, "token-1", token1Cached)
	startInFlightGetClientSet(t, &wg2, ctx, "token-2", token2Cached)

	// At this point, both token-1 and token-2 are cached, and both are in-flight.
	assert.Equal(t, 2, k8cache.ClientsetCacheLen())
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-1"))
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-2"))

	// Reduce capacity to 1 while both creations are in flight.
	err := k8cache.SetMaxClientsets(1)
	assert.NoError(t, err)

	// Both entries must be preserved while in-flight.
	assert.Equal(t, 2, k8cache.ClientsetCacheLen(),
		"in-flight entries must not be evicted during limit reduction")

	// Allow token-1 to finish while token-2 is still in-flight.
	// Since token-2 is in-flight, token-1 is the only evictable entry and gets trimmed.
	close(proceedToken1)
	wg1.Wait()

	assert.Equal(t, 1, k8cache.ClientsetCacheLen(),
		"cache size should be trimmed to maxClientsets after token-1 completes")
	assert.False(t, k8cache.HasCachedClientset("test-cluster", "token-1"),
		"token-1 should be evicted")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-2"),
		"in-flight token-2 should remain cached")

	// Allow token-2 to finish. Cache is already at maxClientsets (1), so token-2 remains.
	close(proceedToken2)
	wg2.Wait()

	assert.Equal(t, 1, k8cache.ClientsetCacheLen())
	assert.False(t, k8cache.HasCachedClientset("test-cluster", "token-1"))
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-2"))
}

func TestClientsetCache_InFlightTrimmingOnFailedCreation(t *testing.T) {
	origLimit := k8cache.MaxClientsets()

	k8cache.ResetClientsetCache()
	k8cache.ResetInFlight()
	t.Cleanup(func() {
		k8cache.ResetClientsetCache()
		k8cache.ResetInFlight()

		_ = k8cache.SetMaxClientsets(origLimit)
	})

	_ = k8cache.SetMaxClientsets(1)

	now := time.Now()
	k8cache.SeedClientsetCache("test-cluster\x00token-old", now.Add(-5*time.Minute))
	k8cache.SeedClientsetCache("test-cluster\x00token-new", now.Add(-1*time.Minute))
	k8cache.SeedInFlightClientsetKey("test-cluster\x00token-failed")

	assert.Equal(t, 2, k8cache.ClientsetCacheLen())

	// Completing a failed in-flight creation must still trigger cache trimming.
	k8cache.FinishInFlightClientsetForTesting(
		"test-cluster\x00token-failed",
		nil,
		fmt.Errorf("simulated creation failure"),
	)

	assert.Equal(t, 1, k8cache.ClientsetCacheLen())
	assert.False(t, k8cache.HasCachedClientset("test-cluster", "token-old"),
		"oldest token should be evicted")
	assert.True(t, k8cache.HasCachedClientset("test-cluster", "token-new"),
		"newer token should remain cached")
}

func startInFlightGetClientSet(
	t *testing.T,
	wg *sync.WaitGroup,
	ctx *kubeconfig.Context,
	token string,
	cachedCh chan struct{},
) {
	t.Helper()
	wg.Add(1)

	go func() {
		defer wg.Done()

		cs, err := k8cache.GetClientSet("test-cluster", ctx, token)
		assert.NoError(t, err)
		assert.NotNil(t, cs)
	}()

	<-cachedCh
}

func setupInFlightHooks(t *testing.T, proceed1, proceed2, cached1, cached2 chan struct{}) {
	t.Helper()

	restoreCreator := k8cache.SetClientsetCreator(
		func(_ *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	)
	t.Cleanup(restoreCreator)

	restoreHook := k8cache.SetTestingBeforeFinishInFlight(func(cacheKey string) {
		switch cacheKey {
		case "test-cluster\x00token-1":
			close(cached1)
			<-proceed1
		case "test-cluster\x00token-2":
			close(cached2)
			<-proceed2
		}
	})
	t.Cleanup(restoreHook)
}
