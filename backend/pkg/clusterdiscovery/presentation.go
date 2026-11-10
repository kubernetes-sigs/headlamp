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

package clusterdiscovery

// SourceColumn describes a public presentation field and its label.
type SourceColumn struct {
	// Key selects the value from the presentation fields of a connection.
	Key string `json:"key"`
	// Label is the untranslated header of the field.
	Label string `json:"label"`
}

// SourceView describes a source without requiring source-specific frontend code.
type SourceView struct {
	// ID is the source ID, which each connection of the source carries.
	ID string `json:"id"`
	// Label is the untranslated name of the source, shown as its tab title.
	Label string `json:"label"`
	// NameLabel is the untranslated header of the name column on the source's tab.
	NameLabel string `json:"nameLabel"`
	// Columns are added to the source's tab and to the connection details.
	Columns []SourceColumn `json:"columns,omitempty"`
	// DetailFields are shown only in the connection details.
	DetailFields []SourceColumn `json:"detailFields,omitempty"`
	// SummaryFields are the keys of the fields shown after the source name in cluster selectors.
	SummaryFields []string `json:"summaryFields,omitempty"`
	// Configured marks an enabled discovery source, which keeps its tab without connections.
	Configured bool `json:"configured,omitempty"`
}

// ClientSourceViews includes enabled discovery sources even when they have no connections.
func ClientSourceViews(registry *Registry, settings map[string]Settings) []SourceView {
	views := []SourceView{
		{ID: "kubeconfig", Label: "Kubeconfig", NameLabel: "Context", Columns: []SourceColumn{
			{Key: "cluster", Label: "Cluster"},
			{Key: "contextNamespace", Label: "Context namespace"},
			{Key: "file", Label: "Kubeconfig file"},
		}, SummaryFields: []string{"contextNamespace", "file"}},
		{ID: "incluster", Label: "In-cluster", NameLabel: "Name"},
		{ID: "dynamic_cluster", Label: "Plugin", NameLabel: "Name"},
	}

	for _, source := range registry.Sources() {
		d := source.Descriptor()
		if !settings[d.ID].Enabled {
			continue
		}

		view := d.View

		view.ID, view.Label, view.Configured = d.ID, d.DisplayName, true
		if view.NameLabel == "" {
			view.NameLabel = "Name"
		}

		views = append(views, view)
	}

	return views
}
