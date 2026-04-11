/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd/api"
)

//nolint:funlen
func TestStatelessClustersKubeConfig(t *testing.T) {
	kubeConfigByte, err := os.ReadFile("./headlamp_testdata/kubeconfig")
	require.NoError(t, err)

	kubeConfig := base64.StdEncoding.EncodeToString(kubeConfigByte)

	tests := []struct {
		name                string
		clusters            []KubeconfigRequest
		expectedState       int
		expectedNumClusters int
	}{
		{
			name: "valid",
			clusters: []KubeconfigRequest{
				{
					Kubeconfigs: []string{kubeConfig},
				},
			},
			expectedState:       http.StatusOK,
			expectedNumClusters: 2,
		},
		{
			name: "invalid",
			clusters: []KubeconfigRequest{
				{
					Kubeconfigs: []string{"badKubeconfig"},
				},
			},
			expectedState:       http.StatusBadRequest,
			expectedNumClusters: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cache := cache.New[interface{}]()
			kubeConfigStore := kubeconfig.NewContextStore()
			c := HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:          false,
						KubeConfigPath:        "",
						EnableDynamicClusters: true,
						KubeConfigStore:       kubeConfigStore,
					},
					Cache: cache,
				},
			}
			handler := createHeadlampHandler(context.Background(), &c)

			for _, clusterReq := range tc.clusters {
				r, err := getResponseFromRestrictedEndpoint(handler, "POST", "/parseKubeConfig", clusterReq)
				if err != nil {
					t.Fatal(err)
				}

				assert.Equal(t, r.Code, tc.expectedState)

				if r.Code == http.StatusOK {
					var config clientConfig

					err = json.Unmarshal(r.Body.Bytes(), &config)
					if err != nil {
						t.Fatal(err)
					}

					assert.Equal(t, tc.expectedNumClusters, len(config.Clusters))
				}
			}
		})
	}
}

func TestParseKubeConfigInvalidJSONReturnsBadRequest(t *testing.T) {
	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()
	c := HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:          false,
				KubeConfigPath:        "",
				EnableDynamicClusters: true,
				KubeConfigStore:       kubeConfigStore,
			},
			Cache: cache,
		},
	}
	handler := createHeadlampHandler(context.Background(), &c)

	token := uuid.New().String()
	require.NoError(t, os.Setenv("HEADLAMP_BACKEND_TOKEN", token))

	defer func() { _ = os.Unsetenv("HEADLAMP_BACKEND_TOKEN") }()

	req := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		"/parseKubeConfig",
		strings.NewReader("{"),
	)
	req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", token)

	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	assert.Equal(t, http.StatusBadRequest, resp.Code)
	assert.Equal(t, "Invalid JSON request body\n", resp.Body.String())
	assert.NotContains(t, resp.Body.String(), "clusters")
}

func TestParseKubeConfigRequiresKubeconfigs(t *testing.T) {
	tests := []struct {
		name string
		body map[string]interface{}
	}{
		{
			name: "missing kubeconfigs",
			body: map[string]interface{}{},
		},
		{
			name: "singular kubeconfig",
			body: map[string]interface{}{
				"kubeconfig": "bad-or-empty-value",
			},
		},
		{
			name: "empty kubeconfigs",
			body: map[string]interface{}{
				"kubeconfigs": []string{},
			},
		},
		{
			name: "null kubeconfigs",
			body: map[string]interface{}{
				"kubeconfigs": nil,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cache := cache.New[interface{}]()
			kubeConfigStore := kubeconfig.NewContextStore()
			c := HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:          false,
						KubeConfigPath:        "",
						EnableDynamicClusters: true,
						KubeConfigStore:       kubeConfigStore,
					},
					Cache: cache,
				},
			}
			handler := createHeadlampHandler(context.Background(), &c)

			resp, err := getResponseFromRestrictedEndpoint(handler, "POST", "/parseKubeConfig", tc.body)
			require.NoError(t, err)

			assert.Equal(t, http.StatusBadRequest, resp.Code)
			assert.Equal(t, "kubeconfigs is required\n", resp.Body.String())
			assert.NotContains(t, resp.Body.String(), "clusters")
		})
	}
}

//nolint:funlen
func TestStatelessClusterApiRequest(t *testing.T) {
	kubeConfigByte, err := os.ReadFile("./headlamp_testdata/kubeconfig")
	require.NoError(t, err)

	kubeConfig := base64.StdEncoding.EncodeToString(kubeConfigByte)

	tests := []struct {
		name   string
		userID string
	}{
		{
			name:   "minikube",
			userID: uuid.New().String(),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cache := cache.New[interface{}]()
			kubeConfigStore := kubeconfig.NewContextStore()
			c := HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:          false,
						KubeConfigPath:        "",
						EnableDynamicClusters: true,
						KubeConfigStore:       kubeConfigStore,
					},
					Cache:            cache,
					TelemetryConfig:  GetDefaultTestTelemetryConfig(),
					TelemetryHandler: &telemetry.RequestHandler{},
				},
			}
			handler := createHeadlampHandler(context.Background(), &c)
			headers := map[string]string{
				"KUBECONFIG":         kubeConfig,
				"X-HEADLAMP-USER-ID": tc.userID,
			}
			requestPath := fmt.Sprintf("/clusters/%s/version/", tc.name)
			req, err := http.NewRequest("GET", requestPath, nil) //nolint:noctx
			require.NoError(t, err)

			for key, value := range headers {
				req.Header.Add(key, value)
			}

			resp := httptest.NewRecorder()
			handler.ServeHTTP(resp, req)

			configuredClusters := c.getClusters()

			var cluster *Cluster

			for i, val := range configuredClusters {
				if val.Name == tc.name {
					cluster = &configuredClusters[i]
					break
				}
			}

			assert.NotNil(t, cluster)
			assert.Equal(t, tc.name, cluster.Name)
		})
	}
}

func TestMarshalCustomObject(t *testing.T) {
	mockInfo := &runtime.Unknown{
		Raw: []byte(`{"customName": "test-cluster", "otherField": "value"}`),
	}

	result, err := MarshalCustomObject(mockInfo, "test-context")
	assert.NoError(t, err)
	assert.Equal(t, "test-cluster", result.CustomName)
}

func TestWebsocketConnContextKey(t *testing.T) {
	testCases := []struct {
		name           string
		protocols      string
		clusterName    string
		expectedKey    string
		expectedHeader string
	}{
		{
			name:           "With authorization protocol",
			protocols:      "base64url.headlamp.authorization.k8s.io.user123, v4.channel.k8s.io",
			clusterName:    "test-cluster",
			expectedKey:    "test-clusteruser123",
			expectedHeader: "v4.channel.k8s.io",
		},
		{
			name:           "Without authorization protocol",
			protocols:      "v4.channel.k8s.io",
			clusterName:    "test-cluster",
			expectedKey:    "test-cluster",
			expectedHeader: "v4.channel.k8s.io",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
			req.Header.Set("Sec-Websocket-Protocol", tc.protocols)

			key := websocketConnContextKey(req, tc.clusterName)
			assert.Equal(t, tc.expectedKey, key)
			assert.Equal(t, tc.expectedHeader, req.Header.Get("Sec-Websocket-Protocol"))
		})
	}
}

func TestParseKubeConfig_InvalidJSON(t *testing.T) {
	store := kubeconfig.NewContextStore()
	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       store,
				EnableDynamicClusters: true,
			},
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	handler := createHeadlampHandler(context.Background(), c)

	req, err := http.NewRequestWithContext(
		context.Background(), "POST", "/parseKubeConfig",
		httpBodyFromString("{not valid json"),
	)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMarshalCustomObject_UnmarshalError(t *testing.T) {
	mockInfo := &runtime.Unknown{
		Raw: []byte(`[1,2,3]`),
	}

	_, err := MarshalCustomObject(mockInfo, "ctx")
	assert.Error(t, err, "expected unmarshal error for non-object JSON")
}

func TestMarshalCustomObject_EmptyCustomName(t *testing.T) {
	mockInfo := &runtime.Unknown{
		Raw: []byte(`{}`),
	}

	obj, err := MarshalCustomObject(mockInfo, "ctx")
	assert.NoError(t, err)
	assert.Empty(t, obj.CustomName)
}

func newStatelessTestConfig(store kubeconfig.ContextStore) *HeadlampConfig {
	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
			},
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
}

func TestSetKeyInCache_NewContext(t *testing.T) {
	store := kubeconfig.NewContextStore()
	c := newStatelessTestConfig(store)

	ctx := kubeconfig.Context{Name: "new-context"}

	err := c.setKeyInCache("new-context", ctx)
	assert.NoError(t, err)
}

func TestSetKeyInCache_ExistingContext_UpdatesTTL(t *testing.T) {
	store := kubeconfig.NewContextStore()
	c := newStatelessTestConfig(store)

	ctx := kubeconfig.Context{Name: "existing"}

	err := c.setKeyInCache("existing", ctx)
	require.NoError(t, err)

	err = c.setKeyInCache("existing", ctx)
	assert.NoError(t, err)
}

func TestHandleStatelessReq_InvalidKubeConfig(t *testing.T) {
	store := kubeconfig.NewContextStore()
	c := newStatelessTestConfig(store)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/test/api", nil)

	_, err := c.handleStatelessReq(req, "!!not-valid-base64!!")
	assert.Error(t, err)
}

func TestHandleStatelessReq_ValidKubeConfig(t *testing.T) {
	kubeConfigByte, err := os.ReadFile("./headlamp_testdata/kubeconfig")
	require.NoError(t, err)

	kubeConfig := base64.StdEncoding.EncodeToString(kubeConfigByte)

	store := kubeconfig.NewContextStore()
	c := newStatelessTestConfig(store)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/minikube/api/v1/pods", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "minikube"})
	req.Header.Set("X-HEADLAMP-USER-ID", "user-123")

	key, err := c.handleStatelessReq(req, kubeConfig)
	assert.NoError(t, err)
	assert.NotEmpty(t, key)
}

func TestProcessStatelessContext_MultiContext_EachKeyedIndependently(t *testing.T) {
	store := kubeconfig.NewContextStore()
	c := newStatelessTestConfig(store)

	userID := "user1"
	clusterName := "cluster-a"
	baseKey := clusterName + userID

	ctxA := kubeconfig.Context{
		Name:        "cluster-a",
		KubeContext: &api.Context{Cluster: "cluster-a"},
		Cluster:     &api.Cluster{Server: "https://a.example.com"},
	}
	ctxB := kubeconfig.Context{
		Name:        "cluster-b",
		KubeContext: &api.Context{Cluster: "cluster-b"},
		Cluster:     &api.Cluster{Server: "https://b.example.com"},
	}

	keyA, err := c.processStatelessContext(ctxA, baseKey, clusterName, userID)
	require.NoError(t, err)
	assert.Equal(t, baseKey, keyA)

	keyB, err := c.processStatelessContext(ctxB, baseKey, clusterName, userID)
	require.NoError(t, err)
	assert.Empty(t, keyB, "context not matching clusterName and with no headlamp_info must be skipped")

	_, errA := store.GetContext("cluster-a" + userID)
	assert.NoError(t, errA)

	_, errB := store.GetContext("cluster-b" + userID)
	assert.Error(t, errB, "cluster-b must not have been added to the store")
}

func newDynamicConfig() *HeadlampConfig {
	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       kubeconfig.NewContextStore(),
				EnableDynamicClusters: true,
			},
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
}

func TestParseKubeConfig_EmptyKubeconfigs(t *testing.T) {
	handler := createHeadlampHandler(context.Background(), newDynamicConfig())

	rr, err := getResponseFromRestrictedEndpoint(
		handler, "POST", "/parseKubeConfig",
		KubeconfigRequest{Kubeconfigs: []string{}},
	)
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestParseKubeConfig_InvalidBase64Entry(t *testing.T) {
	handler := createHeadlampHandler(context.Background(), newDynamicConfig())

	rr, err := getResponseFromRestrictedEndpoint(
		handler, "POST", "/parseKubeConfig",
		KubeconfigRequest{Kubeconfigs: []string{"!!not-base64!!"}},
	)
	require.NoError(t, err)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func newContextKeyTestConfig(dynamic bool) *HeadlampConfig {
	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       kubeconfig.NewContextStore(),
				EnableDynamicClusters: dynamic,
			},
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
}

func TestGetContextKeyForRequest_PlainRequest(t *testing.T) {
	c := newContextKeyTestConfig(false)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/mycluster/api", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "mycluster"})

	key, err := c.getContextKeyForRequest(req)
	assert.NoError(t, err)
	assert.Equal(t, "mycluster", key)
}

func TestGetContextKeyForRequest_WebSocketUpgrade(t *testing.T) {
	c := newContextKeyTestConfig(false)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/mycluster/api", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "mycluster"})
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-Websocket-Protocol",
		"base64url.headlamp.authorization.k8s.io.user42, v4.channel.k8s.io")

	key, err := c.getContextKeyForRequest(req)
	assert.NoError(t, err)
	assert.Equal(t, "myclusteruser42", key)
}
