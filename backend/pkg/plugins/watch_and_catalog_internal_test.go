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

package plugins

import (
	"context"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListPluginsAndDirEntries(t *testing.T) {
	t.Run("ListPlugins with empty and populated dirs", func(t *testing.T) {
		staticDir := t.TempDir()
		userDir := t.TempDir()
		devDir := t.TempDir()

		pDir := filepath.Join(userDir, "my-plugin")
		require.NoError(t, os.MkdirAll(pDir, 0o750))
		require.NoError(t, os.WriteFile(filepath.Join(pDir, "main.js"), []byte("console.log(1)"), 0o600))
		require.NoError(t, os.WriteFile(filepath.Join(pDir, "package.json"), []byte(`{"name":"my-plugin"}`), 0o600))

		// Also add a non-dir file to exercise non-folder skip branch.
		require.NoError(t, os.WriteFile(filepath.Join(devDir, "not-a-dir.txt"), []byte("x"), 0o600))

		require.NoError(t, ListPlugins(staticDir, userDir, devDir))
	})

	t.Run("pluginDirEntries handles non-directory file", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "regular-file")
		require.NoError(t, os.WriteFile(filePath, []byte("hi"), 0o600))

		_, err := pluginDirEntries(filePath)
		require.ErrorContains(t, err, "not a directory")
	})

	t.Run("ListPlugins errors when dir is a regular file", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "regular-file")
		require.NoError(t, os.WriteFile(filePath, []byte("hi"), 0o600))

		require.Error(t, ListPlugins(filePath, "", ""))
	})
}

func TestHandlePluginEventsAndReload(t *testing.T) {
	t.Run("HandlePluginEvents skips CHMOD and updates cache on write", func(t *testing.T) {
		c := cache.New[interface{}]()
		require.NoError(t, c.Set(context.Background(), PluginCanSendRefreshKey, true))

		userDir := t.TempDir()
		pDir := filepath.Join(userDir, "p1")
		require.NoError(t, os.MkdirAll(pDir, 0o750))
		require.NoError(t, os.WriteFile(filepath.Join(pDir, "main.js"), []byte("1"), 0o600))

		ch := make(chan string, 2)
		ch <- "p1:CHMOD"

		ch <- "p1:WRITE"

		close(ch)

		HandlePluginEvents("", userDir, "", ch, c)

		val, err := c.Get(context.Background(), PluginRefreshKey)
		require.NoError(t, err)
		assert.Equal(t, true, val)

		rec := httptest.NewRecorder()
		HandlePluginReload(c, rec)
		assert.Equal(t, "reload", rec.Header().Get("X-Reload"))
	})

	t.Run("PopulatePluginsCache sets refresh false and populates list", func(t *testing.T) {
		c := cache.New[interface{}]()
		PopulatePluginsCache("", t.TempDir(), "", c)

		val, err := c.Get(context.Background(), PluginRefreshKey)
		require.NoError(t, err)
		assert.Equal(t, false, val)
	})

	t.Run("Delete rejects traversal and missing plugin", func(t *testing.T) {
		userDir := t.TempDir()
		require.Error(t, Delete(userDir, "", "../escape", ""))
		require.Error(t, Delete(userDir, "", "nonexistent", ""))

		pDir := filepath.Join(userDir, "deletable")
		require.NoError(t, os.MkdirAll(pDir, 0o750))
		require.NoError(t, Delete(userDir, "", "deletable", PluginTypeUser))

		_, err := os.Stat(pDir)
		assert.True(t, os.IsNotExist(err))
	})
}

func TestPluginsWatchAndCatalogHelpers(t *testing.T) {
	t.Run("Watch exits on cancelled context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		notify := make(chan string, 1)
		Watch(ctx, t.TempDir(), notify)
	})

	t.Run("generateSeparatePluginPaths errors on non-dir userPluginDir or pluginDir", func(t *testing.T) {
		f := filepath.Join(t.TempDir(), "not-a-dir")
		require.NoError(t, os.WriteFile(f, []byte("x"), 0o600))

		_, _, _, err := generateSeparatePluginPaths("", f, "")
		require.Error(t, err)

		_, _, _, err2 := generateSeparatePluginPaths("", "", f)
		require.Error(t, err2)
	})

	t.Run("isCatalogInstalledPlugin handles invalid JSON and missing file", func(t *testing.T) {
		parent := t.TempDir()
		require.NoError(t, os.MkdirAll(filepath.Join(parent, "p1"), 0o750))
		assert.False(t, isCatalogInstalledPlugin(parent, "p1"))

		require.NoError(t, os.WriteFile(filepath.Join(parent, "p1", "package.json"), []byte("{bad"), 0o600))
		assert.False(t, isCatalogInstalledPlugin(parent, "p1"))
	})

	t.Run("periodicallyWatchSubfolders walks subdirs and exits on cancel", func(t *testing.T) {
		rootDir := t.TempDir()
		subDir := filepath.Join(rootDir, "sub")
		require.NoError(t, os.MkdirAll(subDir, 0o750))
		require.NoError(t, os.WriteFile(filepath.Join(subDir, "main.js"), []byte("1"), 0o600))

		w, err := fsnotify.NewWatcher()
		require.NoError(t, err)

		defer func() { _ = w.Close() }()

		ctx, cancel := context.WithCancel(context.Background())
		notify := make(chan string, 10)
		ready := make(chan struct{}, 1)

		go func() {
			<-ready
			cancel()
		}()

		periodicallyWatchSubfolders(ctx, w, notify, rootDir, time.Hour, ready)
		assert.NotEmpty(t, notify)
	})
}
