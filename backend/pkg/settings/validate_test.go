/*
Copyright 2026 The Kubernetes Authors

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

package settings_test

import (
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/settings"
	"github.com/stretchr/testify/require"
)

func TestValidateValidDocuments(t *testing.T) {
	t.Run("empty object", func(t *testing.T) {
		require.NoError(t, settings.Validate([]byte(`{}`)))
	})

	t.Run("short form clusterDefinedSettings and string theme", func(t *testing.T) {
		doc := `{
			"clusterDefinedSettings": ["*", "prod"],
			"defaults": {
				"theme": "dark",
				"clusters": {
					"prod": {
						"nodeShellTerminal": {
							"$display": "hidden",
							"$value": {"isEnabled": false}
						}
					}
				}
			}
		}`
		require.NoError(t, settings.Validate([]byte(doc)))
	})
}

func TestValidateFullDocument(t *testing.T) {
	doc := `{
		"clusterDefinedSettings": {
			"*": [
				{"name": "headlamp-settings"},
				{"name": "headlamp-secrets", "type": "secret", "namespace": "headlamp-tools"}
			],
			"prod": [
				{"name": "prod-settings", "type": "ConfigMap"}
			]
		},
		"defaults": {
			"tableRowsPerPageOptions": [10, 20, 50],
			"timezone": {"$display": "disabled", "$value": "UTC"},
			"sidebarSortAlphabetically": true,
			"expandLargeGraph": false,
			"useEvict": {"$display": "disabled", "$value": true},
			"tutorialTooltips": false,
			"theme": {"$display": "disabled", "$value": {"light": "headlamp-light", "dark": "corporate-dark"}},
			"clusters": {
				"*": {
					"defaultNamespace": "default",
					"allowedNamespaces": ["default", "kube-system"],
					"allowedNamespacesSelector": "env=prod",
					"currentName": "main",
					"nodeShellTerminal": {
						"linuxImage": {"$display": "disabled", "$value": "busybox:1.36"},
						"namespace": "kube-system",
						"isEnabled": {"$display": "disabled", "$value": false}
					},
					"podDebugTerminal": {
						"debugImage": "busybox:1.36",
						"isEnabled": true
					},
					"appearance": {
						"accentColor": "#1976d2",
						"icon": "mdi:kubernetes"
					}
				}
			},
			"plugins": {
				"headlamp-ai-assistant": {
					"provider": {"$display": "hidden", "$value": "azure-openai"}
				},
				"headlamp-prometheus": {
					"address": {"$clusterDefined": ["*"], "$value": "http://localhost:9090"},
					"nested": {"enabled": true, "interval": 30}
				}
			}
		}
	}`
	require.NoError(t, settings.Validate([]byte(doc)))
}

func TestValidateInvalidStructureAndKeys(t *testing.T) {
	invalidDocs := map[string]string{
		"invalid json syntax":                  `{not json`,
		"non-object root array":                `["defaults"]`,
		"non-object root null":                 `null`,
		"unknown top-level settings key":       `{"settings": {"tableRowsPerPageOptions": [10, 20]}}`,
		"top-level clusters outside defaults":  `{"clusters": {"*": {"nodeShellTerminal": {"isEnabled": false}}}}`,
		"unknown key inside defaults":          `{"defaults": {"tableRowsPerPage": [10, 20]}}`,
		"unknown key inside nodeShellTerminal": `{"defaults":{"clusters":{"*":{"nodeShellTerminal":{"image":"x"}}}}}`,
		"clusterDefinedSettings missing name":  `{"clusterDefinedSettings": {"*": [{"type": "configmap"}]}}`,
		"clusterDefinedSettings invalid type":  `{"clusterDefinedSettings": {"*": [{"name": "cm", "type": "bad"}]}}`,
	}

	for name, data := range invalidDocs {
		t.Run(name, func(t *testing.T) {
			require.Error(t, settings.Validate([]byte(data)))
		})
	}
}

func TestValidateInvalidValuesAndWrappers(t *testing.T) {
	invalidDocs := map[string]string{
		"wrong value type for tableRowsPerPageOptions": `{"defaults": {"tableRowsPerPageOptions": ["10", "20"]}}`,
		"empty array for tableRowsPerPageOptions":      `{"defaults": {"tableRowsPerPageOptions": []}}`,
		"non-positive tableRowsPerPageOptions":         `{"defaults": {"tableRowsPerPageOptions": [0, 10]}}`,
		"wrapper missing $value":                       `{"defaults": {"timezone": {"$display": "hidden"}}}`,
		"wrapper invalid $display mode":                `{"defaults":{"timezone":{"$display":"readonly","$value":"UTC"}}}`,
		"plugin wrapper missing $value":                `{"defaults":{"plugins":{"my-plugin":{"k":{"$display":"hidden"}}}}}`,
	}

	for name, data := range invalidDocs {
		t.Run(name, func(t *testing.T) {
			require.Error(t, settings.Validate([]byte(data)))
		})
	}
}
