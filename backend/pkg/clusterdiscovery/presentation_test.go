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

package clusterdiscovery_test

import (
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterdiscovery"
	"github.com/stretchr/testify/require"
)

func TestClientSourceViewsRetainsEmptyConfiguredSources(t *testing.T) {
	registry := clusterdiscovery.BuiltinSources()
	views := clusterdiscovery.ClientSourceViews(registry, map[string]clusterdiscovery.Settings{
		"cluster_inventory": {Enabled: true},
	})
	require.Len(t, views, 4)
	require.Equal(t, "Cluster Inventory API", views[3].Label)
	require.Equal(t, "ClusterProfile", views[3].NameLabel)
	require.Equal(t, []string{"namespace", "provider"}, views[3].SummaryFields)
	require.True(t, views[3].Configured)
	require.Len(t, clusterdiscovery.ClientSourceViews(registry, nil), 3)
}
