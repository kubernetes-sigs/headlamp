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

package config

import (
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigParseAndDirHelpers(t *testing.T) {
	t.Run("parseFlags returns error on unknown flag", func(t *testing.T) {
		fs := flag.NewFlagSet("test", flag.ContinueOnError)
		require.Error(t, parseFlags(fs, []string{"--nonexistent-flag"}))
	})

	t.Run("defaultPluginDir, defaultUserPluginDir, and GetDefaultKubeConfigPath", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)
		t.Setenv("USERPROFILE", home)
		t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
		t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))

		assert.NotEmpty(t, defaultPluginDir())
		assert.NotEmpty(t, defaultUserPluginDir())

		kcPath, err := GetDefaultKubeConfigPath()
		require.NoError(t, err)
		assert.Contains(t, kcPath, ".kube")
	})

	t.Run("MakeKubeConfigsDir errors when parent is a file", func(t *testing.T) {
		tmpFile := filepath.Join(t.TempDir(), "not-a-dir")
		require.NoError(t, os.WriteFile(tmpFile, []byte("x"), 0o600))

		_, err := MakeKubeConfigsDir(filepath.Join(tmpFile, "kubeconfigs"))
		require.Error(t, err)
	})

	t.Run("setKubeConfigPath sets default when empty and not in-cluster", func(t *testing.T) {
		t.Setenv("HOME", t.TempDir())

		cfg := &Config{InCluster: false, KubeConfigPath: ""}
		require.NoError(t, setKubeConfigPath(cfg))
		assert.NotEmpty(t, cfg.KubeConfigPath)
	})
}
