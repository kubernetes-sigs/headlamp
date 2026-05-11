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

package plugins_test

import (
	"context"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWatch(t *testing.T) {
	t.Parallel()

	dirName := t.TempDir()
	// create channel to receive events
	events := make(chan string, 32)
	ready := make(chan struct{}, 1)
	ctx, cancel := context.WithCancel(context.Background())

	defer cancel()

	go plugins.Watch(ctx, dirName, events, ready)

	waitForWatcherReady(t, ready)

	t.Run("CreateFile", func(t *testing.T) {
		fileName := filepath.Join(dirName, uuid.NewString())
		f, err := os.Create(fileName) //nolint:gosec
		require.NoError(t, err)

		_ = f.Close()

		expectedEvent := filepath.Clean(fileName) + ":CREATE"
		event := waitForPluginEvent(t, events, expectedEvent)
		require.Equal(t, expectedEvent, event)
	})

	t.Run("CreateAndObserveSubdir", func(t *testing.T) {
		subDirName := filepath.Join(dirName, uuid.NewString())
		err := os.Mkdir(subDirName, 0o750)
		require.NoError(t, err)

		expectedEvent := filepath.Clean(subDirName) + ":CREATE"
		event := waitForPluginEvent(t, events, expectedEvent)
		require.Equal(t, expectedEvent, event)

		subFileName := filepath.Join(subDirName, uuid.NewString())
		f, err := os.Create(subFileName) //nolint:gosec
		require.NoError(t, err)

		_ = f.Close()

		expectedEvent = filepath.Clean(subFileName) + ":CREATE"
		event = waitForPluginEvent(t, events, expectedEvent)
		require.Equal(t, expectedEvent, event)

		err = os.Remove(subFileName)
		require.NoError(t, err)

		expectedEvent = filepath.Clean(subFileName) + ":REMOVE"
		event = waitForPluginEvent(t, events, expectedEvent)
		require.Equal(t, expectedEvent, event)
	})
}

func waitForWatcherReady(t *testing.T, ready <-chan struct{}) {
	t.Helper()

	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for watcher to be ready")
	}
}

func waitForPluginEvent(t *testing.T, events <-chan string, expected string) string {
	t.Helper()

	timeout := time.After(10 * time.Second)

	for {
		select {
		case event := <-events:
			if event == expected {
				return event
			}
		case <-timeout:
			return ""
		}
	}
}

func TestGeneratePluginPaths(t *testing.T) { //nolint:funlen
	// create a new directory using t.TempDir()
	testDirName := t.TempDir()

	var err error

	t.Run("PluginPaths", func(t *testing.T) {
		// create a new directory in dirName
		subDirName := uuid.NewString()
		subDir := filepath.Join(testDirName, subDirName)
		err = os.Mkdir(subDir, 0o750)
		require.NoError(t, err)

		// create main.js and package.json in the sub directory
		pluginPath := filepath.Join(subDir, "main.js")
		fPlugin, err := os.Create(pluginPath) //nolint:gosec
		require.NoError(t, err)

		_ = fPlugin.Close()

		packageJSONPath := filepath.Join(subDir, "package.json")
		fPkg, err := os.Create(packageJSONPath) //nolint:gosec
		require.NoError(t, err)

		_ = fPkg.Close()

		pathList, err := plugins.GeneratePluginPaths("", "", testDirName)
		require.NoError(t, err)
		require.Len(t, pathList, 1)
		require.Equal(t, "plugins/"+subDirName, pathList[0].Path)
		require.Equal(t, "development", pathList[0].Type)

		// delete the sub directory
		err = os.RemoveAll(subDir)
		require.NoError(t, err)

		// test without any valid plugin
		pathList, err = plugins.GeneratePluginPaths("", "", testDirName)
		require.NoError(t, err)
		require.Empty(t, pathList)
	})

	t.Run("StaticPluginPaths", func(t *testing.T) {
		// create a new directory in dirName
		subDirName := uuid.NewString()
		subDir := filepath.Join(testDirName, subDirName)
		err = os.Mkdir(subDir, 0o750)
		require.NoError(t, err)

		// create main.js and package.json in the sub directory
		pluginPath := filepath.Join(subDir, "main.js")
		fPlugin, err := os.Create(pluginPath) //nolint:gosec
		require.NoError(t, err)

		_ = fPlugin.Close()

		packageJSONPath := filepath.Join(subDir, "package.json")
		fPkg, err := os.Create(packageJSONPath) //nolint:gosec
		require.NoError(t, err)

		_ = fPkg.Close()

		pathList, err := plugins.GeneratePluginPaths(testDirName, "", "")
		require.NoError(t, err)
		require.Len(t, pathList, 1)
		require.Equal(t, "static-plugins/"+subDirName, pathList[0].Path)
		require.Equal(t, "shipped", pathList[0].Type)

		// delete the sub directory
		err = os.RemoveAll(subDir)
		require.NoError(t, err)

		// test without any valid plugin
		pathList, err = plugins.GeneratePluginPaths(testDirName, "", "")
		require.NoError(t, err)
		require.Empty(t, pathList)
	})

	t.Run("InvalidPluginPaths", func(t *testing.T) {
		// create a new directory in test dir
		subDirName := uuid.NewString()
		subDir := filepath.Join(testDirName, subDirName)
		err = os.Mkdir(subDir, 0o750)
		require.NoError(t, err)

		// create random file in the sub directory
		fileName := filepath.Join(subDir, uuid.NewString())
		f, err := os.Create(fileName) //nolint:gosec
		require.NoError(t, err)

		_ = f.Close()

		// test with file as plugin Dir
		pathList, err := plugins.GeneratePluginPaths(fileName, "", "")
		assert.Error(t, err)
		assert.Nil(t, pathList)
	})
}

// createPlugin creates a plugin directory with main.js and package.json.
func createPlugin(t *testing.T, baseDir string, pluginName string) string {
	t.Helper()

	pluginDir := filepath.Join(baseDir, pluginName)
	err := os.Mkdir(pluginDir, 0o750)
	require.NoError(t, err)

	// create main.js
	mainJsPath := filepath.Join(pluginDir, "main.js")
	f, err := os.Create(mainJsPath) //nolint:gosec
	require.NoError(t, err)

	_ = f.Close()

	// create package.json
	packageJSONPath := filepath.Join(pluginDir, "package.json")
	f, err = os.Create(packageJSONPath) //nolint:gosec
	require.NoError(t, err)

	_ = f.Close()

	return pluginDir
}

// logEntry captures a structured log event for test assertions.
type logEntry struct {
	msg    string
	fields map[string]string
}

const (
	msgFoundPlugin    = "Found plugin"
	testDevPluginName = "dev-plugin-1"
)

func TestListPlugins(t *testing.T) { //nolint:funlen
	// Capture log output via logger.SetLogFunc.
	var logEntries []logEntry

	originalLogFunc := logger.SetLogFunc(
		func(_ uint, fields map[string]string, _ interface{}, msg string) {
			logEntries = append(logEntries, logEntry{msg: msg, fields: fields})
		},
	)
	defer logger.SetLogFunc(originalLogFunc)

	// Use t.TempDir() for automatic cleanup.
	staticPluginDir := t.TempDir()
	pluginDir := t.TempDir()
	userPluginDir := t.TempDir()

	createPlugin(t, staticPluginDir, "static-plugin-1")
	createPlugin(t, userPluginDir, "user-plugin-1")
	plugin1Dir := createPlugin(t, pluginDir, testDevPluginName)

	// ListPlugins should succeed and emit log messages.
	err := plugins.ListPlugins(staticPluginDir, userPluginDir, pluginDir)
	require.NoError(t, err)

	// Collect all messages for Contains checks.
	messages := make([]string, 0, len(logEntries))
	for _, e := range logEntries {
		messages = append(messages, e.msg)
	}

	assert.Contains(t, messages, "Listing shipped plugins")
	assert.Contains(t, messages, "Listing user-installed plugins")
	assert.Contains(t, messages, "Listing development plugins")
	assert.Contains(t, messages, msgFoundPlugin)

	// Verify structured fields on "Found plugin" entries.
	for _, e := range logEntries {
		if e.msg == msgFoundPlugin {
			assert.NotEmpty(t, e.fields["plugin"], "plugin field should be set")
			assert.NotEmpty(t, e.fields["type"], "type field should be set")
		}
	}

	// Reset captured logs.
	logEntries = nil

	// test missing package.json — should still succeed (falls back to folder name).
	_ = os.Remove(filepath.Join(plugin1Dir, "package.json"))

	err = plugins.ListPlugins(staticPluginDir, userPluginDir, pluginDir)
	require.NoError(t, err)

	// Verify fallback: plugin name should be the folder name when package.json is missing.
	foundFallback := false

	for _, e := range logEntries {
		if e.msg == msgFoundPlugin && e.fields["plugin"] == testDevPluginName {
			foundFallback = true

			break
		}
	}

	assert.True(t, foundFallback, "should fall back to folder name when package.json is missing")

	// Reset captured logs.
	logEntries = nil

	// test invalid package.json — should still succeed (falls back to folder name).
	err = os.WriteFile(filepath.Join(plugin1Dir, "package.json"), []byte("invalid json"), 0o600)
	require.NoError(t, err)

	err = plugins.ListPlugins(staticPluginDir, userPluginDir, pluginDir)
	require.NoError(t, err)

	// Verify fallback: plugin name should be the folder name when package.json is invalid.
	foundFallback = false

	for _, e := range logEntries {
		if e.msg == msgFoundPlugin && e.fields["plugin"] == testDevPluginName {
			foundFallback = true

			break
		}
	}

	assert.True(t, foundFallback, "should fall back to folder name when package.json is invalid")
}

func TestHandlePluginEvents(t *testing.T) { //nolint:funlen
	// create a new directory
	testDirPath := t.TempDir()

	// create a new directory for plugin
	pluginDirName := uuid.NewString()
	pluginDirPath := filepath.Join(testDirPath, pluginDirName)
	err := os.Mkdir(pluginDirPath, 0o750)
	require.NoError(t, err)

	// create main.js and package.json in the sub directory
	pluginPath := filepath.Join(pluginDirPath, "main.js")
	f, err := os.Create(pluginPath) //nolint:gosec
	require.NoError(t, err)

	_ = f.Close()

	packageJSONPath := filepath.Join(pluginDirPath, "package.json")
	f, err = os.Create(packageJSONPath) //nolint:gosec
	require.NoError(t, err)

	_ = f.Close()

	// create channel to receive events
	events := make(chan string)

	// create cache
	ch := cache.New[interface{}]()

	go plugins.HandlePluginEvents("", "", testDirPath, events, ch)

	// plugin list key should be empty
	pluginList, err := ch.Get(context.Background(), plugins.PluginListKey)
	require.EqualError(t, err, cache.ErrNotFound.Error())
	require.Nil(t, pluginList)

	// plugin refresh key should be empty
	pluginRefresh, err := ch.Get(context.Background(), plugins.PluginRefreshKey)
	require.EqualError(t, err, cache.ErrNotFound.Error())
	require.Nil(t, pluginRefresh)

	// send event
	events <- "test"

	// wait for the plugin list and refresh keys to be set
	for {
		_, err = ch.Get(context.Background(), plugins.PluginListKey)
		if err == nil {
			break
		}
	}

	// check if the plugin refresh key is set
	pluginRefresh, err = ch.Get(context.Background(), plugins.PluginRefreshKey)
	require.NoError(t, err)
	require.NotNil(t, pluginRefresh)

	// Refresh should be set to false as we cannot send the refresh request
	pluginRefreshBool, ok := pluginRefresh.(bool)
	require.True(t, ok)
	require.False(t, pluginRefreshBool)

	// Allow the plugins module to send the refresh request
	err = ch.Set(context.Background(), plugins.PluginCanSendRefreshKey, true)
	require.NoError(t, err)

	// Reset the plugin list again to test the plugin handling
	err = ch.Delete(context.Background(), plugins.PluginListKey)
	require.NoError(t, err)

	go plugins.HandlePluginEvents("", "", testDirPath, events, ch)

	// send event
	events <- "test"

	// wait for the plugin list and refresh keys to be set
	for {
		_, err = ch.Get(context.Background(), plugins.PluginListKey)
		if err == nil {
			break
		}
	}

	pluginRefresh, err = ch.Get(context.Background(), plugins.PluginRefreshKey)
	require.NoError(t, err)

	// Refresh should be set to true now that we can send the refresh request
	pluginRefreshBool, ok = pluginRefresh.(bool)
	require.True(t, ok)
	require.True(t, pluginRefreshBool)

	// check if the plugin list key is set
	pluginList, err = ch.Get(context.Background(), plugins.PluginListKey)
	require.NoError(t, err)
	require.NotNil(t, pluginList)

	pluginListArr, ok := pluginList.([]plugins.PluginMetadata)
	require.True(t, ok)
	require.Len(t, pluginListArr, 1)
	require.Equal(t, "plugins/"+pluginDirName, pluginListArr[0].Path)
	require.Equal(t, "development", pluginListArr[0].Type)

	// clean up
	err = os.RemoveAll(testDirPath)
	require.NoError(t, err)
}

func TestHandlePluginReload(t *testing.T) {
	// create cache
	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()

	// set plugin refresh key to true
	err := ch.Set(context.Background(), plugins.PluginRefreshKey, true)
	require.NoError(t, err)

	// call HandlePluginReload
	plugins.HandlePluginReload(ch, w)

	// verify that we cannot send the refresh request yet as the
	// canSendRefresh key is not set.
	assert.Equal(t, "", w.Header().Get("X-RELOAD"))

	err = ch.Set(context.Background(), plugins.PluginCanSendRefreshKey, false)
	require.NoError(t, err)

	// verify that we cannot send the refresh request yet as the
	// canSendRefresh key is false.
	plugins.HandlePluginReload(ch, w)
	assert.Equal(t, "", w.Header().Get("X-RELOAD"))

	err = ch.Set(context.Background(), plugins.PluginCanSendRefreshKey, true)
	require.NoError(t, err)

	// check if the header X-RELOAD is set to true
	plugins.HandlePluginReload(ch, w)
	assert.Equal(t, "reload", w.Header().Get("X-RELOAD"))

	// create new recorder
	w = httptest.NewRecorder()

	// call HandlePluginReload again
	plugins.HandlePluginReload(ch, w)

	// X-RELOAD header should not be set
	assert.Empty(t, w.Header().Get("X-RELOAD"))
}

func TestPopulatePluginsCache(t *testing.T) {
	// create cache
	ch := cache.New[interface{}]()

	// call PopulatePluginsCache
	plugins.PopulatePluginsCache("", "", "", ch)

	// check if the plugin refresh key is set to false
	pluginRefresh, err := ch.Get(context.Background(), plugins.PluginRefreshKey)
	require.NoError(t, err)

	pluginRefreshBool, ok := pluginRefresh.(bool)
	require.True(t, ok)
	require.False(t, pluginRefreshBool)

	// check if the plugin list key is set
	pluginList, err := ch.Get(context.Background(), plugins.PluginListKey)
	require.NoError(t, err)

	pluginListArr, ok := pluginList.([]plugins.PluginMetadata)
	require.True(t, ok)
	require.Empty(t, pluginListArr)
}

// TestDelete checks the Delete function.
//
//nolint:funlen
func TestDelete(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "testdelete")
	require.NoError(t, err)

	defer func() { _ = os.RemoveAll(tempDir) }() // clean up

	// Create user-plugins directory
	userPluginDir := filepath.Join(tempDir, "user-plugins")
	err = os.Mkdir(userPluginDir, 0o750)
	require.NoError(t, err)

	// Create development plugins directory
	devPluginDir := filepath.Join(tempDir, "plugins")
	err = os.Mkdir(devPluginDir, 0o750)
	require.NoError(t, err)

	// Create a user plugin
	userPluginPath := filepath.Join(userPluginDir, "user-plugin-1")
	err = os.Mkdir(userPluginPath, 0o750)
	require.NoError(t, err)

	// Create a dev plugin
	devPluginPath := filepath.Join(devPluginDir, "dev-plugin-1")
	err = os.Mkdir(devPluginPath, 0o750)
	require.NoError(t, err)

	// Create a plugin with the same name in both directories for type-specific deletion tests
	sharedPluginUser := filepath.Join(userPluginDir, "shared-plugin")
	err = os.Mkdir(sharedPluginUser, 0o750)
	require.NoError(t, err)

	sharedPluginDev := filepath.Join(devPluginDir, "shared-plugin")
	err = os.Mkdir(sharedPluginDev, 0o750)
	require.NoError(t, err)

	// Test cases
	tests := []struct {
		name          string
		userPluginDir string
		devPluginDir  string
		pluginName    string
		pluginType    string
		expectErr     bool
		errContains   string
	}{
		{
			name:          "Delete user plugin (no type specified)",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "user-plugin-1",
			pluginType:    "",
			expectErr:     false,
		},
		{
			name:          "Delete dev plugin (no type specified)",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "dev-plugin-1",
			pluginType:    "",
			expectErr:     false,
		},
		{
			name:          "Delete user plugin with type=user",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "shared-plugin",
			pluginType:    "user",
			expectErr:     false,
		},
		{
			name:          "Delete dev plugin with type=development",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "shared-plugin",
			pluginType:    "development",
			expectErr:     false,
		},
		{
			name:          "Invalid plugin type",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "shared-plugin",
			pluginType:    "invalid",
			expectErr:     true,
			errContains:   "invalid plugin type",
		},
		{
			name:          "Non-existent plugin with type=user",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "non-existent",
			pluginType:    "user",
			expectErr:     true,
			errContains:   "not found in user-plugins directory",
		},
		{
			name:          "Non-existent plugin with type=development",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "non-existent",
			pluginType:    "development",
			expectErr:     true,
			errContains:   "not found in development directory",
		},
		{
			name:          "Non-existent plugin (no type specified)",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "non-existent",
			pluginType:    "",
			expectErr:     true,
			errContains:   "not found or cannot be deleted",
		},
		{
			name:          "Directory traversal attempt",
			userPluginDir: userPluginDir,
			devPluginDir:  devPluginDir,
			pluginName:    "../",
			pluginType:    "",
			expectErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := plugins.Delete(tt.userPluginDir, tt.devPluginDir, tt.pluginName, tt.pluginType)
			if tt.expectErr {
				assert.Error(t, err, "Delete should return an error")

				if tt.errContains != "" {
					assert.Contains(t, err.Error(), tt.errContains)
				}
			} else {
				assert.NoError(t, err, "Delete should not return an error")
				// check if the plugin was deleted from the correct directory
				if tt.pluginType == "user" || (tt.pluginType == "" && tt.pluginName == "user-plugin-1") {
					userPath := filepath.Join(tt.userPluginDir, tt.pluginName)
					_, userErr := os.Stat(userPath)
					assert.True(t, os.IsNotExist(userErr), "User plugin should be deleted")
				} else if tt.pluginType == "development" || (tt.pluginType == "" && tt.pluginName == "dev-plugin-1") {
					devPath := filepath.Join(tt.devPluginDir, tt.pluginName)
					_, devErr := os.Stat(devPath)
					assert.True(t, os.IsNotExist(devErr), "Dev plugin should be deleted")
				}
			}
		})
	}
}
