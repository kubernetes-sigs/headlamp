/*
Copyright 2026 The Kubernetes Authors.

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
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
)

func TestConfigPublishesRegisteredSourceMetadata(t *testing.T) {
	for _, source := range []string{"cluster_api", "third_source"} {
		t.Run(source, func(t *testing.T) {
			connection := clusterInventoryConfigContext()
			connection.Source = kubeconfig.DiscoveredCluster
			connection.ClusterInventory = nil
			connection.Discovery = &kubeconfig.DiscoveryOrigin{Source: source, DisplayName: "Example discovery source"}
			require.NoError(t, connection.SetDiscoveryMetadata(map[string]json.RawMessage{
				"example": json.RawMessage(`{"name":"spoke"}`),
			}))

			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(connection))
			c := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store},
			}}
			recorder := httptest.NewRecorder()
			c.getConfig(recorder, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/config", nil))

			var config clientConfig
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &config))
			require.Len(t, config.Clusters, 1)
			metadata := config.Clusters[0].Metadata
			require.Equal(t, source, metadata["source"])
			require.Equal(t, "Example discovery source", metadata["sourceLabel"])
			require.Equal(t, false, metadata["canRename"])
			require.Equal(t, map[string]interface{}{"name": "spoke"}, metadata["example"])
		})
	}
}
