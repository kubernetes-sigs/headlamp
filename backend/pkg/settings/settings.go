package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// DisplayMode controls how a setting appears in the UI.
type DisplayMode string

const (
	DisplayNormal   DisplayMode = "normal"
	DisplayDisabled DisplayMode = "disabled"
	DisplayHidden   DisplayMode = "hidden"
)

// Source describes where a cluster-defined setting comes from.
type Source struct {
	Name      string `json:"name"`
	Type      string `json:"type,omitempty"`      // "configmap" (default) or "secret"
	Namespace string `json:"namespace,omitempty"` // default: "headlamp-tools"
}

// AdminSettings is the parsed, unwrapped representation served to the frontend.
type AdminSettings struct {
	// Defaults contains plain values with $value/$display/$clusterDefined unwrapped.
	Defaults map[string]interface{} `json:"defaults"`
	// Display maps dotted paths to their display mode (only non-normal entries).
	Display map[string]DisplayMode `json:"display"`
	// ClusterDefinedSettings is the global cluster allow-list and sources config.
	ClusterDefinedSettings interface{} `json:"clusterDefinedSettings"`
	// ClusterDefined maps dotted paths to per-setting cluster allow-lists (overrides only).
	ClusterDefined map[string][]string `json:"clusterDefined"`
	// AllowedClusters is the resolved set of cluster names allowed to provide settings.
	// "*" means all clusters. Derived from ClusterDefinedSettings.
	AllowedClusters []string `json:"-"`
	// ClusterSources maps cluster name to its ordered list of sources.
	// "*" is the wildcard entry. Derived from ClusterDefinedSettings.
	ClusterSources map[string][]Source `json:"-"`
}

// rawFile is the on-disk JSON structure before unwrapping.
type rawFile struct {
	ClusterDefinedSettings json.RawMessage        `json:"clusterDefinedSettings"`
	Defaults               map[string]interface{} `json:"defaults"`
}

// Load reads and parses an admin settings file.
func Load(path string) (*AdminSettings, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading settings file: %w", err)
	}

	return Parse(data)
}

// Parse parses admin settings from raw JSON bytes.
func Parse(data []byte) (*AdminSettings, error) {
	var raw rawFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing settings JSON: %w", err)
	}

	result := &AdminSettings{
		Defaults:       make(map[string]interface{}),
		Display:        make(map[string]DisplayMode),
		ClusterDefined: make(map[string][]string),
		ClusterSources: make(map[string][]Source),
	}

	result.ClusterDefinedSettings = parseClusterDefinedSettingsRaw(raw.ClusterDefinedSettings)
	result.AllowedClusters, result.ClusterSources = resolveClusterDefinedSettings(raw.ClusterDefinedSettings)

	if raw.Defaults != nil {
		unwrapTree(raw.Defaults, "", result)
		result.Defaults = raw.Defaults
	}

	return result, nil
}

// unwrapTree recursively walks the defaults tree, extracts $value/$display/$clusterDefined
// wrappers, and replaces wrapped objects with their plain $value in-place.
func unwrapTree(m map[string]interface{}, prefix string, result *AdminSettings) {
	for key, val := range m {
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}

		obj, isObj := val.(map[string]interface{})
		if !isObj {
			continue
		}

		if rawVal, hasValue := obj["$value"]; hasValue {
			if d, ok := obj["$display"]; ok {
				if ds, ok := d.(string); ok {
					mode := DisplayMode(ds)
					if mode == DisplayDisabled || mode == DisplayHidden {
						result.Display[path] = mode
					}
				}
			}

			if cd, ok := obj["$clusterDefined"]; ok {
				if clusters := toStringSlice(cd); clusters != nil {
					result.ClusterDefined[path] = clusters
				}
			}

			// Replace the wrapped object with its plain value in the tree.
			m[key] = rawVal

			// If the unwrapped value is itself a map, recurse into it.
			if innerMap, ok := rawVal.(map[string]interface{}); ok {
				unwrapTree(innerMap, path, result)
			}
		} else {
			unwrapTree(obj, path, result)
		}
	}
}

// toStringSlice converts an interface{} that should be []interface{} of strings
// into a []string. Returns nil if the conversion fails.
func toStringSlice(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}

	result := make([]string, 0, len(arr))

	for _, item := range arr {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}

	return result
}

// parseClusterDefinedSettingsRaw converts the raw JSON into a typed value for serving.
func parseClusterDefinedSettingsRaw(raw json.RawMessage) interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}

	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return map[string]interface{}{}
	}

	return v
}

// resolveClusterDefinedSettings parses the clusterDefinedSettings into allowed clusters
// and per-cluster sources.
func resolveClusterDefinedSettings(raw json.RawMessage) ([]string, map[string][]Source) {
	if len(raw) == 0 {
		return nil, nil
	}

	// Try short form: array of cluster names.
	var shortForm []string
	if err := json.Unmarshal(raw, &shortForm); err == nil {
		if len(shortForm) == 0 {
			return nil, nil
		}

		sources := map[string][]Source{}
		for _, name := range shortForm {
			sources[name] = []Source{{Name: "headlamp-settings", Type: "configmap", Namespace: "headlamp-tools"}}
		}

		return shortForm, sources
	}

	// Try long form: map of cluster name -> []Source.
	var longForm map[string]json.RawMessage
	if err := json.Unmarshal(raw, &longForm); err != nil {
		return nil, nil
	}

	clusters := make([]string, 0, len(longForm))
	sources := make(map[string][]Source, len(longForm))

	for name, rawSources := range longForm {
		clusters = append(clusters, name)

		var srcs []Source
		if err := json.Unmarshal(rawSources, &srcs); err != nil {
			continue
		}

		for i := range srcs {
			if srcs[i].Type == "" {
				srcs[i].Type = "configmap"
			}

			if srcs[i].Namespace == "" {
				srcs[i].Namespace = "headlamp-tools"
			}
		}

		sources[name] = srcs
	}

	sort.Strings(clusters)

	return clusters, sources
}

// IsClusterAllowed checks if a cluster name is in the global allow-list.
func (s *AdminSettings) IsClusterAllowed(clusterName string) bool {
	for _, name := range s.AllowedClusters {
		if name == "*" || name == clusterName {
			return true
		}
	}

	return false
}

// SourcesForCluster returns the ordered list of sources for a given cluster.
// It merges wildcard sources with cluster-specific sources.
func (s *AdminSettings) SourcesForCluster(clusterName string) []Source {
	var result []Source

	if wildcard, ok := s.ClusterSources["*"]; ok {
		result = append(result, wildcard...)
	}

	if specific, ok := s.ClusterSources[clusterName]; ok && clusterName != "*" {
		result = append(result, specific...)
	}

	return deduplicateSources(result)
}

func deduplicateSources(sources []Source) []Source {
	seen := make(map[string]bool, len(sources))
	result := make([]Source, 0, len(sources))

	for _, s := range sources {
		key := s.Namespace + "/" + s.Name + "/" + s.Type
		if !seen[key] {
			seen[key] = true
			result = append(result, s)
		}
	}

	return result
}

// IsSettingClusterDefined checks if a specific setting path allows cluster-defined
// values from a given cluster name. It checks per-setting $clusterDefined first,
// then falls back to the global clusterDefinedSettings.
func (s *AdminSettings) IsSettingClusterDefined(path, clusterName string) bool {
	if clusters, ok := s.ClusterDefined[path]; ok {
		return matchesClusterList(clusters, clusterName)
	}

	return s.IsClusterAllowed(clusterName)
}

func matchesClusterList(clusters []string, clusterName string) bool {
	for _, c := range clusters {
		if c == "*" || c == clusterName {
			return true
		}
	}

	return false
}

// GetNestedValue retrieves a value from a nested map using a dotted path.
func GetNestedValue(m map[string]interface{}, path string) (interface{}, bool) {
	parts := strings.Split(path, ".")
	current := interface{}(m)

	for _, part := range parts {
		obj, ok := current.(map[string]interface{})
		if !ok {
			return nil, false
		}

		current, ok = obj[part]
		if !ok {
			return nil, false
		}
	}

	return current, true
}
