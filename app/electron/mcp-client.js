'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.default = void 0;
var _mcpAdapters = require('@langchain/mcp-adapters');
var _electron = require('electron');
var fs = _interopRequireWildcard(require('fs'));
var os = _interopRequireWildcard(require('os'));
var path = _interopRequireWildcard(require('path'));
var _mcpConfig = require('./mcp-config');
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

class ElectronMCPClient {
  client = null;
  tools = [];
  isInitialized = false;
  initializationPromise = null;
  mainWindow = null;
  constructor(mainWindow = null) {
    this.mainWindow = mainWindow;
    this.configManager = new _mcpConfig.MCPConfigManager();
    this.setupIpcHandlers();
  }

  /**
   * Set the main window reference for dialogs
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Initialize tools configuration for all available tools
   * This completely replaces the existing config with current tools
   */
  initializeToolsConfiguration() {
    if (!this.tools || this.tools.length === 0) {
      console.log('No tools available for configuration initialization');
      // Clear the config if no tools are available
      this.configManager.replaceConfig({});
      return;
    }

    // Group tools by server name with their schemas
    const toolsByServer = {};
    for (const tool of this.tools) {
      // Extract server name from tool name (format: "serverName__toolName")
      const toolName = tool.name;
      const parts = toolName.split('__');

      // Extract schema from the tool (LangChain tools use .schema property)
      const toolSchema = tool.schema || tool.inputSchema || null;
      console.log(
        `Processing tool: ${toolName}, has inputSchema: ${!!toolSchema}, description: "${
          tool.description
        }"`
      );
      if (parts.length >= 2) {
        const serverName = parts[0];
        const actualToolName = parts.slice(1).join('__');
        if (!toolsByServer[serverName]) {
          toolsByServer[serverName] = [];
        }
        toolsByServer[serverName].push({
          name: actualToolName,
          inputSchema: toolSchema,
          description: tool.description || '',
        });
      } else {
        // Fallback for tools without server prefix
        if (!toolsByServer['default']) {
          toolsByServer['default'] = [];
        }
        toolsByServer['default'].push({
          name: toolName,
          inputSchema: toolSchema,
          description: tool.description || '',
        });
      }
    }
    console.log('Tools grouped by server:', Object.keys(toolsByServer));

    // Replace the entire configuration with current tools
    this.configManager.replaceToolsConfig(toolsByServer);
  }

  /**
   * Show user confirmation dialog for MCP operations
   */
  async showConfirmationDialog(title, message, operation) {
    if (!this.mainWindow) {
      console.warn('No main window available for confirmation dialog, allowing operation');
      return true;
    }
    const result = await _electron.dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      buttons: ['Allow', 'Cancel'],
      defaultId: 1,
      title,
      message,
      detail: `Operation: ${operation}\n\nDo you want to allow this MCP operation?`,
    });
    return result.response === 0; // 0 is "Allow"
  }

  /**
   * Show detailed confirmation dialog for tools configuration changes
   */
  async showToolsConfigConfirmationDialog(newConfig) {
    if (!this.mainWindow) {
      console.warn('No main window available for confirmation dialog, allowing operation');
      return true;
    }
    const currentConfig = this.configManager.getConfig();
    const summary = this.createToolsConfigSummary(currentConfig, newConfig);
    if (summary.totalChanges === 0) {
      return true; // No changes, allow operation
    }
    const result = await _electron.dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      buttons: ['Apply Changes', 'Cancel'],
      defaultId: 1,
      title: 'MCP Tools Configuration Changes',
      message: `${summary.totalChanges} tool configuration change(s) will be applied:`,
      detail: summary.summaryText + '\n\nDo you want to apply these changes?',
    });
    return result.response === 0; // 0 is "Apply Changes"
  }

  /**
   * Create a concise summary of tools configuration changes
   */
  createToolsConfigSummary(currentConfig, newConfig) {
    const enabledTools = [];
    const disabledTools = [];
    const addedTools = [];
    const removedTools = [];

    // Get all server names from both configs
    const allServers = new Set([
      ...Object.keys(currentConfig || {}),
      ...Object.keys(newConfig || {}),
    ]);
    for (const serverName of allServers) {
      const currentServerConfig = currentConfig[serverName] || {};
      const newServerConfig = newConfig[serverName] || {};

      // Get all tool names from both configs
      const allTools = new Set([
        ...Object.keys(currentServerConfig),
        ...Object.keys(newServerConfig),
      ]);
      for (const toolName of allTools) {
        const currentTool = currentServerConfig[toolName];
        const newTool = newServerConfig[toolName];
        const displayName = `${toolName} (${serverName})`;
        if (!currentTool && newTool) {
          // New tool added
          addedTools.push(displayName);
          if (newTool.enabled) {
            enabledTools.push(displayName);
          } else {
            disabledTools.push(displayName);
          }
        } else if (currentTool && !newTool) {
          // Tool removed
          removedTools.push(displayName);
        } else if (currentTool && newTool) {
          // Tool modified
          if (currentTool.enabled !== newTool.enabled) {
            if (newTool.enabled) {
              enabledTools.push(displayName);
            } else {
              disabledTools.push(displayName);
            }
          }
        }
      }
    }

    // Build summary text
    const summaryParts = [];
    if (enabledTools.length > 0) {
      summaryParts.push(`✓ ENABLE (${enabledTools.length}): ${enabledTools.join(', ')}`);
    }
    if (disabledTools.length > 0) {
      summaryParts.push(`✗ DISABLE (${disabledTools.length}): ${disabledTools.join(', ')}`);
    }
    const totalChanges =
      enabledTools.length + disabledTools.length + addedTools.length + removedTools.length;
    return {
      totalChanges,
      summaryText: summaryParts.join('\n\n'),
    };
  }

  /**
   * Show detailed configuration change confirmation dialog
   */
  async showConfigChangeDialog(currentConfig, newConfig) {
    console.log('Current MCP Config:', currentConfig);
    console.log('New MCP Config:', newConfig);
    if (!this.mainWindow) {
      console.warn('No main window available for confirmation dialog, allowing operation');
      return true;
    }
    const changes = this.analyzeConfigChanges(currentConfig, newConfig);
    const result = await _electron.dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      buttons: ['Apply Changes', 'Cancel'],
      defaultId: 1,
      title: 'MCP Configuration Changes',
      message: 'The application wants to update the MCP configuration.',
      detail:
        changes.length > 0
          ? `The following changes will be applied:\n\n${changes.join(
              '\n'
            )}\n\nDo you want to apply these changes?`
          : 'No changes detected in the configuration.\n\nDo you want to proceed anyway?',
    });
    return result.response === 0; // 0 is "Apply Changes"
  }

  /**
   * Analyze differences between current and new configuration
   */
  analyzeConfigChanges(currentConfig, newConfig) {
    const changes = [];

    // Check if MCP is being enabled/disabled
    const currentEnabled = currentConfig?.enabled ?? false;
    const newEnabled = newConfig.enabled ?? false;
    if (currentEnabled !== newEnabled) {
      changes.push(`• MCP will be ${newEnabled ? 'ENABLED' : 'DISABLED'}`);
    }

    // Get current and new server lists
    const currentServers = currentConfig?.servers ?? [];
    const newServers = newConfig.servers ?? [];

    // Check for added servers
    const currentServerNames = new Set(currentServers.map(s => s.name));
    const newServerNames = new Set(newServers.map(s => s.name));
    for (const server of newServers) {
      if (!currentServerNames.has(server.name)) {
        changes.push(`• ADD server: "${server.name}" (${server.command})`);
      }
    }

    // Check for removed servers
    for (const server of currentServers) {
      if (!newServerNames.has(server.name)) {
        changes.push(`• REMOVE server: "${server.name}"`);
      }
    }

    // Check for modified servers
    for (const newServer of newServers) {
      const currentServer = currentServers.find(s => s.name === newServer.name);
      if (currentServer) {
        const serverChanges = [];

        // Check enabled status
        if (currentServer.enabled !== newServer.enabled) {
          serverChanges.push(`${newServer.enabled ? 'enable' : 'disable'}`);
        }

        // Check command
        if (currentServer.command !== newServer.command) {
          serverChanges.push(`change command: "${currentServer.command}" → "${newServer.command}"`);
        }

        // Check arguments
        const currentArgs = JSON.stringify(currentServer.args || []);
        const newArgs = JSON.stringify(newServer.args || []);
        if (currentArgs !== newArgs) {
          serverChanges.push(`change arguments: ${currentArgs} → ${newArgs}`);
        }

        // Check environment variables
        const currentEnv = JSON.stringify(currentServer.env || {});
        const newEnv = JSON.stringify(newServer.env || {});
        if (currentEnv !== newEnv) {
          serverChanges.push(`change environment variables`);
        }
        if (serverChanges.length > 0) {
          changes.push(`• MODIFY server "${newServer.name}": ${serverChanges.join(', ')}`);
        }
      }
    }
    return changes;
  }

  /**
   * Parse tool name to extract server and tool components
   */
  parseToolName(fullToolName) {
    const parts = fullToolName.split('__');
    if (parts.length >= 2) {
      return {
        serverName: parts[0],
        toolName: parts.slice(1).join('__'),
      };
    }
    return {
      serverName: 'default',
      toolName: fullToolName,
    };
  }

  /**
   * Validate tool parameters against schema from configuration
   */
  validateToolParameters(serverName, toolName, args) {
    const toolState = this.configManager.getToolStats(serverName, toolName);
    if (!toolState || !toolState.inputSchema) {
      // No schema available, assume valid
      return {
        valid: true,
      };
    }
    try {
      const schema = toolState.inputSchema;

      // Basic validation - check required properties
      if (schema.required && Array.isArray(schema.required)) {
        for (const requiredProp of schema.required) {
          if (args[requiredProp] === undefined || args[requiredProp] === null) {
            return {
              valid: false,
              error: `Required parameter '${requiredProp}' is missing`,
            };
          }
        }
      }

      // Check property types if schema properties are defined
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          if (args[propName] !== undefined) {
            const propType = propSchema.type;
            const actualType = typeof args[propName];
            if (propType === 'string' && actualType !== 'string') {
              return {
                valid: false,
                error: `Parameter '${propName}' should be a string, got ${actualType}`,
              };
            }
            if (propType === 'number' && actualType !== 'number') {
              return {
                valid: false,
                error: `Parameter '${propName}' should be a number, got ${actualType}`,
              };
            }
            if (propType === 'boolean' && actualType !== 'boolean') {
              return {
                valid: false,
                error: `Parameter '${propName}' should be a boolean, got ${actualType}`,
              };
            }
            if (propType === 'array' && !Array.isArray(args[propName])) {
              return {
                valid: false,
                error: `Parameter '${propName}' should be an array, got ${actualType}`,
              };
            }
            if (
              propType === 'object' &&
              (actualType !== 'object' || Array.isArray(args[propName]) || args[propName] === null)
            ) {
              return {
                valid: false,
                error: `Parameter '${propName}' should be an object, got ${actualType}`,
              };
            }
          }
        }
      }
      return {
        valid: true,
      };
    } catch (error) {
      return {
        valid: false,
        error: `Schema validation error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Load MCP server configuration from settings
   */
  loadMCPConfig() {
    try {
      const settingsPath = path.join(_electron.app.getPath('userData'), 'settings.json');
      if (!fs.existsSync(settingsPath)) {
        return null;
      }
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return settings.mcpConfig || null;
    } catch (error) {
      console.error('Error loading MCP config:', error);
      return null;
    }
  }

  /**
   * Expand environment variables and resolve paths in arguments
   */
  expandArgs(args) {
    return args.map(arg => {
      // Replace Windows environment variables like %USERPROFILE%
      let expandedArg = arg;

      // Handle %USERPROFILE%
      if (expandedArg.includes('%USERPROFILE%')) {
        expandedArg = expandedArg.replace(/%USERPROFILE%/g, os.homedir());
      }

      // Handle other common Windows environment variables
      if (expandedArg.includes('%APPDATA%')) {
        expandedArg = expandedArg.replace(/%APPDATA%/g, process.env.APPDATA || '');
      }
      if (expandedArg.includes('%LOCALAPPDATA%')) {
        expandedArg = expandedArg.replace(/%LOCALAPPDATA%/g, process.env.LOCALAPPDATA || '');
      }

      // Convert Windows backslashes to forward slashes for Docker
      if (process.platform === 'win32' && expandedArg.includes('\\')) {
        expandedArg = expandedArg.replace(/\\/g, '/');
      }

      // Handle Docker volume mount format and ensure proper Windows path format
      if (expandedArg.includes('type=bind,src=')) {
        const match = expandedArg.match(/type=bind,src=(.+?),dst=(.+)/);
        if (match) {
          let srcPath = match[1];
          const dstPath = match[2];

          // Resolve the source path
          if (process.platform === 'win32') {
            srcPath = path.resolve(srcPath);
            // For Docker on Windows, we might need to convert C:\ to /c/ format
            if (srcPath.match(/^[A-Za-z]:/)) {
              srcPath =
                '/' + srcPath.charAt(0).toLowerCase() + srcPath.slice(2).replace(/\\/g, '/');
            }
          }
          expandedArg = `type=bind,src=${srcPath},dst=${dstPath}`;
        }
      }
      return expandedArg;
    });
  }
  async initializeClient() {
    console.log('initializeClient called');
    if (this.isInitialized) {
      return;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    console.log('Starting MCP client initialization...');
    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }
  async doInitialize() {
    try {
      console.log('Initializing MCP client in Electron main process...');

      // Load MCP configuration from settings
      const mcpConfig = this.loadMCPConfig();
      if (
        !mcpConfig ||
        !mcpConfig.enabled ||
        !mcpConfig.servers ||
        mcpConfig.servers.length === 0
      ) {
        console.log('MCP is disabled or no servers configured');
        this.isInitialized = true;
        return;
      }

      // Build MCP servers configuration from settings
      const mcpServers = {};
      for (const server of mcpConfig.servers) {
        if (!server.enabled || !server.name || !server.command) {
          continue;
        }

        // Expand environment variables and resolve paths in arguments
        const expandedArgs = this.expandArgs(server.args || []);
        console.log(`Expanded args for ${server.name}:`, expandedArgs);

        // Prepare environment variables
        const serverEnv = server.env
          ? {
              ...process.env,
              ...server.env,
            }
          : process.env;
        mcpServers[server.name] = {
          transport: 'stdio',
          command: server.command,
          args: expandedArgs,
          env: serverEnv,
          restart: {
            enabled: true,
            maxAttempts: 3,
            delayMs: 2000,
          },
        };
      }

      // If no enabled servers, skip initialization
      if (Object.keys(mcpServers).length === 0) {
        console.log('No enabled MCP servers found');
        this.isInitialized = true;
        return;
      }
      console.log('Initializing MCP client with servers:', Object.keys(mcpServers));
      this.client = new _mcpAdapters.MultiServerMCPClient({
        throwOnLoadError: false,
        // Don't throw on load error to allow partial initialization
        prefixToolNameWithServerName: true,
        // Prefix to avoid name conflicts
        additionalToolNamePrefix: '',
        useStandardContentBlocks: true,
        mcpServers,
        defaultToolTimeout: 2 * 60 * 1000, // 2 minutes
      });

      // Get and cache the tools
      this.tools = await this.client.getTools();
      // Initialize configuration for available tools
      this.initializeToolsConfiguration();
      this.isInitialized = true;
      console.log('MCP client initialized successfully with', this.tools.length, 'tools');
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      this.client = null;
      this.isInitialized = false;
      this.initializationPromise = null;
      throw error;
    }
  }
  setupIpcHandlers() {
    // Handle MCP tool execution
    _electron.ipcMain.handle('mcp-execute-tool', async (event, { toolName, args, toolCallId }) => {
      console.log('args in mcp-execute-tool:', args);
      try {
        await this.initializeClient();
        if (!this.client || this.tools.length === 0) {
          throw new Error('MCP client not initialized or no tools available');
        }

        // Parse tool name
        const { serverName, toolName: actualToolName } = this.parseToolName(toolName);

        // Check if tool is enabled
        const isEnabled = this.configManager.isToolEnabled(serverName, actualToolName);
        if (!isEnabled) {
          throw new Error(`Tool ${actualToolName} from server ${serverName} is disabled`);
        }

        // Find the tool by name
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) {
          throw new Error(`Tool ${toolName} not found`);
        }

        // Validate parameters against schema from configuration
        const validation = this.validateToolParameters(serverName, actualToolName, args);
        if (!validation.valid) {
          throw new Error(`Parameter validation failed: ${validation.error}`);
        }
        console.log(`Executing MCP tool: ${toolName} with args:`, args);

        // Execute the tool directly using LangChain's invoke method
        const result = await tool.invoke(args);
        console.log(`MCP tool ${toolName} executed successfully`);

        // Record tool usage
        this.configManager.recordToolUsage(serverName, actualToolName);
        return {
          success: true,
          result,
          toolCallId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          toolCallId,
        };
      }
    });

    // Handle MCP client status check
    _electron.ipcMain.handle('mcp-get-status', async () => {
      return {
        isInitialized: this.isInitialized,
        hasClient: this.client !== null,
      };
    });

    // Handle MCP client reset/restart with user confirmation
    _electron.ipcMain.handle('mcp-reset-client', async () => {
      try {
        // Show confirmation dialog
        const userConfirmed = await this.showConfirmationDialog(
          'MCP Client Reset',
          'The application wants to reset the MCP client. This will restart all MCP server connections.',
          'Reset MCP client'
        );
        if (!userConfirmed) {
          return {
            success: false,
            error: 'User cancelled the operation',
          };
        }
        console.log('Resetting MCP client...');
        if (this.client) {
          // If the client has a close/dispose method, call it
          if (typeof this.client.close === 'function') {
            await this.client.close();
          }
        }
        this.client = null;
        this.isInitialized = false;
        this.initializationPromise = null;

        // Re-initialize
        await this.initializeClient();
        return {
          success: true,
        };
      } catch (error) {
        console.error('Error resetting MCP client:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Handle MCP configuration updates with detailed user confirmation
    _electron.ipcMain.handle('mcp-update-config', async (event, mcpConfig) => {
      try {
        // Get current configuration for comparison
        const currentConfig = this.loadMCPConfig();
        console.log('Requested MCP configuration update:', mcpConfig);
        // Show detailed confirmation dialog with changes
        const userConfirmed = await this.showConfigChangeDialog(currentConfig, mcpConfig);
        if (!userConfirmed) {
          return {
            success: false,
            error: 'User cancelled the configuration update',
          };
        }
        console.log('Updating MCP configuration with user confirmation...');

        // Save to settings file
        const settingsPath = path.join(_electron.app.getPath('userData'), 'settings.json');
        let settings = {};
        if (fs.existsSync(settingsPath)) {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
        settings.mcpConfig = mcpConfig;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

        // Reset and reinitialize client with new config
        if (this.client) {
          if (typeof this.client.close === 'function') {
            await this.client.close();
          }
        }
        this.client = null;
        this.isInitialized = false;
        this.initializationPromise = null;

        // Re-initialize with new config
        await this.initializeClient();
        console.log('MCP configuration updated successfully');
        return {
          success: true,
        };
      } catch (error) {
        console.error('Error updating MCP configuration:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Handle getting current MCP configuration
    _electron.ipcMain.handle('mcp-get-config', async () => {
      try {
        const mcpConfig = this.loadMCPConfig();
        return {
          success: true,
          config: mcpConfig || {
            enabled: false,
            servers: [],
          },
        };
      } catch (error) {
        console.error('Error getting MCP configuration:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          config: {
            enabled: false,
            servers: [],
          },
        };
      }
    });

    // Handle getting MCP tools configuration
    _electron.ipcMain.handle('mcp-get-tools-config', async () => {
      try {
        const toolsConfig = this.configManager.getConfig();
        return {
          success: true,
          config: toolsConfig,
        };
      } catch (error) {
        console.error('Error getting MCP tools configuration:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          config: {},
        };
      }
    });

    // Handle updating MCP tools configuration with user confirmation
    _electron.ipcMain.handle('mcp-update-tools-config', async (event, toolsConfig) => {
      console.log('Requested MCP tools configuration update:', toolsConfig);
      try {
        // Show confirmation dialog with detailed changes
        const userConfirmed = await this.showToolsConfigConfirmationDialog(toolsConfig);
        if (!userConfirmed) {
          return {
            success: false,
            error: 'User cancelled the operation',
          };
        }
        this.configManager.setConfig(toolsConfig);
        return {
          success: true,
        };
      } catch (error) {
        console.error('Error updating MCP tools configuration:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Handle enabling/disabling specific tools
    _electron.ipcMain.handle(
      'mcp-set-tool-enabled',
      async (event, { serverName, toolName, enabled }) => {
        try {
          this.configManager.setToolEnabled(serverName, toolName, enabled);
          return {
            success: true,
          };
        } catch (error) {
          console.error('Error setting tool enabled state:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }
    );

    // Handle getting tool statistics
    _electron.ipcMain.handle('mcp-get-tool-stats', async (event, { serverName, toolName }) => {
      try {
        const stats = this.configManager.getToolStats(serverName, toolName);
        return {
          success: true,
          stats,
        };
      } catch (error) {
        console.error('Error getting tool statistics:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          stats: null,
        };
      }
    });
  }

  /**
   * Public method to initialize the MCP client
   * This should be called when the app starts
   */
  async initialize() {
    try {
      await this.initializeClient();
    } catch (error) {
      console.error('Failed to initialize MCP client on startup:', error);
      // Don't throw error to prevent app startup failure
    }
  }

  /**
   * Cleanup method to be called when the app is shutting down
   */
  async cleanup() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error('Error cleaning up MCP client:', error);
      }
    }
    this.client = null;
    this.tools = [];
    this.isInitialized = false;
    this.initializationPromise = null;
  }
}
var _default = (exports.default = ElectronMCPClient);
