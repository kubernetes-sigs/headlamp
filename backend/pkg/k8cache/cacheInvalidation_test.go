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
	tests := []struct {
		name        string
		contextKey  string
		gvrList     []schema.GroupVersionResource
		clientMap   map[schema.GroupVersionResource]string
		mockPod     *unstructured.Unstructured
		beforeCache *MockCache
		afterCache  *MockCache
	}{
		{
			name:       "testing run watcher informer",
			contextKey: "test-context-2",
			gvrList: []schema.GroupVersionResource{
				{Group: "", Version: "v1", Resource: "pods"},
				{Group: "apps", Version: "v1", Resource: "deployments"},
			},
			clientMap: map[schema.GroupVersionResource]string{
				{Group: "", Version: "v1", Resource: "pods"}:            "PodList",
				{Group: "apps", Version: "v1", Resource: "deployments"}: "DeploymentList",
			},
			mockPod: &unstructured.Unstructured{
				Object: map[string]interface{}{
					"apiVersion": "v1",
					"kind":       "Pod",
					"metadata": map[string]interface{}{
						"name":              "test-pod",
						"namespace":         "default",
						"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
					},
				},
			},
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
			schema := runtime.NewScheme()

			client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(schema, tc.clientMap)
			factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, "", nil)

			mockCache := tc.beforeCache
			k8cache.RunInformerToWatch(tc.gvrList, factory, tc.contextKey, mockCache)

			stopCh := make(chan struct{})
			factory.Start(stopCh)
			factory.WaitForCacheSync(stopCh)

			err := client.Tracker().Add(tc.mockPod)
			assert.NoError(t, err)

			time.Sleep(100 * time.Millisecond)

			assert.EqualValues(t, tc.afterCache.store, mockCache.store)

			close(stopCh)
		})
	}
}
