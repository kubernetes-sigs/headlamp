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

package pluginmanager_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/pluginmanager"
)

const validChecksum = "sha256:ed9a6aab3a24ed6fcea788a93f5c14edf91a7013986ba8dfa8471a5b60a8dc40"

func TestParseStateEmpty(t *testing.T) {
	state, err := pluginmanager.ParseState("")
	require.NoError(t, err)
	assert.Empty(t, state.Catalogs)
	assert.Empty(t, state.Plugins)
}

func TestParseStateValid(t *testing.T) {
	state, err := pluginmanager.ParseState(`{
		"catalogs": [
			{"id": "artifacthub", "name": "Artifact Hub", "type": "artifacthub", "url": "https://artifacthub.io"},
			{"id": "nexus", "name": "Nexus", "type": "index", "url": "https://nexus.example.com/index.json"}
		],
		"plugins": [
			{"name": "my-plugin", "version": "1.0.0",
			 "archiveUrl": "https://example.com/my-plugin.tar.gz",
			 "checksum": "` + validChecksum + `"}
		]
	}`)
	require.NoError(t, err)
	assert.Len(t, state.Catalogs, 2)
	assert.Len(t, state.Plugins, 1)
}

func TestParseStateRejectsInvalid(t *testing.T) {
	plugin := func(name, checksum string) string {
		return `{"name": "` + name + `", "archiveUrl": "https://x.example/a.tgz", "checksum": "` + checksum + `"}`
	}
	indexCatalog := `{"id": "a", "type": "index", "url": "https://x.example"}`

	cases := map[string]string{
		"bad json":          `{`,
		"bad catalog type":  `{"catalogs": [{"id": "x", "type": "oci", "url": "https://x.example"}]}`,
		"bad catalog url":   `{"catalogs": [{"id": "x", "type": "index", "url": "file:///etc/passwd"}]}`,
		"bad plugin name":   `{"plugins": [` + plugin("../evil", validChecksum) + `]}`,
		"bad checksum":      `{"plugins": [` + plugin("ok", "md5:abc") + `]}`,
		"duplicate plugin":  `{"plugins": [` + plugin("a", validChecksum) + `, ` + plugin("a", validChecksum) + `]}`,
		"duplicate catalog": `{"catalogs": [` + indexCatalog + `, ` + indexCatalog + `]}`,
		"catalog id not a DNS-1123 label": `{"catalogs": [` +
			`{"id": "My_Catalog", "type": "index", "url": "https://x.example"}]}`,
		"bad password secret name": `{"catalogs": [` +
			`{"id": "x", "type": "index", "url": "https://x.example", "passwordSecret": "Bad_Name"}]}`,
	}

	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := pluginmanager.ParseState(data)
			assert.Error(t, err)
		})
	}
}
