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

import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MCPConfigManager } from './mcp-config';

interface MCPServer {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  env?: Record<string, string>;
}

interface MCPConfig {
  enabled: boolean;
  servers: MCPServer[];
}

class ElectronMCPClient {
  private client: MultiServerMCPClient | null = null;
  private tools: any[] = [];
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private configManager: MCPConfigManager;
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow: BrowserWindow | null = null) {
    this.mainWindow = mainWindow;
    this.configManager = new MCPConfigManager();
    this.setupIpcHandlers();
  }

  /**
   * Set the main window reference for dialogs
   */
  setMainWindow(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
  }

  /**
   * Initialize tools configuration for all available tools
   */
  private initializeToolsConfiguration(): void {
    if (!this.tools || this.tools.length === 0) {
      return;
    }

    // Group tools by server name (assuming tool names are prefixed with server name)
    const toolsByServer: Record<string, string[]> = {};

    for (const tool of this.tools) {
      // Extract server name from tool name (format: "serverName__toolName")
      const toolName = tool.name;
      const parts = toolName.split('__');

      if (parts.length >= 2) {
        const serverName = parts[0];
        const actualToolName = parts.slice(1).join('__');

        if (!toolsByServer[serverName]) {
          toolsByServer[serverName] = [];
        }
        toolsByServer[serverName].push(actualToolName);
      } else {
        // Fallback for tools without server prefix
        if (!toolsByServer['default']) {
          toolsByServer['default'] = [];
        }
        toolsByServer['default'].push(toolName);
      }
    }

    // Initialize configuration for each server's tools
    for (const [serverName, toolNames] of Object.entries(toolsByServer)) {
      this.configManager.initializeToolsConfig(serverName, toolNames);
    }
  }

  /**
   * Show user confirmation dialog for MCP operations
   */
  private async showConfirmationDialog(
    title: string,
    message: string,
    operation: string
  ): Promise<boolean> {
    if (!this.mainWindow) {
      console.warn('No main window available for confirmation dialog, allowing operation');
      return true;
    }

    const result = await dialog.showMessageBox(this.mainWindow, {
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
  private async showToolsConfigConfirmationDialog(newConfig: any): Promise<boolean> {
    if (!this.mainWindow) {
      console.warn('No main window available for confirmation dialog, allowing operation');
      return true;
    }

    const currentConfig = this.configManager.getConfig();
    const changes = this.compareToolsConfigs(currentConfig, newConfig);

    if (changes.length === 0) {
      return true; // No changes, allow operation
    }

    const changesText = changes.join('\n');

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      buttons: ['Apply Changes', 'Cancel'],
      defaultId: 1,
      title: 'MCP Tools Configuration Changes',
      message: 'The following changes will be applied to your MCP tools configuration:',
      detail: changesText + '\n\nDo you want to apply these changes?',
    });

    return result.response === 0; // 0 is "Apply Changes"
  }

  /**
   * Compare two tools configurations and return a list of changes
   */
  private compareToolsConfigs(currentConfig: any, newConfig: any): string[] {
    const changes: string[] = [];

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

        if (!currentTool && newTool) {
          // New tool added
          const status = newTool.enabled ? 'enabled' : 'disabled';
          changes.push(`+ Add tool "${toolName}" on server "${serverName}" (${status})`);
        } else if (currentTool && !newTool) {
          // Tool removed
          changes.push(`- Remove tool "${toolName}" from server "${serverName}"`);
        } else if (currentTool && newTool) {
          // Tool modified
          if (currentTool.enabled !== newTool.enabled) {
            const status = newTool.enabled ? 'enabled' : 'disabled';
            changes.push(`~ Change tool "${toolName}" on server "${serverName}" to ${status}`);
          }
        }
      }
    }

    return changes;
  }

  /**
   * Show detailed configuration change confirmation dialog
   */
  private async showConfigChangeDialog(
    currentConfig: MCPConfig | null,
    newConfig: MCPConfig
  ): Promise<boolean> {
    console.log('Current MCP Config:', currentConfig);
    console.log('New MCP Config:', newConfig);
    if (!this.mainWindow) {
      console.warn('No main window available for confirmation dialog, allowing operation');
      return true;
    }

    const changes = this.analyzeConfigChanges(currentConfig, newConfig);

    const result = await dialog.showMessageBox(this.mainWindow, {
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
  private analyzeConfigChanges(currentConfig: MCPConfig | null, newConfig: MCPConfig): string[] {
    const changes: string[] = [];

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
        const serverChanges: string[] = [];

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
  private parseToolName(fullToolName: string): { serverName: string; toolName: string } {
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
   * Load MCP server configuration from settings
   */
  private loadMCPConfig(): MCPConfig | null {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
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
  private expandArgs(args: string[]): string[] {
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

  private async initializeClient(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
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
      const mcpServers: any = {};

      for (const server of mcpConfig.servers) {
        if (!server.enabled || !server.name || !server.command) {
          continue;
        }

        // Expand environment variables and resolve paths in arguments
        const expandedArgs = this.expandArgs(server.args || []);
        console.log(`Expanded args for ${server.name}:`, expandedArgs);

        // Prepare environment variables
        const serverEnv = server.env ? { ...process.env, ...server.env } : process.env;

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

      this.client = new MultiServerMCPClient({
        throwOnLoadError: false, // Don't throw on load error to allow partial initialization
        prefixToolNameWithServerName: true, // Prefix to avoid name conflicts
        additionalToolNamePrefix: '',
        useStandardContentBlocks: true,
        mcpServers,
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

  private setupIpcHandlers(): void {
    // Handle MCP tools request
    ipcMain.handle('mcp-get-tools', async () => {
      try {
        await this.initializeClient();

        if (!this.client || this.tools.length === 0) {
          return { success: true, tools: [] };
        }

        // Filter tools based on configuration and convert to our format
        const enabledToolsInfo = this.tools
          .filter(tool => {
            const { serverName, toolName } = this.parseToolName(tool.name);
            return this.configManager.isToolEnabled(serverName, toolName);
          })
          .map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.schema,
          }));

        console.log('MCP tools retrieved:', enabledToolsInfo.length, 'enabled tools');
        return { success: true, tools: enabledToolsInfo };
      } catch (error) {
        console.error('Error getting MCP tools:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          tools: [],
        };
      }
    });

    // Handle MCP tool execution
    ipcMain.handle('mcp-execute-tool', async (event, { toolName, args, toolCallId }) => {
      console.log('args in mcp-execute-tool:', args);
      try {
        await this.initializeClient();

        if (!this.client || this.tools.length === 0) {
          throw new Error('MCP client not initialized or no tools available');
        }

        // Parse tool name
        const { serverName, toolName: actualToolName } = this.parseToolName(toolName);

        // Check if tool is enabled
        if (!this.configManager.isToolEnabled(serverName, actualToolName)) {
          throw new Error(`Tool ${toolName} is disabled`);
        }

        // Find the tool by name
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) {
          throw new Error(`Tool ${toolName} not found`);
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
        console.error(`Error executing MCP tool ${toolName}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          toolCallId,
        };
      }
    });

    // Handle MCP client status check
    ipcMain.handle('mcp-get-status', async () => {
      return {
        isInitialized: this.isInitialized,
        hasClient: this.client !== null,
      };
    });

    // Handle MCP client reset/restart with user confirmation
    ipcMain.handle('mcp-reset-client', async () => {
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
          if (typeof (this.client as any).close === 'function') {
            await (this.client as any).close();
          }
        }

        this.client = null;
        this.isInitialized = false;
        this.initializationPromise = null;

        // Re-initialize
        await this.initializeClient();

        return { success: true };
      } catch (error) {
        console.error('Error resetting MCP client:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Handle MCP configuration updates with detailed user confirmation
    ipcMain.handle('mcp-update-config', async (event, mcpConfig: MCPConfig) => {
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
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        let settings: any = {};

        if (fs.existsSync(settingsPath)) {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }

        settings.mcpConfig = mcpConfig;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

        // Reset and reinitialize client with new config
        if (this.client) {
          if (typeof (this.client as any).close === 'function') {
            await (this.client as any).close();
          }
        }
        this.client = null;
        this.isInitialized = false;
        this.initializationPromise = null;

        // Re-initialize with new config
        await this.initializeClient();

        console.log('MCP configuration updated successfully');
        return { success: true };
      } catch (error) {
        console.error('Error updating MCP configuration:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Handle getting current MCP configuration
    ipcMain.handle('mcp-get-config', async () => {
      try {
        const mcpConfig = this.loadMCPConfig();
        return {
          success: true,
          config: mcpConfig || { enabled: false, servers: [] },
        };
      } catch (error) {
        console.error('Error getting MCP configuration:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          config: { enabled: false, servers: [] },
        };
      }
    });

    // Handle getting MCP tools configuration
    ipcMain.handle('mcp-get-tools-config', async () => {
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
    ipcMain.handle('mcp-update-tools-config', async (event, toolsConfig: any) => {
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
        return { success: true };
      } catch (error) {
        console.error('Error updating MCP tools configuration:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Handle enabling/disabling specific tools
    ipcMain.handle('mcp-set-tool-enabled', async (event, { serverName, toolName, enabled }) => {
      try {
        this.configManager.setToolEnabled(serverName, toolName, enabled);
        return { success: true };
      } catch (error) {
        console.error('Error setting tool enabled state:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Handle getting tool statistics
    ipcMain.handle('mcp-get-tool-stats', async (event, { serverName, toolName }) => {
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
   * Cleanup method to be called when the app is shutting down
   */
  async cleanup(): Promise<void> {
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

export default ElectronMCPClient;
