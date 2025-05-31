/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

/**
 * Plugin watcher module for Headlamp
 * 
 * This module watches for changes in plugin directories and notifies the renderer
 * process when plugins are updated, allowing for hot-reloading of plugins.
 */
class PluginWatcher {
  constructor(app) {
    this.app = app;
    this.watcher = null;
    this.mainWindow = null;
    this.pluginsDir = path.join(app.getPath('userData'), 'plugins');
    this.pluginCacheDir = path.join(app.getPath('userData'), '.config', 'Headlamp', 'plugins');
  }

  /**
   * Set the main window reference
   * @param {BrowserWindow} window - The main Electron BrowserWindow
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }

  /**
   * Start watching for plugin changes
   */
  startWatching() {
    if (this.watcher) {
      this.watcher.close();
    }

    // Ensure the plugins directory exists
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    // Watch for changes in the plugins directory
    this.watcher = chokidar.watch(this.pluginsDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      depth: 3, // Watch subdirectories up to 3 levels deep
    });

    // When a file is changed, added, or deleted
    this.watcher.on('all', (event, path) => {
      console.log(`Plugin change detected: ${event} ${path}`);
      
      // Clear the plugin cache
      this.clearPluginCache();
      
      // Notify the renderer process about the plugin change
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('plugin-changed', { event, path });
      }
    });

    console.log(`Watching for plugin changes in ${this.pluginsDir}`);
  }

  /**
   * Clear the plugin cache to ensure fresh plugins are loaded
   */
  clearPluginCache() {
    if (fs.existsSync(this.pluginCacheDir)) {
      try {
        // Delete all files in the cache directory
        const files = fs.readdirSync(this.pluginCacheDir);
        for (const file of files) {
          const filePath = path.join(this.pluginCacheDir, file);
          if (fs.lstatSync(filePath).isDirectory()) {
            fs.rmdirSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
        }
        console.log('Plugin cache cleared successfully');
      } catch (err) {
        console.error('Failed to clear plugin cache:', err);
      }
    }
  }

  /**
   * Stop watching for plugin changes
   */
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('Plugin watcher stopped');
    }
  }
}

module.exports = PluginWatcher;