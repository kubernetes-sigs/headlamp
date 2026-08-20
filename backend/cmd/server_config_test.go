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
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildHeadlampCFG(t *testing.T) {
	store := kubeconfig.NewContextStore()

	t.Run("maps basic fields and splits proxy urls", func(t *testing.T) {
		conf := &config.Config{
			Port:                       4444,
			InCluster:                  true,
			InClusterContextName:       "test-incluster",
			InsecureSsl:                true,
			KubeConfigDir:              "/kubeconfigs",
			PluginsDir:                 "/plugins",
			UserPluginsDir:             "/user-plugins",
			AllowKubeconfigChanges:     true,
			WatchPluginsChanges:        false,
			BaseURL:                    "/headlamp",
			ProxyURLs:                  "http://proxy1,http://proxy2",
			ClusterInventoryNamespaces: "team-a,team-b",
		}

		headlampCFG := buildHeadlampCFG(conf, store)

		assert.Equal(t, uint(4444), headlampCFG.Port)
		assert.True(t, headlampCFG.UseInCluster)
		assert.Equal(t, "test-incluster", headlampCFG.InClusterContextName)
		assert.True(t, headlampCFG.Insecure)
		assert.Equal(t, "/kubeconfigs", headlampCFG.KubeConfigDir)
		assert.Equal(t, "/plugins", headlampCFG.PluginDir)
		assert.Equal(t, "/user-plugins", headlampCFG.UserPluginDir)
		assert.True(t, headlampCFG.AllowKubeconfigChanges)
		assert.False(t, headlampCFG.WatchPluginsChanges)
		assert.Equal(t, "/headlamp", headlampCFG.BaseURL)
		assert.Equal(t, []string{"http://proxy1", "http://proxy2"}, headlampCFG.ProxyURLs)
		assert.Equal(t, store, headlampCFG.KubeConfigStore)
		assert.Equal(t, "team-a,team-b", headlampCFG.ClusterInventoryNamespaces)
	})

	t.Run("empty proxy urls yields empty slice", func(t *testing.T) {
		conf := &config.Config{ProxyURLs: ""}

		headlampCFG := buildHeadlampCFG(conf, store)

		assert.Empty(t, headlampCFG.ProxyURLs)
	})
}

func TestLoadAdminSettings(t *testing.T) {
	writeSettings := func(t *testing.T, contents string) string {
		t.Helper()

		path := filepath.Join(t.TempDir(), "settings.json")
		require.NoError(t, os.WriteFile(path, []byte(contents), 0o600))

		return path
	}

	t.Run("no path yields no settings", func(t *testing.T) {
		settings, err := loadAdminSettings("")

		require.NoError(t, err)
		assert.Nil(t, settings)
	})

	t.Run("valid json is passed through verbatim", func(t *testing.T) {
		contents := `{"settings":{"tableRowsPerPageOptions":{"$value":[10,20]}}}`
		settings, err := loadAdminSettings(writeSettings(t, contents))

		require.NoError(t, err)
		assert.JSONEq(t, contents, string(settings))
	})

	t.Run("missing file is an error", func(t *testing.T) {
		_, err := loadAdminSettings(filepath.Join(t.TempDir(), "absent.json"))

		require.ErrorContains(t, err, "reading settings file")
	})

	t.Run("invalid json is an error", func(t *testing.T) {
		_, err := loadAdminSettings(writeSettings(t, "{not json"))

		require.ErrorContains(t, err, "not valid JSON")
	})
}
