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
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/utils"
)

const (
	PluginRefreshKey        = "PLUGIN_REFRESH"
	PluginListKey           = "PLUGIN_LIST"
	PluginCanSendRefreshKey = "PLUGIN_CAN_SEND_REFRESH"
	subFolderWatchInterval  = 5 * time.Second
)

// Watch watches the given path for changes and sends the events to the notify channel.
func Watch(path string, notify chan<- string) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating watcher")
	}
	defer watcher.Close()

	go periodicallyWatchSubfolders(watcher, path, subFolderWatchInterval)

	for {
		select {
		case event := <-watcher.Events:
			notify <- event.Name + ":" + event.Op.String()
		case err := <-watcher.Errors:
			logger.Log(logger.LevelError, nil, err, "Plugin watcher Error")
		}
	}
}

// periodicallyWatchSubfolders periodically walks the path and adds any new directories to the watcher.
// This is needed because fsnotify doesn't watch subfolders.
func periodicallyWatchSubfolders(watcher *fsnotify.Watcher, path string, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for ; true; <-ticker.C {
		// Walk the path and add any new directories to the watcher.
		_ = filepath.WalkDir(path, func(path string, d fs.DirEntry, err error) error {
			if d != nil && d.IsDir() && !utils.Contains(watcher.WatchList(), path) {
				err := watcher.Add(path)
				if err != nil {
					logger.Log(logger.LevelError, map[string]string{"path": path},
						err, "adding path to watcher")

					return err
				}
				// when a folder is added, send events for all the files in the folder
				entries, err := os.ReadDir(path)
				if err != nil {
					logger.Log(logger.LevelError, map[string]string{"path": path},
						err, "reading dir")

					return err
				}

				for _, entry := range entries {
					watcher.Events <- fsnotify.Event{Name: filepath.Join(path, entry.Name()), Op: fsnotify.Create}
				}
			}

			return nil
		})
	}
}

// generateSeparatePluginPaths takes the staticPluginDir and pluginDir and returns separate lists of plugin paths.
func generateSeparatePluginPaths(staticPluginDir, pluginDir string) ([]string, []string, error) {
	var pluginListURLStatic []string

	if staticPluginDir != "" {
		var err error

		pluginListURLStatic, err = pluginBasePathListForDir(staticPluginDir, "static-plugins")
		if err != nil {
			return nil, nil, err
		}
	}

	pluginListURL, err := pluginBasePathListForDir(pluginDir, "plugins")
	if err != nil {
		return nil, nil, err
	}

	return pluginListURLStatic, pluginListURL, nil
}

// GeneratePluginPaths generates a concatenated list of plugin paths from the staticPluginDir and pluginDir.
func GeneratePluginPaths(staticPluginDir, pluginDir string) ([]string, error) {
	pluginListURLStatic, pluginListURL, err := generateSeparatePluginPaths(staticPluginDir, pluginDir)
	if err != nil {
		return nil, err
	}

	// Concatenate the static and user plugin lists.
	if pluginListURLStatic != nil {
		pluginListURL = append(pluginListURLStatic, pluginListURL...)
	}

	return pluginListURL, nil
}

// ListPlugins lists the plugins in the static and user-added plugin directories.
func ListPlugins(staticPluginDir, pluginDir string) error {
	staticPlugins, userPlugins, err := generateSeparatePluginPaths(staticPluginDir, pluginDir)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "listing plugins")
		return fmt.Errorf("listing plugins: %w", err)
	}

	getPluginName := func(pluginDir string) string {
		packageJSONPath := filepath.Join(pluginDir, "package.json")

		content, err := os.ReadFile(packageJSONPath)
		if err != nil {
			// If there's an error reading package.json, just return the folder name as fallback.
			return filepath.Base(pluginDir)
		}

		var packageData struct {
			Name string `json:"name"`
		}

		// Parse the JSON and extract the name. If it fails, return the folder name.
		if err := json.Unmarshal(content, &packageData); err != nil || packageData.Name == "" {
			return strings.TrimPrefix(filepath.Base(pluginDir), "plugins/")
		}

		return packageData.Name
	}

	if len(staticPlugins) > 0 {
		fmt.Printf("Static Plugins (%s):\n", staticPluginDir)

		for _, plugin := range staticPlugins {
			fmt.Println(" -", getPluginName(plugin))
		}
	} else {
		fmt.Println("No static plugins found.")
	}

	if len(userPlugins) > 0 {
		fmt.Printf("\nUser-added Plugins (%s):\n", pluginDir)

		for _, plugin := range userPlugins {
			pluginName := getPluginName(filepath.Join(pluginDir, plugin))
			fmt.Println(" -", pluginName)
		}
	} else {
		fmt.Printf("No user-added plugins found.")
	}

	return nil
}

// pluginBasePathListForDir returns a list of valid plugin paths for the given directory.
func pluginBasePathListForDir(pluginDir string, baseURL string) ([]string, error) {
	files, err := os.ReadDir(pluginDir)
	if err != nil && !os.IsNotExist(err) {
		logger.Log(logger.LevelError, map[string]string{"pluginDir": pluginDir},
			err, "reading plugin directory")

		return nil, err
	}

	pluginListURLs := make([]string, 0, len(files))

	for _, f := range files {
		if !f.IsDir() {
			pluginPath := filepath.Join(pluginDir, f.Name())
			logger.Log(logger.LevelInfo, map[string]string{"pluginPath": pluginPath},
				nil, "Not including plugin path, it is not a folder")

			continue
		}

		pluginPath := filepath.Join(pluginDir, f.Name(), "main.js")

		_, err := os.Stat(pluginPath)
		if err != nil {
			logger.Log(logger.LevelInfo, map[string]string{"pluginPath": pluginPath},
				err, "Not including plugin path, main.js not found")

			continue
		}

		packageJSONPath := filepath.Join(pluginDir, f.Name(), "package.json")

		_, err = os.Stat(packageJSONPath)
		if err != nil {
			logger.Log(logger.LevelInfo, map[string]string{"packageJSONPath": packageJSONPath},
				err, `Not including plugin path, package.json not found.
				Please run 'headlamp-plugin extract' again with headlamp-plugin >= 0.6.0`)
		}

		pluginFileURL := filepath.Join(baseURL, f.Name())
		pluginListURLs = append(pluginListURLs, pluginFileURL)
	}

	return pluginListURLs, nil
}

func canSendRefresh(c cache.Cache[interface{}]) bool {
	value, err := c.Get(context.Background(), PluginCanSendRefreshKey)
	if err != nil {
		if errors.Is(err, cache.ErrNotFound) {
			return false
		}

		logger.Log(logger.LevelError, map[string]string{"key": PluginCanSendRefreshKey},
			err, "getting plugin-can-send-refresh key")
	}

	canSendRefresh, ok := value.(bool)
	if !ok {
		logger.Log(logger.LevelInfo, nil, nil, "converting plugin-can-send-refresh key to bool")
	}

	return canSendRefresh
}

// HandlePluginEvents handles the plugin events by updating the plugin list
// and plugin refresh key in the cache.
func HandlePluginEvents(staticPluginDir, pluginDir string,
	notify <-chan string, cache cache.Cache[interface{}],
) {
	for range notify {
		// Set the refresh signal only if we cannot send it. We prevent it here
		// because we only want to send refresh signals that *happen after* we are
		// allowed to send them.
		err := cache.Set(context.Background(), PluginRefreshKey, canSendRefresh(cache))
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "setting plugin refresh key")
		}

		// generate the plugin list
		pluginList, err := GeneratePluginPaths(staticPluginDir, pluginDir)
		if err != nil && !os.IsNotExist(err) {
			logger.Log(logger.LevelError, nil, err, "generating plugins path")
		}

		err = cache.Set(context.Background(), PluginListKey, pluginList)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "setting plugin list key")
		}
	}
}

// PopulatePluginsCache populates the plugin list and plugin refresh key in the cache.
func PopulatePluginsCache(staticPluginDir, pluginDir string, cache cache.Cache[interface{}]) {
	// set the plugin refresh key to false
	err := cache.Set(context.Background(), PluginRefreshKey, false)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": PluginRefreshKey},
			err, "setting plugin refresh key")
	}

	// generate the plugin list
	pluginList, err := GeneratePluginPaths(staticPluginDir, pluginDir)
	if err != nil && !os.IsNotExist(err) {
		logger.Log(logger.LevelError,
			map[string]string{"staticPluginDir": staticPluginDir, "pluginDir": pluginDir},
			err, "generating plugins path")
	}

	err = cache.Set(context.Background(), PluginListKey, pluginList)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": PluginListKey},
			err, "setting plugin list key")
	}
}

// HandlePluginReload checks if the plugin refresh key is set to true
// and sends a signal to the frontend to reload the plugins by setting
// the X-Reload header to reload.
func HandlePluginReload(cache cache.Cache[interface{}], w http.ResponseWriter) {
	// Avoid processing if we cannot send refresh signals.
	if !canSendRefresh(cache) {
		return
	}

	value, err := cache.Get(context.Background(), PluginRefreshKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": PluginRefreshKey},
			err, "getting plugin refresh key")
	}

	valueBool, ok := value.(bool)
	if !ok {
		logger.Log(logger.LevelInfo, nil, nil, "converting plugin refresh key to bool")
	}

	if valueBool {
		// We signal back to the frontend through a header.
		// See apiProxy.ts in the frontend for how it handles this.
		logger.Log(logger.LevelInfo, nil, nil, "Sending reload plugins signal to frontend")

		// Allow JavaScript access to X-Reload header. Because denied by default.
		w.Header().Set("Access-Control-Expose-Headers", "X-Reload")
		w.Header().Set("X-Reload", "reload")

		// set the plugin refresh key to false
		err := cache.Set(context.Background(), PluginRefreshKey, false)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": PluginRefreshKey},
				err, "setting plugin refresh key")
		}
	}
}

// Delete deletes the plugin from the plugin directory.
func Delete(pluginDir, filename string) error {
	absPluginDir, err := filepath.Abs(pluginDir)
	if err != nil {
		return err
	}

	absPluginPath := path.Join(absPluginDir, filename)

	if !isSubdirectory(absPluginDir, absPluginPath) {
		return fmt.Errorf("plugin path '%s' is not a subdirectory of '%s'", absPluginPath, absPluginDir)
	}

	return os.RemoveAll(absPluginPath)
}

func isSubdirectory(parentDir, dirPath string) bool {
	rel, err := filepath.Rel(parentDir, dirPath)
	if err != nil {
		return false
	}

	return !strings.HasPrefix(rel, "..") && !strings.HasPrefix(rel, ".")
}
