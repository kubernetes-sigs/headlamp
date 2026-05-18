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
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/dynamicinformer"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	api "k8s.io/client-go/tools/clientcmd/api"
)

func TestDeleteKeys(t *testing.T) { //nolint:funlen
	tests := []struct {
		name            string
		beforemockCache *MockCache
		key             string
		aftermockCache  *MockCache
	}{
		{
			name: "both keys with empty namespace and non-empty are present in cache",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context":            "value-1",
					"apps+deployments+default+test-context": "value-2",
					"+pods++test-context":                   "value-3",
				},
			},
			key: "+pods+default+test-context",
			aftermockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context": "value-2",
				},
			},
		},
		{
			name: "only key with only empty namespace present in cache",
			beforemockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context": "value-2", "+pods++test-context": "value-3",
				},
			},
			key: "+pods+default+test-context",
			aftermockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context": "value-2",
				},
			},
		},
		{
			name: "only key with only non-empty namespace present in cache",
			beforemockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context": "value-2",
					"+pods+default+test-context":            "value-3",
				},
			},
			key: "+pods+default+test-context",
			aftermockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context": "value-2",
				},
			},
		},
		{ //nolint:exhaustruct
			name: "empty key does not panic",
			beforemockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
			key: "",
			aftermockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
		},
		{ //nolint:exhaustruct
			name: "malformed key with fewer than 4 parts does not panic",
			beforemockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
			key: "partial+key",
			aftermockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
		},
		{ //nolint:exhaustruct
			name: "exactly 3-part key is treated as malformed",
			beforemockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
			key: "group+kind+ns",
			aftermockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockCache := tc.beforemockCache
			k8cache.DeleteKeys(tc.key, mockCache)
			assert.Equal(t, tc.aftermockCache, mockCache)
		})
	}
}

func TestSkipWebSocket(t *testing.T) {
	tests := []struct {
		name           string
		connectionHdr  string
		expectedResult bool
		expectHandler  bool
	}{
		{
			name:           "Upgrade header present",
			connectionHdr:  "Upgrade",
			expectedResult: true,
			expectHandler:  true,
		},
		{
			name:           "No upgrade header",
			connectionHdr:  "",
			expectedResult: false,
			expectHandler:  false,
		},
		{
			name:           "Upgrade header with different case",
			connectionHdr:  "uPgRaDe",
			expectedResult: true,
			expectHandler:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handlerCalled := false
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				handlerCalled = true
			})

			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/ws", nil)
			if tt.connectionHdr != "" {
				req.Header.Set("Connection", tt.connectionHdr)
			}

			w := httptest.NewRecorder()

			result := k8cache.SkipWebSocket(req, next, w)
			assert.Equal(t, tt.expectedResult, result)
			assert.Equal(t, tt.expectHandler, handlerCalled)
		})
	}
}

func TestRunInformerToWatch(t *testing.T) { //nolint: funlen
	gvrList := []schema.GroupVersionResource{
		{Group: "", Version: "v1", Resource: "pods"},
		{Group: "apps", Version: "v1", Resource: "deployments"},
	}
	clientMap := map[schema.GroupVersionResource]string{
		{Group: "", Version: "v1", Resource: "pods"}:            "PodList",
		{Group: "apps", Version: "v1", Resource: "deployments"}: "DeploymentList",
	}
	mockPod := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Pod",
			"metadata": map[string]interface{}{
				"name":              "test-pod",
				"namespace":         "default",
				"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
			},
		},
	}

	tests := []struct {
		name        string
		eventType   string
		contextKey  string
		gvrList     []schema.GroupVersionResource
		clientMap   map[schema.GroupVersionResource]string
		mockPod     *unstructured.Unstructured
		beforeCache *MockCache
		afterCache  *MockCache
	}{
		{
			name:       "testing run watcher informer",
			eventType:  "add",
			contextKey: "test-context-2",
			gvrList:    gvrList,
			clientMap:  clientMap,
			mockPod:    mockPod,
			beforeCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context-2":            "pod-data",
					"apps+deployments+default+test-context-2": "deployment-data",
					"+nodes+default+test-context-2":           "node-data",
					"apps+replicaset+default+test-context-2":  "replicaset-data",
				},
			},
			afterCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context-2": "deployment-data",
					"+nodes+default+test-context-2":           "node-data",
					"apps+replicaset+default+test-context-2":  "replicaset-data",
				},
			},
		},
		{
			name:       "testing run watcher informer for update event",
			eventType:  "update",
			contextKey: "test-context-2",
			gvrList:    gvrList,
			clientMap:  clientMap,
			mockPod:    mockPod,
			beforeCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context-2":            "pod-data",
					"apps+deployments+default+test-context-2": "deployment-data",
					"+nodes+default+test-context-2":           "node-data",
					"apps+replicaset+default+test-context-2":  "replicaset-data",
				},
			},
			afterCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context-2": "deployment-data",
					"+nodes+default+test-context-2":           "node-data",
					"apps+replicaset+default+test-context-2":  "replicaset-data",
				},
			},
		},
		{
			name:       "testing run watcher informer for delete event",
			eventType:  "delete",
			contextKey: "test-context-2",
			gvrList:    gvrList,
			clientMap:  clientMap,
			mockPod:    mockPod,
			beforeCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context-2":            "pod-data",
					"apps+deployments+default+test-context-2": "deployment-data",
					"+nodes+default+test-context-2":           "node-data",
					"apps+replicaset+default+test-context-2":  "replicaset-data",
				},
			},
			afterCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context-2": "deployment-data",
					"+nodes+default+test-context-2":           "node-data",
					"apps+replicaset+default+test-context-2":  "replicaset-data",
				},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			scheme := runtime.NewScheme()

			client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, tc.clientMap)
			factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, "", nil)

			mockCache := tc.beforeCache
			k8cache.RunInformerToWatch(tc.gvrList, factory, tc.contextKey, mockCache)

			stopCh := make(chan struct{})
			factory.Start(stopCh)
			factory.WaitForCacheSync(stopCh)

			podKey := "+pods+default+test-context-2"

			switch tc.eventType {
			case "add":
				err := client.Tracker().Add(tc.mockPod)
				assert.NoError(t, err)

			case "update":
				err := client.Tracker().Add(tc.mockPod)
				assert.NoError(t, err)

				assert.Eventually(t, func() bool {
					_, err := mockCache.Get(context.Background(), podKey)
					return err != nil
				}, 2*time.Second, 50*time.Millisecond, "update event should invalidate cache key")

				err = mockCache.Set(context.Background(), podKey, "pod-data")
				assert.NoError(t, err)

				updatedPod := tc.mockPod.DeepCopy()
				updatedPod.Object["metadata"].(map[string]interface{})["labels"] = map[string]interface{}{"app": "updated"}

				gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
				err = client.Tracker().Update(gvr, updatedPod, "default")
				assert.NoError(t, err)

			case "delete":
				err := client.Tracker().Add(tc.mockPod)
				assert.NoError(t, err)

				assert.Eventually(t, func() bool {
					_, err := mockCache.Get(context.Background(), podKey)
					return err != nil
				}, 2*time.Second, 50*time.Millisecond, "Delete event should invalidate cache key")

				// Repopulate the cache key after Add event has invalidated it
				err = mockCache.Set(context.Background(), podKey, "pod-data")
				assert.NoError(t, err)

				// Now trigger the Delete event
				gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
				err = client.Tracker().Delete(gvr, tc.mockPod.GetNamespace(), tc.mockPod.GetName())
				assert.NoError(t, err)
			}

			assert.Eventually(t, func() bool {
				snapshot := make(map[string]string)

				for key := range tc.afterCache.store {
					val, err := mockCache.Get(context.Background(), key)
					if err == nil {
						snapshot[key] = val
					}
				}

				_, err := mockCache.Get(context.Background(), podKey)
				if err == nil {
					return false
				}

				for key, expectedVal := range tc.afterCache.store {
					val, err := mockCache.Get(context.Background(), key)
					if err != nil || val != expectedVal {
						return false
					}
				}

				return true
			}, 2*time.Second, 50*time.Millisecond, "Cache should match expected state after event")

			close(stopCh)
		})
	}
}

// TestRunInformerToWatch_OldResource verifies that a resource Add event triggers
// cache invalidation for resources created long ago, after the initial sync.
func TestRunInformerToWatch_OldResource(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}

	// Create a pod 10 minutes in the past to verify that cache invalidation
	// triggers correctly for old resources, avoiding the stale cache bug.
	pod := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Pod",
			"metadata": map[string]interface{}{
				"name":              "old-pod",
				"namespace":         "default",
				"creationTimestamp": time.Now().Add(-10 * time.Minute).Format(time.RFC3339),
			},
		},
	}

	scheme := runtime.NewScheme()
	clientMap := map[schema.GroupVersionResource]string{gvr: "PodList"}
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, clientMap)
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, "", nil)

	mockCache := &MockCache{store: map[string]string{"+pods+default+test-context": "pod-data"}}

	k8cache.RunInformerToWatch([]schema.GroupVersionResource{gvr}, factory, "test-context", mockCache)

	// Add the pod BEFORE starting the factory to accurately simulate a pre-existing
	// cluster resource. This ensures it is processed during the informer's initial
	// list-and-watch sync phase (where hasSynced() == false) and is safely ignored.
	err := client.Tracker().Add(pod)
	assert.NoError(t, err)

	stopCh := make(chan struct{})
	factory.Start(stopCh)
	factory.WaitForCacheSync(stopCh)

	checkEviction := func(event string) {
		assert.Eventually(t, func() bool {
			_, err := mockCache.Get(context.Background(), "+pods+default+test-context")
			return err != nil
		}, 2*time.Second, 50*time.Millisecond, "Cache should be invalidated on "+event)
	}

	updatedPod := pod.DeepCopy()
	updatedPod.SetAnnotations(map[string]string{"updated": "true"})
	err = client.Tracker().Update(gvr, updatedPod, "default")
	assert.NoError(t, err)
	checkEviction("Update")

	_ = mockCache.Set(context.Background(), "+pods+default+test-context", "pod-data")
	err = client.Tracker().Delete(gvr, "default", "old-pod")
	assert.NoError(t, err)
	checkEviction("Delete")

	close(stopCh)
}

// GetKindAndVerb — missing / empty mux "api" var  (0% branch today)

// TestGetKindAndVerb_NoMuxVars exercises the early-return path where the
// "api" mux variable is absent from the request context.
func TestGetKindAndVerb_NoMuxVars(t *testing.T) {
	req := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/api/v1/pods", nil,
	)
	// No mux.SetURLVars → mux.Vars returns empty map → ok==false branch.
	kind, verb := k8cache.GetKindAndVerb(req)
	assert.Equal(t, "", kind)
	assert.Equal(t, "unknown", verb)
}

// TestGetKindAndVerb_EmptyAPIVar covers the branch where the "api" mux var
// is present but set to an empty string.
func TestGetKindAndVerb_EmptyAPIVar(t *testing.T) {
	req := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/", nil,
	)
	req = mux.SetURLVars(req, map[string]string{"api": ""})

	kind, verb := k8cache.GetKindAndVerb(req)
	assert.Equal(t, "", kind)
	assert.Equal(t, "unknown", verb)
}

// IsAllowed — "could not determine resource or verb" guard branch

// TestIsAllowed_EmptyKind drives the `last == ""` guard inside IsAllowed
// by sending a request with no mux "api" variable so that
// GetKindAndVerb returns ("", "unknown").
func TestIsAllowed_EmptyKind(t *testing.T) {
	k := &kubeconfig.Context{
		ClusterID: "/home/user/.kubeconfig+kind-auth-test",
		Cluster:   &api.Cluster{Server: "https://127.0.0.1:19999"},
		AuthInfo:  &api.AuthInfo{Token: "tok"},
		KubeContext: &api.Context{
			Cluster:  "kind-auth-test",
			AuthInfo: "default",
		},
		Name: "kind-auth-test",
	}

	req := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/api/v1/pods", nil,
	)
	// No mux vars → GetKindAndVerb returns ("", "unknown") →
	// IsAllowed must return (false, non-nil error).
	allowed, err := k8cache.IsAllowed(k, req)
	assert.False(t, allowed)
	assert.Error(t, err)
}

// ServeFromCacheOrForwardToK8s — StoreK8sResponseInCache error path

// errOnWriteCache wraps MockCache and makes SetWithTTL always return an
// error, triggering the error-logging branch in ServeFromCacheOrForwardToK8s.
type errOnWriteCache struct {
	*MockCache
}

func (e *errOnWriteCache) SetWithTTL(_ context.Context, _, _ string, _ time.Duration) error {
	return assert.AnError
}

// TestServeFromCacheOrForwardToK8s_StoreError ensures the function handles
// a cache-write failure gracefully without panicking.
func TestServeFromCacheOrForwardToK8s_StoreError(t *testing.T) {
	badCache := &errOnWriteCache{MockCache: NewMockCache()}
	nextCalls := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalls++

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"kind":"PodList"}`))
	})

	requestPath := "/clusters/kind-kind/api/v1/pods"
	cacheKey := "store-err-key"

	w1 := httptest.NewRecorder()
	rcw1 := k8cache.NewResponseCapture(w1)
	r1 := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, requestPath, nil,
	)

	k8cache.ServeFromCacheOrForwardToK8s(badCache, false, next, cacheKey, w1, r1, rcw1)
	assert.Equal(t, http.StatusOK, w1.Code)

	w2 := httptest.NewRecorder()
	rcw2 := k8cache.NewResponseCapture(w2)
	r2 := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, requestPath, nil,
	)

	k8cache.ServeFromCacheOrForwardToK8s(badCache, false, next, cacheKey, w2, r2, rcw2)
	assert.Equal(t, http.StatusOK, w2.Code)
	assert.Equal(t, 2, nextCalls, "next must be called each time when cache write fails")

	_, err := badCache.Get(context.Background(), cacheKey)
	assert.Error(t, err, "failed cache write must not persist the key")
}

// HandleNonGETCacheInvalidation — three branches currently at 0%

// TestHandleNonGETCacheInvalidation_GETSkipped verifies that GET requests
// return nil immediately without touching the cache or calling next.
func TestHandleNonGETCacheInvalidation_GETSkipped(t *testing.T) {
	mockCache := NewMockCache()
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	})

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet,
		"/clusters/kind/api/v1/pods", nil,
	)

	err := k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, "ctx-key")
	assert.NoError(t, err)
	assert.False(t, called, "next must not be called for GET requests")
}

// TestHandleNonGETCacheInvalidation_BypassURLExcluded verifies that a POST
// on a URL containing "/selfsubjectrulesreviews" is NOT invalidated because
// IsAuthBypassURL returns false for those paths — the function returns nil.
func TestHandleNonGETCacheInvalidation_BypassURLExcluded(t *testing.T) {
	mockCache := NewMockCache()
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true

		w.WriteHeader(http.StatusOK)
	})

	w := httptest.NewRecorder()
	targetURL := &url.URL{Path: "/clusters/kind/api/v1/selfsubjectrulesreviews"}
	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodPost, targetURL.String(), nil,
	)
	r.URL = targetURL

	err := k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, "ctx-key")
	assert.NoError(t, err)
	assert.False(t, called, "next must not be called for excluded URLs")
}

// TestHandleNonGETCacheInvalidation_PostOnNormalURL exercises the full
// invalidation path: POST on a normal (non-excluded) URL →
// IsAuthBypassURL returns true → delete stale keys → forward request →
// cache fresh GET → return ErrHandled.
func TestHandleNonGETCacheInvalidation_PostOnNormalURL(t *testing.T) {
	mockCache := NewMockCache()

	next := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"kind":"PodList"}`))
	})

	w := httptest.NewRecorder()
	targetURL := &url.URL{Path: "/clusters/kind/api/v1/pods"}
	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodPost, targetURL.String(), nil,
	)
	r.URL = targetURL

	// IsAuthBypassURL("/…/pods") == true → full invalidation → ErrHandled.
	err := k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, "ctx")
	assert.ErrorIs(t, err, k8cache.ErrHandled)
}
