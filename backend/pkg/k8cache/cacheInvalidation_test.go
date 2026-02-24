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
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/dynamicinformer"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

func TestDeleteKeys(t *testing.T) {
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

			req := httptest.NewRequest(http.MethodGet, "/ws", nil)
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
