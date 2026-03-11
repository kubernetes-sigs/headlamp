package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse_FullExample(t *testing.T) {
	input := `{
		"clusterDefinedSettings": {},
		"defaults": {
			"theme": {
				"$display": "disabled",
				"$value": {
					"light": "headlamp-light",
					"dark": "corporate-dark"
				}
			},
			"timezone": "UTC",
			"tableRowsPerPage": [15, 25, 50],
			"useEvict": { "$display": "disabled", "$value": true },
			"clusters": {
				"*": {
					"nodeShellTerminal": {
						"linuxImage": { "$display": "disabled", "$value": "busybox:latest" }
					}
				},
				"production-cluster": {
					"nodeShellTerminal": {
						"isEnabled": { "$display": "disabled", "$value": false }
					}
				}
			},
			"plugins": {
				"headlamp-ai-assistant": {
					"provider": { "$display": "hidden", "$value": "azure-openai" },
					"endpoint": { "$display": "hidden", "$value": "https://corp.openai.azure.com" }
				},
				"headlamp-prometheus": {
					"address": {
						"$clusterDefined": ["*"],
						"$value": "http://localhost:9090"
					}
				}
			}
		}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	assert.Equal(t, DisplayDisabled, s.Display["theme"])
	assert.Equal(t, DisplayDisabled, s.Display["useEvict"])
	assert.Equal(t, DisplayDisabled, s.Display["clusters.*.nodeShellTerminal.linuxImage"])
	assert.Equal(t, DisplayDisabled, s.Display["clusters.production-cluster.nodeShellTerminal.isEnabled"])
	assert.Equal(t, DisplayHidden, s.Display["plugins.headlamp-ai-assistant.provider"])
	assert.Equal(t, DisplayHidden, s.Display["plugins.headlamp-ai-assistant.endpoint"])

	assert.Equal(t, []string{"*"}, s.ClusterDefined["plugins.headlamp-prometheus.address"])

	// Verify unwrapped values
	theme, ok := s.Defaults["theme"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "headlamp-light", theme["light"])
	assert.Equal(t, "corporate-dark", theme["dark"])

	assert.Equal(t, "UTC", s.Defaults["timezone"])
	assert.Equal(t, true, s.Defaults["useEvict"])

	plugins, ok := s.Defaults["plugins"].(map[string]interface{})
	require.True(t, ok)

	aiPlugin, ok := plugins["headlamp-ai-assistant"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "azure-openai", aiPlugin["provider"])
	assert.Equal(t, "https://corp.openai.azure.com", aiPlugin["endpoint"])

	promPlugin, ok := plugins["headlamp-prometheus"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "http://localhost:9090", promPlugin["address"])
}

func TestParse_PlainValues(t *testing.T) {
	input := `{
		"clusterDefinedSettings": [],
		"defaults": {
			"timezone": "UTC",
			"tableRowsPerPage": [15, 25, 50]
		}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	assert.Equal(t, "UTC", s.Defaults["timezone"])
	assert.Empty(t, s.Display)
	assert.Empty(t, s.ClusterDefined)
	assert.Empty(t, s.AllowedClusters)
}

func TestParse_ClusterDefinedSettings_ShortForm(t *testing.T) {
	input := `{
		"clusterDefinedSettings": ["*"],
		"defaults": {}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	assert.Equal(t, []string{"*"}, s.AllowedClusters)
	assert.Equal(t, []Source{{Name: "headlamp-settings", Type: "configmap"}}, s.ClusterSources["*"])
	assert.True(t, s.IsClusterAllowed("any-cluster"))
}

func TestParse_ClusterDefinedSettings_ShortFormNamed(t *testing.T) {
	input := `{
		"clusterDefinedSettings": ["prod", "dev"],
		"defaults": {}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	assert.True(t, s.IsClusterAllowed("prod"))
	assert.True(t, s.IsClusterAllowed("dev"))
	assert.False(t, s.IsClusterAllowed("staging"))
}

func TestParse_ClusterDefinedSettings_LongForm(t *testing.T) {
	input := `{
		"clusterDefinedSettings": {
			"*": [
				{ "name": "headlamp-settings" },
				{ "name": "headlamp-secrets", "type": "secret" }
			],
			"prod-cluster": [
				{ "name": "headlamp-settings" },
				{ "name": "headlamp-prod-secrets", "type": "secret" }
			]
		},
		"defaults": {}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	assert.True(t, s.IsClusterAllowed("prod-cluster"))
	assert.True(t, s.IsClusterAllowed("any-cluster"))

	wildcardSources := s.SourcesForCluster("random")
	assert.Equal(t, []Source{
		{Name: "headlamp-settings", Type: "configmap"},
		{Name: "headlamp-secrets", Type: "secret"},
	}, wildcardSources)

	prodSources := s.SourcesForCluster("prod-cluster")
	assert.Equal(t, []Source{
		{Name: "headlamp-settings", Type: "configmap"},
		{Name: "headlamp-secrets", Type: "secret"},
		{Name: "headlamp-prod-secrets", Type: "secret"},
	}, prodSources)
}

func TestParse_EmptyClusterDefinedSettings(t *testing.T) {
	input := `{
		"clusterDefinedSettings": {},
		"defaults": {}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	assert.False(t, s.IsClusterAllowed("any"))
	assert.Empty(t, s.AllowedClusters)
}

func TestIsSettingClusterDefined(t *testing.T) {
	input := `{
		"clusterDefinedSettings": ["*"],
		"defaults": {
			"globalSetting": "val",
			"restrictedSetting": {
				"$clusterDefined": [],
				"$value": "admin-only"
			},
			"prodOnlySetting": {
				"$clusterDefined": ["prod"],
				"$value": "prod-val"
			}
		}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	// globalSetting: no per-setting override, falls back to global (all clusters allowed)
	assert.True(t, s.IsSettingClusterDefined("globalSetting", "any-cluster"))

	// restrictedSetting: per-setting override with empty list (no clusters)
	assert.False(t, s.IsSettingClusterDefined("restrictedSetting", "any-cluster"))

	// prodOnlySetting: per-setting override for "prod" only
	assert.True(t, s.IsSettingClusterDefined("prodOnlySetting", "prod"))
	assert.False(t, s.IsSettingClusterDefined("prodOnlySetting", "dev"))
}

func TestParse_InvalidJSON(t *testing.T) {
	_, err := Parse([]byte("not json"))
	assert.ErrorContains(t, err, "parsing settings JSON")
}

func TestLoad_FileNotFound(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "nonexistent.json"))
	assert.ErrorContains(t, err, "reading settings file")
}

func TestLoad_ValidFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")

	content := `{
		"clusterDefinedSettings": [],
		"defaults": { "timezone": "America/New_York" }
	}`

	require.NoError(t, os.WriteFile(path, []byte(content), 0o644))

	s, err := Load(path)
	require.NoError(t, err)
	assert.Equal(t, "America/New_York", s.Defaults["timezone"])
}

func TestGetNestedValue(t *testing.T) {
	m := map[string]interface{}{
		"plugins": map[string]interface{}{
			"my-plugin": map[string]interface{}{
				"address": "http://localhost:9090",
			},
		},
		"topLevel": "val",
	}

	val, ok := GetNestedValue(m, "plugins.my-plugin.address")
	assert.True(t, ok)
	assert.Equal(t, "http://localhost:9090", val)

	val, ok = GetNestedValue(m, "topLevel")
	assert.True(t, ok)
	assert.Equal(t, "val", val)

	_, ok = GetNestedValue(m, "nonexistent.path")
	assert.False(t, ok)
}

func TestParse_DisplayNormalOmitted(t *testing.T) {
	input := `{
		"clusterDefinedSettings": [],
		"defaults": {
			"normalSetting": { "$display": "normal", "$value": "val" }
		}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	// "normal" display should not appear in the display map
	_, exists := s.Display["normalSetting"]
	assert.False(t, exists)
	assert.Equal(t, "val", s.Defaults["normalSetting"])
}

func TestParse_NestedWrappedValues(t *testing.T) {
	input := `{
		"clusterDefinedSettings": [],
		"defaults": {
			"clusters": {
				"*": {
					"nodeShellTerminal": {
						"linuxImage": { "$display": "disabled", "$value": "busybox:latest" },
						"namespace": "default"
					}
				}
			}
		}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	assert.Equal(t, DisplayDisabled, s.Display["clusters.*.nodeShellTerminal.linuxImage"])

	// Verify the nested structure is properly unwrapped
	clusters := s.Defaults["clusters"].(map[string]interface{})
	wildcard := clusters["*"].(map[string]interface{})
	nodeShell := wildcard["nodeShellTerminal"].(map[string]interface{})
	assert.Equal(t, "busybox:latest", nodeShell["linuxImage"])
	assert.Equal(t, "default", nodeShell["namespace"])
}

func TestAdminSettings_JSONSerialization(t *testing.T) {
	input := `{
		"clusterDefinedSettings": ["*"],
		"defaults": {
			"theme": { "$display": "disabled", "$value": { "light": "custom" } },
			"timezone": "UTC"
		}
	}`

	s, err := Parse([]byte(input))
	require.NoError(t, err)

	data, err := json.Marshal(s)
	require.NoError(t, err)

	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &result))

	// Verify the JSON has the expected top-level keys
	assert.Contains(t, result, "defaults")
	assert.Contains(t, result, "display")
	assert.Contains(t, result, "clusterDefinedSettings")
	assert.Contains(t, result, "clusterDefined")
}
