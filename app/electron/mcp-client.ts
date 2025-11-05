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

/**
 * Enable debug logging for MCP client operations.
 * Set to false in production to reduce console output.
 */
const DEBUG = true;

/**
 * Helper function for debug logging
 * @param args - Arguments to log
 */
function debugLog(...args: any[]): void {
  if (DEBUG) {
    console.log('[MCP]', ...args);
  }
}

/**
 * Configuration for an MCP (Model Context Protocol) server
 */
interface MCPServer {
  /** Unique name identifier for the MCP server */
  name: string;
  /** Command to execute to start the MCP server */
  command: string;
  /** Arguments to pass to the server command */
  args: string[];
  /** Whether this server is enabled */
  enabled: boolean;
  /** Optional environment variables to set for the server process */
  env?: Record<string, string>;
}

/**
 * Main MCP configuration containing server definitions
 */
interface MCPConfig {
  /** Whether MCP integration is enabled globally */
  enabled: boolean;
  /** List of configured MCP servers */
  servers: MCPServer[];
}

/**
 * Manages MCP (Model Context Protocol) client for Electron desktop application.
 *
 * This class handles:
 * - MCP server lifecycle (initialization, restart, cleanup)
 * - Tool discovery and execution with user confirmation
 * - Configuration management and validation
 * - IPC communication with renderer process
 * - Cluster context changes
 */
class ElectronMCPClient {
  /** The LangChain MCP client instance managing multiple servers */
  private client: MultiServerMCPClient | null = null;
  /** Cached list of available tools from all MCP servers */
  private tools: any[] = [];
  /** Whether the MCP client has been successfully initialized */
  private isInitialized = false;
  /** Promise tracking ongoing initialization to prevent duplicate initializations */
  private initializationPromise: Promise<void> | null = null;
  /** Manages tool-level configuration and statistics */
  private configManager: MCPConfigManager;
  /** Reference to the main Electron window for displaying dialogs */
  private mainWindow: BrowserWindow | null = null;
  /** Currently active Kubernetes cluster context */
  private currentCluster: string | null = null;

  /**
   * Creates a new ElectronMCPClient instance
   * @param mainWindow - Optional reference to the main browser window for dialogs
   */
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
   * This completely replaces the existing config with current tools
   */
  private initializeToolsConfiguration(): void {
    if (!this.tools || this.tools.length === 0) {
      debugLog('No tools available for configuration initialization');
      // Clear the config if no tools are available
      this.configManager.replaceConfig({});
      return;
    }

    // Group tools by server name with their schemas
    const toolsByServer: Record<
      string,
      Array<{
        name: string;
        inputSchema?: any;
        description?: string;
      }>
    > = {};

    for (const tool of this.tools) {
      // Extract server name from tool name (format: "serverName__toolName")
      const toolName = tool.name;
      const parts = toolName.split('__');

      // Extract schema from the tool (LangChain tools use .schema property)
      const toolSchema = (tool as any).schema || tool.inputSchema || null;
      debugLog(
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

    debugLog('Tools grouped by server:', Object.keys(toolsByServer));

    // Replace the entire configuration with current tools
    this.configManager.replaceToolsConfig(toolsByServer);
  }

  /**
   * Show user confirmation dialog for MCP operations.
   * Displays a dialog to the user for security confirmation before executing MCP operations.
   *
   * @param title - Dialog title
   * @param message - Main message to display to the user
   * @param operation - Description of the operation being performed
   * @returns Promise resolving to true if user allows the operation, false otherwise
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
   * Show detailed confirmation dialog for tools configuration changes.
   * Compares current and new configurations and displays a summary of changes.
   *
   * @param newConfig - The new configuration to be applied
   * @returns Promise resolving to true if user approves changes, false otherwise
   */
  private async showToolsConfigConfirmationDialog(newConfig: any): Promise<boolean> {
    if (!this.mainWindow) {
      console.warn('No main window available for confirmation dialog, allowing operation');
      return true;
    }

    const currentConfig = this.configManager.getConfig();
    const summary = this.createToolsConfigSummary(currentConfig, newConfig);

    if (summary.totalChanges === 0) {
      return true; // No changes, allow operation
    }

    const result = await dialog.showMessageBox(this.mainWindow, {
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
   * Create a concise summary of tools configuration changes.
   * Analyzes differences between current and new tool configurations.
   *
   * @param currentConfig - Current tool configuration
   * @param newConfig - New tool configuration to compare against
   * @returns Object containing total changes count and formatted summary text
   */
  private createToolsConfigSummary(
    currentConfig: any,
    newConfig: any
  ): {
    totalChanges: number;
    summaryText: string;
  } {
    const enabledTools: string[] = [];
    const disabledTools: string[] = [];
    const addedTools: string[] = [];
    const removedTools: string[] = [];

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
    const summaryParts: string[] = [];

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
   * Show detailed configuration change confirmation dialog.
   * Displays specific changes between current and new MCP server configurations.
   *
   * @param currentConfig - Current MCP configuration, or null if none exists
   * @param newConfig - New MCP configuration to be applied
   * @returns Promise resolving to true if user approves changes, false otherwise
   */
  private async showConfigChangeDialog(
    currentConfig: MCPConfig | null,
    newConfig: MCPConfig
  ): Promise<boolean> {
    debugLog('Current MCP Config:', currentConfig);
    debugLog('New MCP Config:', newConfig);
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
   * Analyze differences between current and new configuration.
   * Creates a human-readable list of changes to MCP server configurations.
   *
   * @param currentConfig - Current MCP configuration, or null if none exists
   * @param newConfig - New MCP configuration to compare against
   * @returns Array of human-readable change descriptions
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
   * Parse tool name to extract server and tool components.
   * Tool names follow format "serverName__toolName" where serverName is the MCP server prefix.
   *
   * @param fullToolName - Complete tool name potentially including server prefix
   * @returns Object with serverName and toolName components
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
   * Validate tool parameters against schema from configuration.
   * Performs basic JSON schema validation on tool parameters before execution.
   *
   * @param serverName - Name of the MCP server providing the tool
   * @param toolName - Name of the tool being validated
   * @param args - Tool arguments to validate
   * @returns Object with validation result and optional error message
   */
  private validateToolParameters(
    serverName: string,
    toolName: string,
    args: any
  ): { valid: boolean; error?: string } {
    const toolState = this.configManager.getToolStats(serverName, toolName);
    if (!toolState || !toolState.inputSchema) {
      // No schema available, assume valid
      return { valid: true };
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
        for (const [propName, propSchema] of Object.entries(schema.properties as any)) {
          if (args[propName] !== undefined) {
            const propType = (propSchema as any).type;
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

      return { valid: true };
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
   * Expand environment variables and resolve paths in arguments.
   * Handles:
   * - Windows environment variables (%USERPROFILE%, %APPDATA%, etc.)
   * - HEADLAMP_CURRENT_CLUSTER placeholder
   * - Docker volume mount path conversions for Windows
   *
   * @param args - Array of argument strings to expand
   * @param cluster - Optional cluster context to substitute
   * @returns Array of expanded argument strings
   */
  private expandArgs(args: string[], cluster: string | null = null): string[] {
    const currentCluster = cluster || this.currentCluster || '';

    return args.map(arg => {
      // Replace Windows environment variables like %USERPROFILE%
      let expandedArg = arg;

      // Handle HEADLAMP_CURRENT_CLUSTER placeholder
      if (expandedArg.includes('HEADLAMP_CURRENT_CLUSTER')) {
        expandedArg = expandedArg.replace(/HEADLAMP_CURRENT_CLUSTER/g, currentCluster);
      }

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
        // Parse Docker mount options more carefully to handle paths with commas
        // Format: type=bind,src=<path>,dst=<path>[,other-options]
        const typeBindMatch = expandedArg.match(/^type=bind,src=(.+),dst=(.+?)(?:,|$)/);
        if (typeBindMatch) {
          // For paths with commas, we need to find the last occurrence of ,dst=
          const srcStartIdx = expandedArg.indexOf('src=') + 4;
          const dstStartIdx = expandedArg.lastIndexOf(',dst=');

          if (dstStartIdx > srcStartIdx) {
            let srcPath = expandedArg.substring(srcStartIdx, dstStartIdx);
            const remainingPart = expandedArg.substring(dstStartIdx + 5); // Skip ",dst="
            const dstEndIdx = remainingPart.indexOf(',');
            const dstPath = dstEndIdx > 0 ? remainingPart.substring(0, dstEndIdx) : remainingPart;

            // Resolve the source path
            if (process.platform === 'win32') {
              srcPath = path.resolve(srcPath);
              // For Docker on Windows, we might need to convert C:\ to /c/ format
              if (srcPath.match(/^[A-Za-z]:/)) {
                srcPath =
                  '/' + srcPath.charAt(0).toLowerCase() + srcPath.slice(2).replace(/\\/g, '/');
              }
            }

            const otherOptions = dstEndIdx > 0 ? ',' + remainingPart.substring(dstEndIdx + 1) : '';
            expandedArg = `type=bind,src=${srcPath},dst=${dstPath}${otherOptions}`;
          }
        }
      }

      return expandedArg;
    });
  }

  private async initializeClient(): Promise<void> {
    debugLog('initializeClient called');
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    debugLog('Starting MCP client initialization...');
    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      debugLog('Initializing MCP client in Electron main process...');

      // Load MCP configuration from settings
      const mcpConfig = this.loadMCPConfig();

      if (
        !mcpConfig ||
        !mcpConfig.enabled ||
        !mcpConfig.servers ||
        mcpConfig.servers.length === 0
      ) {
        debugLog('MCP is disabled or no servers configured');
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
        const expandedArgs = this.expandArgs(server.args || [], this.currentCluster);
        console.log(`Expanded args for ${server.name}:`, expandedArgs);

        // Prepare environment variables
        const serverEnv = { ...process.env, ...(server.env || {}) };

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

  private setupIpcHandlers(): void {
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

    // Handle cluster context changes
    ipcMain.handle('mcp-cluster-change', async (event, { cluster }) => {
      try {
        console.log('Received cluster change event:', cluster);
        await this.handleClusterChange(cluster);
        return {
          success: true,
        };
      } catch (error) {
        console.error('Error handling cluster change:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });
  }

  /**
   * Check if any server in the config uses HEADLAMP_CURRENT_CLUSTER placeholder.
   * This determines whether the MCP client needs to be restarted on cluster changes.
   *
   * @param mcpConfig - MCP configuration to check
   * @returns True if any enabled server has HEADLAMP_CURRENT_CLUSTER in its arguments
   */
  private hasClusterDependentServers(mcpConfig: MCPConfig | null): boolean {
    if (!mcpConfig || !mcpConfig.servers) {
      return false;
    }

    return mcpConfig.servers.some(
      server =>
        server.enabled &&
        server.args &&
        server.args.some(arg => arg.includes('HEADLAMP_CURRENT_CLUSTER'))
    );
  }

  /**
   * Handle cluster context change
   * This will restart MCP servers if any server uses HEADLAMP_CURRENT_CLUSTER
   */
  async handleClusterChange(newCluster: string | null): Promise<void> {
    // If cluster hasn't actually changed, do nothing
    if (this.currentCluster === newCluster) {
      return;
    }

    const oldCluster = this.currentCluster;
    this.currentCluster = newCluster;

    // Check if we have any cluster-dependent servers
    const mcpConfig = this.loadMCPConfig();
    if (!this.hasClusterDependentServers(mcpConfig)) {
      console.log('No cluster-dependent MCP servers found, skipping restart');
      return;
    }

    try {
      // Reset the client
      if (this.client) {
        if (typeof (this.client as any).close === 'function') {
          await (this.client as any).close();
        }
      }

      this.client = null;
      this.isInitialized = false;
      this.initializationPromise = null;

      // Re-initialize with new cluster context
      await this.initializeClient();

      console.log('MCP client restarted successfully for new cluster:', newCluster);
    } catch (error) {
      console.error('Error restarting MCP client for cluster change:', error);
      // Restore previous cluster on error
      this.currentCluster = oldCluster;
      throw error;
    }
  }

  /**
   * Public method to initialize the MCP client
   * This should be called when the app starts
   */
  async initialize(): Promise<void> {
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
