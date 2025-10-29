'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.MCPConfigManager = void 0;
var _electron = require('electron');
var fs = _interopRequireWildcard(require('fs'));
var path = _interopRequireWildcard(require('path'));
function _getRequireWildcardCache(e) {
  if ('function' != typeof WeakMap) return null;
  var r = new WeakMap(),
    t = new WeakMap();
  return (_getRequireWildcardCache = function (e) {
    return e ? t : r;
  })(e);
}
function _interopRequireWildcard(e, r) {
  if (!r && e && e.__esModule) return e;
  if (null === e || ('object' != typeof e && 'function' != typeof e)) return { default: e };
  var t = _getRequireWildcardCache(r);
  if (t && t.has(e)) return t.get(e);
  var n = { __proto__: null },
    a = Object.defineProperty && Object.getOwnPropertyDescriptor;
  for (var u in e)
    if ('default' !== u && {}.hasOwnProperty.call(e, u)) {
      var i = a ? Object.getOwnPropertyDescriptor(e, u) : null;
      i && (i.get || i.set) ? Object.defineProperty(n, u, i) : (n[u] = e[u]);
    }
  return (n.default = e), t && t.set(e, n), n;
}
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

class MCPConfigManager {
  config = {};
  constructor() {
    this.configPath = path.join(_electron.app.getPath('userData'), 'headlamp-mcp-config.json');
    this.loadConfig();
  }

  /**
   * Load MCP tools configuration from file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(configData);
      } else {
        this.config = {};
      }
    } catch (error) {
      this.config = {};
    }
  }

  /**
   * Save MCP tools configuration to file
   */
  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving MCP tools configuration:', error);
    }
  }

  /**
   * Get the enabled state of a specific tool
   */
  isToolEnabled(serverName, toolName) {
    const serverConfig = this.config[serverName];
    if (!serverConfig) {
      // Default to enabled for new tools
      return true;
    }
    const toolState = serverConfig[toolName];
    if (!toolState) {
      // Default to enabled for new tools
      return true;
    }
    return toolState.enabled;
  }

  /**
   * Set the enabled state of a specific tool
   */
  setToolEnabled(serverName, toolName, enabled) {
    if (!this.config[serverName]) {
      this.config[serverName] = {};
    }
    if (!this.config[serverName][toolName]) {
      this.config[serverName][toolName] = {
        enabled: true,
        usageCount: 0,
      };
    }
    this.config[serverName][toolName].enabled = enabled;
    this.saveConfig();
  }

  /**
   * Get all disabled tools for a server
   */
  getDisabledTools(serverName) {
    const serverConfig = this.config[serverName];
    if (!serverConfig) {
      return [];
    }
    return Object.entries(serverConfig)
      .filter(([, toolState]) => !toolState.enabled)
      .map(([toolName]) => toolName);
  }

  /**
   * Get all enabled tools for a server
   */
  getEnabledTools(serverName) {
    const serverConfig = this.config[serverName];
    if (!serverConfig) {
      return [];
    }
    return Object.entries(serverConfig)
      .filter(([, toolState]) => toolState.enabled)
      .map(([toolName]) => toolName);
  }

  /**
   * Update tool usage statistics
   */
  recordToolUsage(serverName, toolName) {
    if (!this.config[serverName]) {
      this.config[serverName] = {};
    }
    if (!this.config[serverName][toolName]) {
      this.config[serverName][toolName] = {
        enabled: true,
        usageCount: 0,
      };
    }
    const toolState = this.config[serverName][toolName];
    toolState.lastUsed = new Date();
    toolState.usageCount = (toolState.usageCount || 0) + 1;
    this.saveConfig();
  }

  /**
   * Get the complete configuration
   */
  getConfig() {
    return {
      ...this.config,
    };
  }

  /**
   * Set the complete configuration
   */
  setConfig(newConfig) {
    this.config = {
      ...newConfig,
    };
    this.saveConfig();
  }

  /**
   * Reset configuration to empty state
   */
  resetConfig() {
    this.config = {};
    this.saveConfig();
  }

  /**
   * Initialize default configuration for available tools with schemas
   */
  initializeToolsConfig(serverName, toolsInfo) {
    if (!this.config[serverName]) {
      this.config[serverName] = {};
    }
    const serverConfig = this.config[serverName];
    let hasChanges = false;
    for (const toolInfo of toolsInfo) {
      const toolName = toolInfo.name;
      if (!serverConfig[toolName]) {
        serverConfig[toolName] = {
          enabled: true,
          usageCount: 0,
          inputSchema: toolInfo.inputSchema || null,
          description: toolInfo.description || '',
        };
        hasChanges = true;
      } else {
        // Always update schema and description for existing tools
        let toolChanged = false;

        // Update schema if it's different or missing
        const currentSchema = JSON.stringify(serverConfig[toolName].inputSchema || null);
        const newSchema = JSON.stringify(toolInfo.inputSchema || null);
        if (currentSchema !== newSchema) {
          serverConfig[toolName].inputSchema = toolInfo.inputSchema || null;
          toolChanged = true;
        }

        // Update description if it's different or missing
        const currentDescription = serverConfig[toolName].description || '';
        const newDescription = toolInfo.description || '';
        if (currentDescription !== newDescription) {
          serverConfig[toolName].description = newDescription;
          toolChanged = true;
        }
        if (toolChanged) {
          hasChanges = true;
        }
      }
    }
    if (hasChanges) {
      this.saveConfig();
    }
  }

  /**
   * Get tool statistics
   */
  getToolStats(serverName, toolName) {
    const serverConfig = this.config[serverName];
    if (!serverConfig || !serverConfig[toolName]) {
      return null;
    }
    return {
      ...serverConfig[toolName],
    };
  }

  /**
   * Replace the entire tools configuration with a new set of tools
   * This overwrites all existing tools with only the current ones
   */
  replaceToolsConfig(toolsByServer) {
    // Create a new config object
    const newConfig = {};
    for (const [serverName, toolsInfo] of Object.entries(toolsByServer)) {
      newConfig[serverName] = {};
      for (const toolInfo of toolsInfo) {
        const toolName = toolInfo.name;

        // Check if this tool existed in the old config to preserve enabled state and usage count
        const oldToolState = this.config[serverName]?.[toolName];
        newConfig[serverName][toolName] = {
          enabled: oldToolState?.enabled ?? true,
          // Preserve enabled state or default to true
          usageCount: oldToolState?.usageCount ?? 0,
          // Preserve usage count or default to 0
          inputSchema: toolInfo.inputSchema || null,
          description: toolInfo.description || '',
        };
      }
    }

    // Replace the entire config
    this.config = newConfig;
    this.saveConfig();
  }

  /**
   * Replace the entire configuration with a new config object
   */
  replaceConfig(newConfig) {
    this.config = newConfig;
    this.saveConfig();
  }
}
exports.MCPConfigManager = MCPConfigManager;
