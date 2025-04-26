package plugins_test

import (
	"context"
	"io"
	"net/http/httptest"
	"os"
	"path"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWatch(t *testing.T) {
	t.Parallel()

	// Create a temporary directory if it doesn't exist
	_, err := os.Stat("/tmp/")
	if os.IsNotExist(err) {
		err = os.Mkdir("/tmp/", 0o755)
		require.NoError(t, err)
	}

	// create a new directory in /tmp
	dirName := path.Join("/tmp", uuid.NewString())
	err = os.Mkdir(dirName, 0o755)
	require.NoError(t, err)

	// create channel to receive events
	events := make(chan string)

	// start watching the directory
	go plugins.Watch(dirName, events)

	// wait for the watcher to be setup
	<-time.After(5 * time.Second)
	t.Log("watcher setup", "create a new file in the new directory")
	// create a new file in the new directory
	fileName := path.Join(dirName, uuid.NewString())
	_, err = os.Create(fileName)
	require.NoError(t, err)

	// wait for the watcher to pick up the new directory
	event := <-events
	require.Equal(t, fileName+":CREATE", event)
	t.Log("Got create file event in the new directory")

	// create a new file in a subdirectory
	subDirName := path.Join(dirName, uuid.NewString())
	err = os.Mkdir(subDirName, 0o755)
	require.NoError(t, err)

	// wait for the watcher to pick up the new file
	event = <-events
	require.Equal(t, subDirName+":CREATE", event)
	t.Log("Got create folder event in the directory")

	subFileName := path.Join(subDirName, uuid.NewString())
	_, err = os.Create(subFileName)
	require.NoError(t, err)

	// wait for the watcher to pick up the new file
	event = <-events
	require.Equal(t, subFileName+":CREATE", event)
	t.Log("Got create file event in the sub directory")

	// delete the file
	err = os.Remove(subFileName)
	require.NoError(t, err)

	// wait for the watcher to pick up the delete event
	event = <-events
	require.Equal(t, subFileName+":REMOVE", event)
	t.Log("Got delete file event in the sub directory")

	// clean up
	err = os.RemoveAll(dirName)
	require.NoError(t, err)
}

func TestGeneratePluginPaths(t *testing.T) { //nolint:funlen
	// Create a temporary directory if it doesn't exist
	_, err := os.Stat("/tmp/")
	if os.IsNotExist(err) {
		err = os.Mkdir("/tmp/", 0o755)
		require.NoError(t, err)
	}

	// create a new directory in /tmp
	testDirName := path.Join("/tmp", uuid.NewString())
	err = os.Mkdir(testDirName, 0o755)
	require.NoError(t, err)

	t.Run("PluginPaths", func(t *testing.T) {
		// create a new directory in dirName
		subDirName := uuid.NewString()
		subDir := path.Join(testDirName, subDirName)
		err = os.Mkdir(subDir, 0o755)
		require.NoError(t, err)

		// create main.js and package.json in the sub directory
		pluginPath := path.Join(subDir, "main.js")
		_, err = os.Create(pluginPath)
		require.NoError(t, err)

		packageJSONPath := path.Join(subDir, "package.json")
		_, err = os.Create(packageJSONPath)
		require.NoError(t, err)

		pathList, err := plugins.GeneratePluginPaths("", testDirName)
		require.NoError(t, err)
		require.Contains(t, pathList, "plugins/"+subDirName)

		// delete the sub directory
		err = os.RemoveAll(subDir)
		require.NoError(t, err)

		// test without any valid plugin
		pathList, err = plugins.GeneratePluginPaths("", testDirName)
		require.NoError(t, err)
		require.Empty(t, pathList)
	})

	t.Run("StaticPluginPaths", func(t *testing.T) {
		// create a new directory in dirName
		subDirName := uuid.NewString()
		subDir := path.Join(testDirName, subDirName)
		err = os.Mkdir(subDir, 0o755)
		require.NoError(t, err)

		// create main.js and package.json in the sub directory
		pluginPath := path.Join(subDir, "main.js")
		_, err = os.Create(pluginPath)
		require.NoError(t, err)

		packageJSONPath := path.Join(subDir, "package.json")
		_, err = os.Create(packageJSONPath)
		require.NoError(t, err)

		pathList, err := plugins.GeneratePluginPaths(testDirName, "")
		require.NoError(t, err)
		require.Contains(t, pathList, "static-plugins/"+subDirName)

		// delete the sub directory
		err = os.RemoveAll(subDir)
		require.NoError(t, err)

		// test without any valid plugin
		pathList, err = plugins.GeneratePluginPaths(testDirName, "")
		require.NoError(t, err)
		require.Empty(t, pathList)
	})

	t.Run("InvalidPluginPaths", func(t *testing.T) {
		// create a new directory in test dir
		subDirName := uuid.NewString()
		subDir := path.Join(testDirName, subDirName)
		err = os.Mkdir(subDir, 0o755)
		require.NoError(t, err)

		// create random file in the sub directory
		fileName := path.Join(subDir, uuid.NewString())
		_, err = os.Create(fileName)
		require.NoError(t, err)

		// test with file as plugin Dir
		pathList, err := plugins.GeneratePluginPaths(fileName, "")
		assert.Error(t, err)
		assert.Nil(t, pathList)
	})

	// clean up
	err = os.RemoveAll(testDirName)
	require.NoError(t, err)
}

// Helper function for capturing output.
func captureOutput(f func()) (string, error) {
	r, w, err := os.Pipe()
	if err != nil {
		return "", err
	}

	originalStdout := os.Stdout
	os.Stdout = w

	f()

	err = w.Close()
	if err != nil {
		return "", err
	}

	os.Stdout = originalStdout

	outputBytes, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}

	return string(outputBytes), nil
}

// Helper function for creating a plugin.
func createPlugin(t *testing.T, baseDir string, pluginName string) string {
	pluginDir := path.Join(baseDir, pluginName)
	err := os.Mkdir(pluginDir, 0o755)
	require.NoError(t, err)

	// create main.js
	mainJsPath := path.Join(pluginDir, "main.js")
	_, err = os.Create(mainJsPath)
	require.NoError(t, err)

	// create package.json
	packageJSONPath := path.Join(pluginDir, "package.json")
	_, err = os.Create(packageJSONPath)
	require.NoError(t, err)

	return pluginDir
}

func TestListPlugins(t *testing.T) {
	// Create a temporary directory if it doesn't exist
	_, err := os.Stat("/tmp/")
	if os.IsNotExist(err) {
		err = os.Mkdir("/tmp/", 0o755)
		require.NoError(t, err)
	}

	// create a static plugin directory in /tmp
	staticPluginDir := path.Join("/tmp", uuid.NewString())
	err = os.Mkdir(staticPluginDir, 0o755)
	require.NoError(t, err)

	createPlugin(t, staticPluginDir, "static-plugin-1")

	// create a user plugin directory in /tmp
	pluginDir := path.Join("/tmp", uuid.NewString())
	err = os.Mkdir(pluginDir, 0o755)
	require.NoError(t, err)

	plugin1Dir := createPlugin(t, pluginDir, "user-plugin-1")

	// capture the output of the ListPlugins function
	output, err := captureOutput(func() {
		err := plugins.ListPlugins(staticPluginDir, pluginDir)
		require.NoError(t, err)
	})
	require.NoError(t, err)

	require.Contains(t, output, "Static Plugins")
	require.Contains(t, output, "static-plugin-1")
	require.Contains(t, output, "User-added Plugins")
	require.Contains(t, output, "user-plugin-1")

	// test missing package.json
	os.Remove(path.Join(plugin1Dir, "package.json"))

	output, err = captureOutput(func() {
		err := plugins.ListPlugins(staticPluginDir, pluginDir)
		require.NoError(t, err)
	})
	require.NoError(t, err)
	require.Contains(t, output, "user-plugin-1") // should use folder name

	// test invalid package.json
	err = os.WriteFile(path.Join(plugin1Dir, "package.json"), []byte("invalid json"), 0o600)
	require.NoError(t, err)
	output, err = captureOutput(func() {
		err := plugins.ListPlugins(staticPluginDir, pluginDir)
		require.NoError(t, err)
	})
	require.NoError(t, err)
	require.Contains(t, output, "user-plugin-1") // should use folder name
}

func TestHandlePluginEvents(t *testing.T) { //nolint:funlen
	// Create a temporary directory if it doesn't exist
	_, err := os.Stat("/tmp/")
	if os.IsNotExist(err) {
		err = os.Mkdir("/tmp/", 0o755)
		require.NoError(t, err)
	}

	// create a new directory in /tmp
	testDirName := uuid.NewString()
	testDirPath := path.Join("/tmp", testDirName)
	err = os.Mkdir(testDirPath, 0o755)
	require.NoError(t, err)

	// create a new directory for plugin
	pluginDirName := uuid.NewString()
	pluginDirPath := path.Join(testDirPath, pluginDirName)
	err = os.Mkdir(pluginDirPath, 0o755)
	require.NoError(t, err)

	// create main.js and package.json in the sub directory
	pluginPath := path.Join(pluginDirPath, "main.js")
	_, err = os.Create(pluginPath)
	require.NoError(t, err)

	packageJSONPath := path.Join(pluginDirPath, "package.json")
	_, err = os.Create(packageJSONPath)
	require.NoError(t, err)

	// create channel to receive events
	events := make(chan string)

	// create cache
	ch := cache.New[interface{}]()

	go plugins.HandlePluginEvents("", testDirPath, events, ch)

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

	go plugins.HandlePluginEvents("", testDirPath, events, ch)

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

	pluginListArr, ok := pluginList.([]string)
	require.True(t, ok)
	require.Contains(t, pluginListArr, "plugins/"+pluginDirName)

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
	plugins.PopulatePluginsCache("", "", ch)

	// check if the plugin refresh key is set to false
	pluginRefresh, err := ch.Get(context.Background(), plugins.PluginRefreshKey)
	require.NoError(t, err)

	pluginRefreshBool, ok := pluginRefresh.(bool)
	require.True(t, ok)
	require.False(t, pluginRefreshBool)

	// check if the plugin list key is set
	pluginList, err := ch.Get(context.Background(), plugins.PluginListKey)
	require.NoError(t, err)

	pluginListArr, ok := pluginList.([]string)
	require.True(t, ok)
	require.Empty(t, pluginListArr)
}

// TestDelete checks the Delete function.
func TestDelete(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "testdelete")
	require.NoError(t, err)

	defer os.RemoveAll(tempDir) // clean up

	// Create a temporary file
	tempFile, err := os.CreateTemp(tempDir, "testfile")
	require.NoError(t, err)
	tempFile.Close() // Close the file

	// Test cases
	tests := []struct {
		pluginDir  string
		pluginName string
		expectErr  bool
	}{
		{pluginDir: tempDir, pluginName: tempFile.Name(), expectErr: false},          // Existing file
		{pluginDir: tempDir, pluginName: "non-existent-directory", expectErr: false}, // Non-existent file
		{pluginDir: tempDir, pluginName: "../", expectErr: true},                     // Directory traversal

	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.pluginName, func(t *testing.T) {
			err := plugins.Delete(tt.pluginDir, tt.pluginName)
			if tt.expectErr {
				assert.Error(t, err, "Delete should return an error")
			} else {
				// check if the file exists
				_, err := os.Stat(path.Join(tt.pluginDir, tt.pluginName))
				assert.True(t, os.IsNotExist(err), "File should not exist")
			}
		})
	}
}
