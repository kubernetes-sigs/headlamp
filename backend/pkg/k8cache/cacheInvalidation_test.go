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
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
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

func TestDeleteKeys(t *testing.T) { //nolint:funlen // Table-driven test function covering cache key deletion scenarios.
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
		{
			name: "empty key does not panic",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
			key: "",
			aftermockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
		},
		{
			name: "malformed key with fewer than 4 parts does not panic",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
			key: "partial+key",
			aftermockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
		},
		{
			name: "exactly 3-part key is treated as malformed",
			beforemockCache: &MockCache{
				store: map[string]string{
					"+pods+default+test-context": "value-1",
				},
			},
			key: "group+kind+ns",
			aftermockCache: &MockCache{
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

//nolint:funlen // Long test function covering dynamic informer cache watch events.
func TestRunInformerToWatch(t *testing.T) {
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

func TestInvalidateCacheKeysForResourceEvent(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"
	listKey := "+pods+default+" + contextKey
	allNamespacesKey := "+pods++" + contextKey
	namedKey := "+test-pod+default+" + contextKey
	unrelatedKey := "+services+default+" + contextKey

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

// TestInvalidateCacheKeysForResourceEvent_FilteredListsAndSubresources verifies that
// when an informer event fires, cached filtered lists and named subresources for that
// resource are evicted from the cache store across all versions, while respecting
// name boundaries so that unrelated resources (e.g. test-pod-2) are preserved.
func TestInvalidateCacheKeysForResourceEvent_FilteredListsAndSubresources(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"
	ctx := context.Background()

	realCache := cache.New[string]()

	keysToEvict := []string{
		"+v1+pods+default+" + contextKey,
		"+v1+pods++" + contextKey,
		"+v1+pods?labelSelector=env%253Dprod+default+" + contextKey,
		"+v1+pods?labelSelector=env%253Ddev++" + contextKey,
		"+v1+pods/test-pod+default+" + contextKey,
		"+v2+pods/test-pod+default+" + contextKey,
		"+v1+pods/test-pod/status+default+" + contextKey,
		"+v1+pods/test-pod/log?container=app+default+" + contextKey,
	}

	keysToPreserve := []string{
		"+v1+pods/other-pod+default+" + contextKey,
		"+v1+pods/test-pod-2+default+" + contextKey,
		"+v1+pods/test-pod-webhook+default+" + contextKey,
		"+v1+services+default+" + contextKey,
	}

	for _, k := range keysToEvict {
		require.NoError(t, realCache.Set(ctx, k, "evict-me"))
		k8cache.ExportedIndexCacheKey(k)
	}

	for _, k := range keysToPreserve {
		require.NoError(t, realCache.Set(ctx, k, "keep-me"))
		k8cache.ExportedIndexCacheKey(k)
	}

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(
		gvr, "default", "test-pod", contextKey, realCache,
	)

	for _, k := range keysToEvict {
		_, err := realCache.Get(ctx, k)
		assert.Error(t, err, "key %q should be evicted", k)
	}

	for _, k := range keysToPreserve {
		val, err := realCache.Get(ctx, k)
		assert.NoError(t, err, "key %q should be preserved", k)
		assert.Equal(t, "keep-me", val)
	}
}

// TestInvalidateCacheKeysForResourceEvent_NamespaceResource verifies that an informer
// event for a cluster-scoped Namespace resource (e.g. name "default", namespace "")
// correctly evicts the canonical +v1+namespaces/default++ctx key.
func TestInvalidateCacheKeysForResourceEvent_NamespaceResource(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}
	contextKey := "test-context"
	ctx := context.Background()

	realCache := cache.New[string]()

	keysToEvict := []string{
		"+v1+namespaces/default++" + contextKey,
		"+v1+namespaces++" + contextKey,
	}

	keysToPreserve := []string{
		"+v1+namespaces/other-ns++" + contextKey,
		"+v1+namespaces/default-system++" + contextKey,
	}

	for _, k := range keysToEvict {
		require.NoError(t, realCache.Set(ctx, k, "evict-me"))
		k8cache.ExportedIndexCacheKey(k)
	}

	for _, k := range keysToPreserve {
		require.NoError(t, realCache.Set(ctx, k, "keep-me"))
		k8cache.ExportedIndexCacheKey(k)
	}

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(
		gvr, "", "default", contextKey, realCache,
	)

	for _, k := range keysToEvict {
		_, err := realCache.Get(ctx, k)
		assert.Error(t, err, "key %q should be evicted", k)
	}

	for _, k := range keysToPreserve {
		val, err := realCache.Get(ctx, k)
		assert.NoError(t, err, "key %q should be preserved", k)
		assert.Equal(t, "keep-me", val)
	}
}

// TestInvalidateCacheKeysForResourceEvent_MultiVersionCRD verifies that an informer
// event for a resource evicts cached entries across all served API versions (e.g. v1 and v2).
func TestInvalidateCacheKeysForResourceEvent_MultiVersionCRD(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "example.io", Version: "v1", Resource: "widgets"}
	contextKey := "test-context"
	ctx := context.Background()

	realCache := cache.New[string]()

	keysToEvict := []string{
		"example.io+v1+widgets++" + contextKey,
		"example.io+v2+widgets++" + contextKey,
		"example.io+v1+widgets/my-widget++" + contextKey,
		"example.io+v2+widgets/my-widget++" + contextKey,
		"example.io+v1+widgets/my-widget/status++" + contextKey,
	}

	keysToPreserve := []string{
		"example.io+v1+widgets/my-widget-2++" + contextKey,
		"example.io+v2+widgets/my-widget-2++" + contextKey,
		"example.io+v1+gadgets++" + contextKey,
	}

	for _, k := range keysToEvict {
		require.NoError(t, realCache.Set(ctx, k, "evict-me"))
		k8cache.ExportedIndexCacheKey(k)
	}

	for _, k := range keysToPreserve {
		require.NoError(t, realCache.Set(ctx, k, "keep-me"))
		k8cache.ExportedIndexCacheKey(k)
	}

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(
		gvr, "", "my-widget", contextKey, realCache,
	)

	for _, k := range keysToEvict {
		_, err := realCache.Get(ctx, k)
		assert.Error(t, err, "key %q should be evicted", k)
	}

	for _, k := range keysToPreserve {
		val, err := realCache.Get(ctx, k)
		assert.NoError(t, err, "key %q should be preserved", k)
		assert.Equal(t, "keep-me", val)
	}
}

// TestInvalidateCacheKeysForResourceEvent_IndexedPath verifies that keys registered
// in the resource index are evicted via the indexed fast-path without a full scan.
func TestInvalidateCacheKeysForResourceEvent_IndexedPath(t *testing.T) {
	k8cache.ResetRegistries()

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"
	ctx := context.Background()

	realCache := cache.New[string]()

	keyToEvict := "+v1+pods/indexed-pod+default+" + contextKey
	keyToPreserve := "+v1+pods/indexed-pod-2+default+" + contextKey

	require.NoError(t, realCache.Set(ctx, keyToEvict, "evict-me"))
	require.NoError(t, realCache.Set(ctx, keyToPreserve, "keep-me"))

	k8cache.ExportedIndexCacheKey(keyToEvict)
	k8cache.ExportedIndexCacheKey(keyToPreserve)

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(
		gvr, "default", "indexed-pod", contextKey, realCache,
	)

	_, err := realCache.Get(ctx, keyToEvict)
	assert.Error(t, err, "indexed key %q should be evicted", keyToEvict)

	val, err := realCache.Get(ctx, keyToPreserve)
	assert.NoError(t, err, "indexed key %q should be preserved", keyToPreserve)
	assert.Equal(t, "keep-me", val)
}

// TestRunInformerToWatch_InvalidatesListNamedAndAllNamespaceCacheKeys verifies
// informer events evict namespaced list, all-namespace list, and named GET keys.
func TestRunInformerToWatch_InvalidatesListNamedAndAllNamespaceCacheKeys(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"
	listKey := "+pods+default+" + contextKey
	allNamespacesKey := "+pods++" + contextKey
	namedKey := "+test-pod+default+" + contextKey
	unrelatedKey := "+services+default+" + contextKey

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

// IsAllowed : "could not determine resource or verb" guard branch

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

// ServeFromCacheOrForwardToK8s : StoreK8sResponseInCache error path

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

// HandleNonGETCacheInvalidation : three branches currently at 0%

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
// on a selfsubjectrulesreviews authorization endpoint is NOT invalidated because
// IsAuthBypassURL returns false for that path : the function returns nil.
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

func TestHandleNonGETCacheInvalidation_PostOnResourceNamedVersion(t *testing.T) {
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

	err = k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, "ctx")
	assert.ErrorIs(t, err, k8cache.ErrHandled)
	assert.Equal(t, 2, called, "original POST and fresh GET should both be forwarded")

	cachedValue, err := mockCache.Get(context.Background(), cacheKey)
	require.NoError(t, err)
	assert.Contains(t, cachedValue, "ConfigMap")
	assert.NotContains(t, cachedValue, "stale")
}

func TestHandleNonGETCacheInvalidation_EvictsQueryAndListVariants(t *testing.T) { //nolint:funlen
	mockCache := NewMockCache()
	ctxKey := "ctx"

	// 1. Base resource: /api/v1/namespaces/default/widgets/w
	basePodURL, err := url.Parse("/clusters/kind/api/v1/namespaces/default/widgets/w")
	require.NoError(t, err)
	basePodKey, err := k8cache.GenerateKey(basePodURL, ctxKey)
	require.NoError(t, err)
	require.NoError(t, mockCache.Set(context.Background(), basePodKey, `{"metadata":{"name":"w"}}`))
	k8cache.ExportedIndexCacheKey(basePodKey)

	// 2. Resource with query parameter: /api/v1/namespaces/default/widgets/w?includeUninitialized=true
	queryPodURL, err := url.Parse("/clusters/kind/api/v1/namespaces/default/widgets/w?includeUninitialized=true")
	require.NoError(t, err)
	queryPodKey, err := k8cache.GenerateKey(queryPodURL, ctxKey)
	require.NoError(t, err)
	require.NoError(t, mockCache.Set(context.Background(), queryPodKey, `{"metadata":{"name":"w"},"uninitialized":true}`))
	k8cache.ExportedIndexCacheKey(queryPodKey)

	// 3. Collection list with label selector: /api/v1/namespaces/default/widgets?labelSelector=app%3Dtest
	listURL, err := url.Parse("/clusters/kind/api/v1/namespaces/default/widgets?labelSelector=app%3Dtest")
	require.NoError(t, err)
	listKey, err := k8cache.GenerateKey(listURL, ctxKey)
	require.NoError(t, err)
	require.NoError(t, mockCache.Set(context.Background(), listKey, `{"items":[{"metadata":{"name":"w"}}]}`))
	k8cache.ExportedIndexCacheKey(listKey)

	// 4. Unrelated resource: /api/v1/namespaces/default/widgets/other
	otherURL, err := url.Parse("/clusters/kind/api/v1/namespaces/default/widgets/other")
	require.NoError(t, err)
	otherKey, err := k8cache.GenerateKey(otherURL, ctxKey)
	require.NoError(t, err)
	require.NoError(t, mockCache.Set(context.Background(), otherKey, `{"metadata":{"name":"other"}}`))
	k8cache.ExportedIndexCacheKey(otherKey)

	// A mutation (e.g. PATCH) arrives for /clusters/kind/api/v1/namespaces/default/widgets/w?fieldManager=headlamp
	targetURL, err := url.Parse("/clusters/kind/api/v1/namespaces/default/widgets/w?fieldManager=headlamp")
	require.NoError(t, err)

	next := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"metadata":{"name":"w"}}`))
	})

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodPatch, targetURL.String(), nil)
	r.URL = targetURL

	err = k8cache.HandleNonGETCacheInvalidation(mockCache, w, r, next, ctxKey)
	assert.ErrorIs(t, err, k8cache.ErrHandled)

	// Base resource, query-specific resource, and collection list should all be evicted
	_, err = mockCache.Get(context.Background(), basePodKey)
	assert.Error(t, err, "base GET key should be evicted on mutation")

	_, err = mockCache.Get(context.Background(), queryPodKey)
	assert.Error(t, err, "query-specific GET key should be evicted on mutation")

	_, err = mockCache.Get(context.Background(), listKey)
	assert.Error(t, err, "collection list key should be evicted on mutation")

	// Unrelated resource should remain in cache
	val, err := mockCache.Get(context.Background(), otherKey)
	assert.NoError(t, err, "unrelated resource key should not be evicted")
	assert.Contains(t, val, "other")
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

func TestStoreAndInvalidationSynchronization(t *testing.T) {
	k8cache.ResetRegistries()

	mockCache := NewMockCache()

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "sync-test-cluster"
	namespace := "default"

	var wg sync.WaitGroup

	start := make(chan struct{})

	for i := 0; i < 20; i++ {
		wg.Add(2)

		go func(idx int) {
			defer wg.Done()

			<-start

			u, err := url.Parse(fmt.Sprintf("/api/v1/namespaces/default/pods/pod-%d", idx))
			assert.NoError(t, err)

			key, err := k8cache.GenerateKey(u, contextKey)
			assert.NoError(t, err)

			rec := httptest.NewRecorder()
			rcw := k8cache.NewResponseCapture(rec)
			rcw.WriteHeader(http.StatusOK)
			_, _ = fmt.Fprintf(rcw, `{"metadata":{"name":"pod-%d"}}`, idx)

			_ = k8cache.StoreK8sResponseInCache(mockCache, u, rcw, key)
		}(i)

		go func(idx int) {
			defer wg.Done()

			<-start

			k8cache.ExportedInvalidateCacheKeysForResourceEvent(
				gvr,
				namespace,
				fmt.Sprintf("pod-%d", idx),
				contextKey,
				mockCache,
			)
		}(i)
	}

	close(start)
	wg.Wait()
}

// TestResourceKeyIndex_EvictionOnExpiration verifies that when cached responses expire,
// the cache's eviction callback unindexes the corresponding resource key index entries.
func TestResourceKeyIndex_EvictionOnExpiration(t *testing.T) {
	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	realCache := cache.New[string]()
	contextKey := "cluster-a"
	u, err := url.Parse("/api/v1/namespaces/default/events?limit=50")
	require.NoError(t, err)

	key, err := k8cache.GenerateKey(u, contextKey)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	rcw := k8cache.NewResponseCapture(rec)
	rcw.WriteHeader(http.StatusOK)
	_, _ = rcw.Write([]byte(`{"kind":"EventList","items":[]}`))

	require.NoError(t, k8cache.StoreK8sResponseInCache(realCache, u, rcw, key))
	assert.True(t, k8cache.ExportedIsKeyIndexed(key), "key should be indexed after store")

	// Trigger eviction callback as would occur when cache entry expires.
	k8cache.ExportedUnindexIfExpired(key, time.Now().Add(time.Hour))
	assert.False(t, k8cache.ExportedIsKeyIndexed(key), "key should be unindexed after expiration")
}

// TestResourceKeyIndex_ReplacementSynchronized verifies that expiring an older response
// cannot unindex a fresh replacement entry that replaced it with a later expiration timestamp.
func TestResourceKeyIndex_ReplacementSynchronized(t *testing.T) {
	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	key := "+v1+pods?page=1+default+cluster-a"
	tOld := time.Now().Add(5 * time.Second)
	tNew := time.Now().Add(10 * time.Minute)

	// Old entry indexed.
	k8cache.ExportedIndexCacheKeyWithTTL(key, 5*time.Second)
	assert.True(t, k8cache.ExportedIsKeyIndexed(key))

	// Replaced by newer entry with longer TTL.
	k8cache.ExportedIndexCacheKeyWithTTL(key, 10*time.Minute)

	// An expiration event from the old entry fires at tOld.
	k8cache.ExportedUnindexIfExpired(key, tOld)

	// The replacement entry must not have been unindexed.
	assert.True(t, k8cache.ExportedIsKeyIndexed(key), "replacement entry must remain indexed")

	// When tNew passes, expiration unindexes it.
	k8cache.ExportedUnindexIfExpired(key, tNew.Add(time.Second))
	assert.False(t, k8cache.ExportedIsKeyIndexed(key), "key should be unindexed once new entry expires")
}

// TestResourceKeyIndex_UnmonitoredResourceJanitor verifies that entries for unmonitored resources
// (e.g. Events, custom resources excluded from informers) are cleaned up by expiration sweep.
func TestResourceKeyIndex_UnmonitoredResourceJanitor(t *testing.T) {
	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	key1 := "+v1+events?limit=25+default+cluster-b"
	key2 := "+v1+events?limit=50+default+cluster-b"

	k8cache.ExportedIndexCacheKeyWithTTL(key1, -1*time.Minute) // already expired
	k8cache.ExportedIndexCacheKeyWithTTL(key2, 10*time.Minute) // active

	assert.True(t, k8cache.ExportedIsKeyIndexed(key1))
	assert.True(t, k8cache.ExportedIsKeyIndexed(key2))

	k8cache.ExportedEvictExpiredIndexEntries(time.Now())

	assert.False(t, k8cache.ExportedIsKeyIndexed(key1), "expired event index entry should be pruned")
	assert.True(t, k8cache.ExportedIsKeyIndexed(key2), "active event index entry should remain")
}

type MockTrackingCache struct {
	onGetAll func()
}

func (m *MockTrackingCache) Set(ctx context.Context, key, value string) error { return nil }

func (m *MockTrackingCache) SetWithTTL(ctx context.Context, key, value string, ttl time.Duration) error {
	return nil
}

func (m *MockTrackingCache) Get(ctx context.Context, key string) (string, error) { return "", nil }

func (m *MockTrackingCache) Delete(ctx context.Context, key string) error { return nil }

func (m *MockTrackingCache) GetAll(ctx context.Context, selectFunc cache.Matcher) (map[string]string, error) {
	if m.onGetAll != nil {
		m.onGetAll()
	}

	return nil, nil
}

func (m *MockTrackingCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	return nil
}

func (m *MockTrackingCache) SetOnEvicted(f func(key string, value string)) {}

func (m *MockTrackingCache) Close() error { return nil }

// TestGetKeysForResourceInvalidation_EmptyBucketDoesNotScanCache verifies that when
// candidate bucket is empty (no cached entries for resource), invalidation does not
// execute a global GetAll scan of the response cache.
func TestGetKeysForResourceInvalidation_EmptyBucketDoesNotScanCache(t *testing.T) {
	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	getAllCalled := false
	mockCache := &MockTrackingCache{
		onGetAll: func() {
			getAllCalled = true
		},
	}

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	k8cache.ExportedInvalidateCacheKeysForResourceEvent(gvr, "default", "uncached-pod", "test-context", mockCache)

	assert.False(t, getAllCalled, "empty candidate bucket must not trigger a global GetAll cache scan")
}

// TestInvalidateCacheKeysForResourceEvent_NamespaceSubresources verifies that an informer
// event for a Namespace resource evicts cached /namespaces/{name}/status and /finalize keys.
func TestInvalidateCacheKeysForResourceEvent_NamespaceSubresources(t *testing.T) {
	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}
	contextKey := "test-context"
	ctx := context.Background()

	realCache := cache.New[string]()

	statusKey := "+v1+namespaces/default/status++" + contextKey
	finalizeKey := "+v1+namespaces/default/finalize++" + contextKey
	otherNsStatusKey := "+v1+namespaces/other/status++" + contextKey

	require.NoError(t, realCache.Set(ctx, statusKey, "status-data"))
	require.NoError(t, realCache.Set(ctx, finalizeKey, "finalize-data"))
	require.NoError(t, realCache.Set(ctx, otherNsStatusKey, "other-status-data"))

	k8cache.ExportedIndexCacheKey(statusKey)
	k8cache.ExportedIndexCacheKey(finalizeKey)
	k8cache.ExportedIndexCacheKey(otherNsStatusKey)

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(gvr, "", "default", contextKey, realCache)

	_, err := realCache.Get(ctx, statusKey)
	assert.Error(t, err, "namespace status key should be evicted on namespace event")

	_, err = realCache.Get(ctx, finalizeKey)
	assert.Error(t, err, "namespace finalize key should be evicted on namespace event")

	val, err := realCache.Get(ctx, otherNsStatusKey)
	assert.NoError(t, err, "unrelated namespace status key should be preserved")
	assert.Equal(t, "other-status-data", val)
}

// TestHandleNonGETCacheInvalidation_ObjectNamedExecInvalidatesList verifies that a DELETE request
// for an object named "exec" is not skipped as an interactive subresource and invalidates cached lists.
func TestHandleNonGETCacheInvalidation_ObjectNamedExecInvalidatesList(t *testing.T) {
	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	ctxKey := "test-context"
	listKey := "+v1+widgets+default+" + ctxKey
	namedKey := "+v1+widgets/exec+default+" + ctxKey

	realCache := cache.New[string]()
	ctx := context.Background()

	require.NoError(t, realCache.Set(ctx, listKey, "widget-list"))
	require.NoError(t, realCache.Set(ctx, namedKey, "widget-named"))

	k8cache.ExportedIndexCacheKey(listKey)
	k8cache.ExportedIndexCacheKey(namedKey)

	targetURL, err := url.Parse("/api/v1/namespaces/default/widgets/exec")
	require.NoError(t, err)

	r := httptest.NewRequestWithContext(ctx, http.MethodDelete, targetURL.String(), nil)
	r.URL = targetURL

	// Ensure ShouldSkipCache evaluates to false for object named "exec"
	assert.False(t, k8cache.ShouldSkipCache(r), "DELETE on object named 'exec' must not skip cache invalidation")

	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		nextCalled = true

		if req.Method == http.MethodGet {
			w.WriteHeader(http.StatusNotFound)

			_, _ = w.Write([]byte(`{"kind":"Status","status":"Failure","reason":"NotFound"}`))

			return
		}

		w.WriteHeader(http.StatusOK)
	})

	w := httptest.NewRecorder()
	err = k8cache.HandleNonGETCacheInvalidation(realCache, w, r, next, ctxKey)
	assert.ErrorIs(t, err, k8cache.ErrHandled)
	assert.True(t, nextCalled)

	_, err = realCache.Get(ctx, namedKey)
	assert.Error(t, err, "named key for object 'exec' should be evicted")

	_, err = realCache.Get(ctx, listKey)
	assert.Error(t, err, "list key should be evicted on mutation of object 'exec'")
}

// TestInvalidateCacheKeysForResourceEvent_EncodedIdentifiers verifies that cached entries
// created via percent-encoded identifiers are properly indexed and invalidated by informer events.
func TestInvalidateCacheKeysForResourceEvent_EncodedIdentifiers(t *testing.T) {
	k8cache.ResetRegistries()
	t.Cleanup(func() { k8cache.ResetRegistries() })

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	contextKey := "test-context"
	ctx := context.Background()

	realCache := cache.New[string]()

	reqURL, err := url.Parse("/api/v1/namespaces/%64efault/pods/my%2Dpod")
	require.NoError(t, err)

	key, err := k8cache.GenerateKey(reqURL, contextKey)
	require.NoError(t, err)
	assert.Equal(t, "+v1+pods/my-pod+default+test-context", key)

	require.NoError(t, realCache.Set(ctx, key, "pod-data"))
	k8cache.ExportedIndexCacheKey(key)

	// Informer event carries decoded name and namespace
	k8cache.ExportedInvalidateCacheKeysForResourceEvent(gvr, "default", "my-pod", contextKey, realCache)

	_, err = realCache.Get(ctx, key)
	assert.Error(t, err, "cache entry with normalized key should be evicted by informer event")
}
