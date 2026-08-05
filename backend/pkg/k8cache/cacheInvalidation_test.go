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
	"sync"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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
			name: "namespaced and all-namespace list variants are both deleted",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context++variant":            "value-1",
					"apps+deployments+default+test-context++variant": "value-2",
					"+pods++test-context++variant":                   "value-3",
				},
			},
			key: "+pods+default+test-context++variant",
			aftermockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context++variant": "value-2",
				},
			},
		},
		{
			name: "only the all-namespace list variant is present",
			beforemockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context++variant": "value-2",
					"+pods++test-context++variant":                   "value-3",
				},
			},
			key: "+pods+default+test-context++variant",
			aftermockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context++variant": "value-2",
				},
			},
		},
		{
			name: "a collection key leaves the objects in that collection cached",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context++variant":      "value-1",
					"+pods+default+test-context+mypod+variant": "value-2",
				},
			},
			key: "+pods+default+test-context++variant",
			aftermockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context+mypod+variant": "value-2",
				},
			},
		},
		{
			name: "every query variant of the same list is deleted",
			beforemockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context++variant": "value-2",
					"+pods+default+test-context++variant-a":          "value-3",
					"+pods+default+test-context++variant-b":          "value-4",
				},
			},
			key: "+pods+default+test-context++variant-a",
			aftermockCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context++variant": "value-2",
				},
			},
		},
		{
			name: "a named key also deletes the lists it appears in, but not a sibling object",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context+mypod+variant":    "value-1",
					"+pods+default+test-context++variant":         "value-2",
					"+pods+default+test-context+otherpod+variant": "value-3",
				},
			},
			key: "+pods+default+test-context+mypod+variant",
			aftermockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context+otherpod+variant": "value-3",
				},
			},
		},
		{
			name: "a same-named object of another resource type is untouched",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context+nginx+variant":       "pod-data",
					"+secrets+default+test-context+nginx+variant":    "secret-data",
					"+configmaps+default+test-context+nginx+variant": "configmap-data",
				},
			},
			key: "+pods+default+test-context+nginx+variant",
			aftermockCache: &MockCache{
				store: map[string]string{
					"+secrets+default+test-context+nginx+variant":    "secret-data",
					"+configmaps+default+test-context+nginx+variant": "configmap-data",
				},
			},
		},
		{ //nolint:exhaustruct
			name: "empty key does not panic",
			beforemockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
				},
			},
			key: "",
			aftermockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
				},
			},
		},
		{ //nolint:exhaustruct
			name: "malformed key with fewer than 6 parts does not panic",
			beforemockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
				},
			},
			key: "partial+key",
			aftermockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
				},
			},
		},
		{ //nolint:exhaustruct
			name: "a key without a name segment is treated as malformed",
			beforemockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
				},
			},
			key: "group+resource+ns+context",
			aftermockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
				},
			},
		},
		{ //nolint:exhaustruct
			name: "a key without a variant segment is treated as malformed",
			beforemockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
				},
			},
			key: "+pods+default+test-context+mypod",
			aftermockCache: &MockCache{ //nolint:exhaustruct
				store: map[string]string{
					"+pods+default+test-context++variant": "value-1",
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

// TestDeleteCollectionKeys covers the eviction a collection delete needs: the objects it
// removed must go too, since nothing else evicts them for resources without an informer.
func TestDeleteCollectionKeys(t *testing.T) {
	tests := []struct {
		name   string
		key    string
		before map[string]string
		after  map[string]string
	}{
		{
			name: "a collection key deletes the objects in that collection",
			key:  "+pods+default+test-context++variant",
			before: map[string]string{
				"+pods+default+test-context++variant":                 "value-1",
				"+pods+default+test-context+mypod+variant":            "value-2",
				"+pods+default+test-context+otherpod+variant":         "value-3",
				"+pods+other+test-context+mypod+variant":              "value-4",
				"apps+deployments+default+test-context+mypod+variant": "value-5",
			},
			after: map[string]string{
				"+pods+other+test-context+mypod+variant":              "value-4",
				"apps+deployments+default+test-context+mypod+variant": "value-5",
			},
		},
		{
			name: "a named key deletes only that object and its lists",
			key:  "+pods+default+test-context+mypod+variant",
			before: map[string]string{
				"+pods+default+test-context++variant":         "value-1",
				"+pods+default+test-context+mypod+variant":    "value-2",
				"+pods+default+test-context+otherpod+variant": "value-3",
			},
			after: map[string]string{
				"+pods+default+test-context+otherpod+variant": "value-3",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockCache := &MockCache{store: tc.before}
			k8cache.ExportedDeleteCollectionKeys(tc.key, mockCache)

			all, err := mockCache.GetAll(context.Background(), nil)
			require.NoError(t, err)
			assert.Equal(t, tc.after, all)
		})
	}
}

// TestDeleteByPrefixesRefusesEmptyPrefix guards the whole-cache purge an empty prefix
// would otherwise cause, since strings.HasPrefix matches every key against "".
func TestDeleteByPrefixesRefusesEmptyPrefix(t *testing.T) {
	mockCache := &MockCache{
		store: map[string]string{
			"+pods+default+test-context++variant": "value-1",
			"+secrets+default+test-context++var":  "value-2",
		},
	}

	k8cache.ExportedDeleteByPrefixes(mockCache, "")
	k8cache.ExportedDeleteByPrefixes(mockCache, "+pods+default+test-context++", "")

	all, err := mockCache.GetAll(context.Background(), nil)
	assert.NoError(t, err)
	assert.Len(t, all, 2, "an empty prefix must not purge the cache")

	k8cache.ExportedDeleteByPrefixes(mockCache)
	all, err = mockCache.GetAll(context.Background(), nil)
	assert.NoError(t, err)
	assert.Len(t, all, 2, "no prefixes must delete nothing")
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
				"resourceVersion":   "1",
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
					"+pods+default+test-context-2++variant":            "pod-data",
					"apps+deployments+default+test-context-2++variant": "deployment-data",
					"+nodes+default+test-context-2++variant":           "node-data",
					"apps+replicaset+default+test-context-2++variant":  "replicaset-data",
				},
			},
			afterCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context-2++variant": "deployment-data",
					"+nodes+default+test-context-2++variant":           "node-data",
					"apps+replicaset+default+test-context-2++variant":  "replicaset-data",
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
					"+pods+default+test-context-2++variant":            "pod-data",
					"apps+deployments+default+test-context-2++variant": "deployment-data",
					"+nodes+default+test-context-2++variant":           "node-data",
					"apps+replicaset+default+test-context-2++variant":  "replicaset-data",
				},
			},
			afterCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context-2++variant": "deployment-data",
					"+nodes+default+test-context-2++variant":           "node-data",
					"apps+replicaset+default+test-context-2++variant":  "replicaset-data",
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
					"+pods+default+test-context-2++variant":            "pod-data",
					"apps+deployments+default+test-context-2++variant": "deployment-data",
					"+nodes+default+test-context-2++variant":           "node-data",
					"apps+replicaset+default+test-context-2++variant":  "replicaset-data",
				},
			},
			afterCache: &MockCache{
				store: map[string]string{
					"apps+deployments+default+test-context-2++variant": "deployment-data",
					"+nodes+default+test-context-2++variant":           "node-data",
					"apps+replicaset+default+test-context-2++variant":  "replicaset-data",
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

			podKey := "+pods+default+test-context-2++variant"

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
				updatedPod.SetResourceVersion("2")

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

	mockCache := &MockCache{store: map[string]string{"+pods+default+test-context++variant": "pod-data"}}

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
			_, err := mockCache.Get(context.Background(), "+pods+default+test-context++variant")
			return err != nil
		}, 2*time.Second, 50*time.Millisecond, "Cache should be invalidated on "+event)
	}

	updatedPod := pod.DeepCopy()
	updatedPod.SetAnnotations(map[string]string{"updated": "true"})
	err = client.Tracker().Update(gvr, updatedPod, "default")
	assert.NoError(t, err)
	checkEviction("Update")

	_ = mockCache.Set(context.Background(), "+pods+default+test-context++variant", "pod-data")
	err = client.Tracker().Delete(gvr, "default", "old-pod")
	assert.NoError(t, err)
	checkEviction("Delete")

	close(stopCh)
}

// TestInvalidationEvictsKeysFromGenerateKey pins invalidation to the keys GenerateKey
// actually produces. Without it the invalidation tests pass on hand-written keys even if
// the two sides drift apart and the cache silently stops being invalidated.
func TestInvalidationEvictsKeysFromGenerateKey(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"

	evicted := []string{
		"/clusters/c/api/v1/namespaces/default/pods",
		"/clusters/c/api/v1/namespaces/default/pods?labelSelector=app%3Dfoo",
		"/clusters/c/api/v1/pods",
		"/clusters/c/api/v1/namespaces/default/pods/test-pod",
		"/clusters/c/api/v1/namespaces/default/pods/test-pod/log",
	}
	retained := []string{
		"/clusters/c/api/v1/namespaces/default/pods/other-pod",
		"/clusters/c/api/v1/namespaces/default/services/test-pod",
		"/clusters/c/api/v1/namespaces/default/secrets/test-pod",
		"/clusters/c/api/v1/namespaces/other/pods/test-pod",
	}

	mockCache := NewMockCache()

	keyFor := func(raw string) string {
		parsed, err := url.Parse(raw)
		require.NoError(t, err)

		key, err := k8cache.GenerateKey(parsed, contextKey)
		require.NoError(t, err)
		require.NoError(t, mockCache.Set(context.Background(), key, raw))

		return key
	}

	evictedKeys := make([]string, 0, len(evicted))
	for _, raw := range evicted {
		evictedKeys = append(evictedKeys, keyFor(raw))
	}

	retainedKeys := make([]string, 0, len(retained))
	for _, raw := range retained {
		retainedKeys = append(retainedKeys, keyFor(raw))
	}

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(gvr, "default", "test-pod", contextKey, mockCache)

	for i, key := range evictedKeys {
		_, err := mockCache.Get(context.Background(), key)
		assert.Error(t, err, "%s should be evicted", evicted[i])
	}

	for i, key := range retainedKeys {
		val, err := mockCache.Get(context.Background(), key)
		assert.NoError(t, err, "%s should be retained", retained[i])
		assert.Equal(t, retained[i], val)
	}
}

func TestInvalidateCacheKeysForResourceEvent(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"
	listKey := "+pods+default+" + contextKey + "++variant"
	allNamespacesKey := "+pods++" + contextKey + "++variant"
	namedKey := "+pods+default+" + contextKey + "+test-pod+variant"
	unrelatedKey := "+services+default+" + contextKey + "++variant"

	mockCache := &MockCache{
		store: map[string]string{
			listKey:          "list-data",
			allNamespacesKey: "all-namespaces-list-data",
			namedKey:         "named-get-data",
			unrelatedKey:     "unrelated-data",
		},
	}

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(
		gvr, "default", "test-pod", contextKey, mockCache,
	)

	for _, key := range []string{listKey, allNamespacesKey, namedKey} {
		_, err := mockCache.Get(context.Background(), key)
		assert.Error(t, err, "key %q should be evicted", key)
	}

	val, err := mockCache.Get(context.Background(), unrelatedKey)
	assert.NoError(t, err)
	assert.Equal(t, "unrelated-data", val)
}

// TestRunInformerToWatch_InvalidatesListNamedAndAllNamespaceCacheKeys verifies
// informer events evict namespaced list, all-namespace list, and named GET keys.
func TestRunInformerToWatch_InvalidatesListNamedAndAllNamespaceCacheKeys(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"
	listKey := "+pods+default+" + contextKey + "++variant"
	allNamespacesKey := "+pods++" + contextKey + "++variant"
	namedKey := "+pods+default+" + contextKey + "+test-pod+variant"
	unrelatedKey := "+services+default+" + contextKey + "++variant"

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

	scheme := runtime.NewScheme()
	clientMap := map[schema.GroupVersionResource]string{gvr: "PodList"}
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, clientMap)
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, "", nil)

	mockCache := &MockCache{
		store: map[string]string{
			listKey:          "list-data",
			allNamespacesKey: "all-namespaces-list-data",
			namedKey:         "named-get-data",
			unrelatedKey:     "unrelated-data",
		},
	}

	k8cache.RunInformerToWatch([]schema.GroupVersionResource{gvr}, factory, contextKey, mockCache)

	stopCh := make(chan struct{})
	factory.Start(stopCh)
	factory.WaitForCacheSync(stopCh)

	err := client.Tracker().Add(mockPod)
	assert.NoError(t, err)

	assert.Eventually(t, func() bool {
		for _, key := range []string{listKey, allNamespacesKey, namedKey} {
			if _, err := mockCache.Get(context.Background(), key); err == nil {
				return false
			}
		}

		if _, err := mockCache.Get(context.Background(), unrelatedKey); err != nil {
			return false
		}

		return true
	}, 2*time.Second, 50*time.Millisecond, "informer should evict list, all-namespace, and named GET keys")

	close(stopCh)
}

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
	allowed, err := k8cache.IsAllowed("kind-auth-test", k, req)
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

// TestHandleNonGETCacheInvalidation_GETSkipped verifies that GET requests
// are left to the caller without touching the cache or calling next.
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

	assert.False(t, k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, "key"))
	assert.False(t, called, "next must not be called for GET requests")
}

// TestHandleNonGETCacheInvalidation_BypassURLExcluded verifies that a POST
// on a selfsubjectrulesreviews authorization endpoint is NOT invalidated because
// IsAuthBypassURL returns false for that path.
func TestHandleNonGETCacheInvalidation_BypassURLExcluded(t *testing.T) {
	mockCache := NewMockCache()
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true

		w.WriteHeader(http.StatusOK)
	})

	w := httptest.NewRecorder()
	targetURL := &url.URL{Path: "/clusters/kind/apis/authorization.k8s.io/v1/selfsubjectrulesreviews"}
	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodPost, targetURL.String(), nil,
	)
	r.URL = targetURL

	assert.False(t, k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, "key"))
	assert.False(t, called, "next must not be called for excluded URLs")
}

// TestHandleNonGETCacheInvalidation_PostOnNormalURL exercises the full invalidation path:
// POST on a normal (non-excluded) URL evicts every cached variant of the object and its
// lists, forwards the request once, and reports the request as handled. The evicted entries
// are not refilled, so the modifying request costs exactly one upstream call.
func TestHandleNonGETCacheInvalidation_PostOnNormalURL(t *testing.T) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/clusters/kind/api/v1/namespaces/ns/configmaps/version"}

	cacheKey, err := k8cache.GenerateKey(targetURL, "ctx")
	require.NoError(t, err)
	require.NoError(t, mockCache.Set(context.Background(), cacheKey, `{"body":"stale"}`))

	called := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		called++

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"kind":"ConfigMap"}`))
	})

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodPost, targetURL.String(), nil,
	)
	r.URL = targetURL

	assert.True(t, k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, cacheKey))
	assert.Equal(t, 1, called, "only the original request should be forwarded")

	_, err = mockCache.Get(context.Background(), cacheKey)
	assert.Error(t, err, "the stale entry must be evicted, not refilled")
}

// TestHandleNonGETCacheInvalidation_CollectionScope checks that only a delete widens
// eviction to the objects of the collection it addresses: a create adds one object and must
// leave its siblings cached.
func TestHandleNonGETCacheInvalidation_CollectionScope(t *testing.T) {
	collectionURL := &url.URL{Path: "/clusters/kind/api/v1/namespaces/ns/configmaps"}
	objectURL := &url.URL{Path: "/clusters/kind/api/v1/namespaces/ns/configmaps/settings"}

	collectionKey, err := k8cache.GenerateKey(collectionURL, "ctx")
	require.NoError(t, err)

	objectKey, err := k8cache.GenerateKey(objectURL, "ctx")
	require.NoError(t, err)

	tests := []struct {
		method       string
		objectCached bool
	}{
		{method: http.MethodPost, objectCached: true},
		{method: http.MethodDelete, objectCached: false},
	}

	for _, tc := range tests {
		t.Run(tc.method, func(t *testing.T) {
			mockCache := NewMockCache()
			require.NoError(t, mockCache.Set(context.Background(), objectKey, `{"body":"sibling"}`))

			next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			w := httptest.NewRecorder()
			r := httptest.NewRequestWithContext(context.Background(), tc.method, collectionURL.String(), nil)
			r.URL = collectionURL

			assert.True(t, k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, collectionKey))

			_, err := mockCache.Get(context.Background(), objectKey)
			assert.Equal(t, tc.objectCached, err == nil)
		})
	}
}

// TestHandleNonGETCacheInvalidation_EvictsAfterTheWrite covers the window where a read
// racing the modifying request caches pre-write state: the entry written while the request
// is in flight must not survive it.
func TestHandleNonGETCacheInvalidation_EvictsAfterTheWrite(t *testing.T) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/clusters/kind/api/v1/namespaces/ns/configmaps/settings"}

	cacheKey, err := k8cache.GenerateKey(targetURL, "ctx")
	require.NoError(t, err)

	next := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		// A concurrent GET repopulating the cache before the write lands upstream.
		require.NoError(t, mockCache.Set(context.Background(), cacheKey, `{"body":"pre-write"}`))

		w.WriteHeader(http.StatusOK)
	})

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(
		context.Background(), http.MethodDelete, targetURL.String(), nil,
	)
	r.URL = targetURL

	assert.True(t, k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, cacheKey))

	_, err = mockCache.Get(context.Background(), cacheKey)
	assert.Error(t, err, "an entry cached during the write must be evicted afterwards")
}

var filterImportantResourcesTests = []struct {
	name  string
	input []schema.GroupVersionResource
	want  []schema.GroupVersionResource
}{
	{
		name:  "empty input",
		input: nil,
		want:  []schema.GroupVersionResource{},
	},
	{
		name: "keeps allowed resources and drops others",
		input: []schema.GroupVersionResource{
			{Group: "", Version: "v1", Resource: "pods"},
			{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"},
			{Group: "apps", Version: "v1", Resource: "deployments"},
			{Group: "", Version: "v1", Resource: "namespaces"},
		},
		want: []schema.GroupVersionResource{
			{Group: "", Version: "v1", Resource: "pods"},
			{Group: "apps", Version: "v1", Resource: "deployments"},
		},
	},
	{
		name: "preserves group and version fields",
		input: []schema.GroupVersionResource{
			{Group: "batch", Version: "v1", Resource: "jobs"},
			{Group: "batch", Version: "v1", Resource: "cronjobs"},
		},
		want: []schema.GroupVersionResource{
			{Group: "batch", Version: "v1", Resource: "jobs"},
			{Group: "batch", Version: "v1", Resource: "cronjobs"},
		},
	},
	{
		name: "keeps all allowlisted resource kinds",
		input: []schema.GroupVersionResource{
			{Group: "", Version: "v1", Resource: "pods"},
			{Group: "", Version: "v1", Resource: "services"},
			{Group: "apps", Version: "v1", Resource: "deployments"},
			{Group: "apps", Version: "v1", Resource: "replicasets"},
			{Group: "apps", Version: "v1", Resource: "statefulsets"},
			{Group: "apps", Version: "v1", Resource: "daemonsets"},
			{Group: "", Version: "v1", Resource: "nodes"},
			{Group: "", Version: "v1", Resource: "configmaps"},
			{Group: "", Version: "v1", Resource: "secrets"},
			{Group: "batch", Version: "v1", Resource: "jobs"},
			{Group: "batch", Version: "v1", Resource: "cronjobs"},
		},
		want: []schema.GroupVersionResource{
			{Group: "", Version: "v1", Resource: "pods"},
			{Group: "", Version: "v1", Resource: "services"},
			{Group: "apps", Version: "v1", Resource: "deployments"},
			{Group: "apps", Version: "v1", Resource: "replicasets"},
			{Group: "apps", Version: "v1", Resource: "statefulsets"},
			{Group: "apps", Version: "v1", Resource: "daemonsets"},
			{Group: "", Version: "v1", Resource: "nodes"},
			{Group: "", Version: "v1", Resource: "configmaps"},
			{Group: "", Version: "v1", Resource: "secrets"},
			{Group: "batch", Version: "v1", Resource: "jobs"},
			{Group: "batch", Version: "v1", Resource: "cronjobs"},
		},
	},
}

func TestFilterImportantResources(t *testing.T) {
	t.Parallel()

	for _, tt := range filterImportantResourcesTests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := k8cache.ExportedFilterImportantResources(tt.input)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestReturnGVRList_FiltersImportantResources(t *testing.T) {
	t.Parallel()

	apiResourceLists := []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "pods", Kind: "Pod", Verbs: []string{"list", "watch", "get"}},
				{Name: "ingresses", Kind: "Ingress", Verbs: []string{"list", "watch", "get"}},
			},
		},
		{
			GroupVersion: "apps/v1",
			APIResources: []metav1.APIResource{
				{Name: "deployments", Kind: "Deployment", Verbs: []string{"list", "watch", "get"}},
				{Name: "deployments/scale", Kind: "Scale", Verbs: []string{"get", "update"}},
			},
		},
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "events", Kind: "Event", Verbs: []string{"list", "watch"}},
			},
		},
	}

	got := k8cache.ExportedReturnGVRList(apiResourceLists)

	want := []schema.GroupVersionResource{
		{Group: "", Version: "v1", Resource: "pods"},
		{Group: "apps", Version: "v1", Resource: "deployments"},
	}

	assert.Equal(t, want, got)
}

func TestSyncWatchers(t *testing.T) {
	k8cache.ResetRegistries()

	canceled := make(map[string]bool)

	var mu sync.Mutex

	// Mock some watchers
	contexts := []string{"ctx1", "ctx2", "ctx3"}
	for _, ctx := range contexts {
		cKey := ctx
		_, cancel := context.WithCancel(context.Background())
		wrappedCancel := func() {
			mu.Lock()
			canceled[cKey] = true
			mu.Unlock()
			cancel()
		}

		k8cache.StoreTestContextCancel(cKey, wrappedCancel)
	}

	// Sync with only ctx1 and ctx3 active
	k8cache.SyncWatchers(nil, []string{"ctx1", "ctx3"})

	mu.Lock()
	defer mu.Unlock()

	assert.False(t, canceled["ctx1"], "ctx1 should not be canceled")
	assert.True(t, canceled["ctx2"], "ctx2 should be canceled")
	assert.False(t, canceled["ctx3"], "ctx3 should not be canceled")
}
