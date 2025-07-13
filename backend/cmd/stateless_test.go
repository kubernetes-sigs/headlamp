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
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
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
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			cache := cache.New[interface{}]()
			kubeConfigStore := kubeconfig.NewContextStore()
			c := HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					UseInCluster:          false,
					KubeConfigPath:        "",
					EnableDynamicClusters: true,
					KubeConfigStore:       kubeConfigStore,
				},
				cache: cache,
			}
			handler := createHeadlampHandler(&c)

			for _, clusterReq := range tc.clusters {
				r, err := getResponseFromRestrictedEndpoint(handler, "POST", "/parseKubeConfig", clusterReq)
				if err != nil {
					t.Fatal(err)
				}

				assert.Equal(t, r.Code, tc.expectedState)

				// Verify if the created cluster matches what we asked to be created
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
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			cache := cache.New[interface{}]()
			kubeConfigStore := kubeconfig.NewContextStore()
			c := HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					UseInCluster: false, KubeConfigPath: "",
					EnableDynamicClusters: true,
					KubeConfigStore:       kubeConfigStore,
				},
				cache:            cache,
				telemetryConfig:  GetDefaultTestTelemetryConfig(),
				telemetryHandler: &telemetry.RequestHandler{},
			}
			handler := createHeadlampHandler(&c)
			headers := map[string]string{
				"KUBECONFIG":         kubeConfig,
				"X-HEADLAMP-USER-ID": tc.userID,
			}
			requestPath := fmt.Sprintf("/clusters/%s/version/", tc.name)
			req, err := http.NewRequest("GET", requestPath, nil) //nolint:noctx
			require.NoError(t, err)

			// Add headers to the request
			for key, value := range headers {
				req.Header.Add(key, value)
			}

			// Perform the request
			resp := httptest.NewRecorder()
			handler.ServeHTTP(resp, req)

			configuredClusters := c.getClusters()

			var cluster *Cluster

			// Get cluster we created
			for i, val := range configuredClusters {
				if val.Name == tc.name {
					cluster = &configuredClusters[i]
					break
				}
			}

			// Assert the response as needed
			assert.NotNil(t, cluster)
			assert.Equal(t, tc.name, cluster.Name)
		})
	}
}

func TestMarshalCustomObject(t *testing.T) {
	// Create a mock runtime.Unknown object
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
			req := httptest.NewRequest("GET", "/", nil)
			req.Header.Set("Sec-Websocket-Protocol", tc.protocols)

			key := websocketConnContextKey(req, tc.clusterName)
			assert.Equal(t, tc.expectedKey, key)
			assert.Equal(t, tc.expectedHeader, req.Header.Get("Sec-Websocket-Protocol"))
		})
	}
}
