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

import type { DynamicStructuredTool } from '@langchain/core/dist/tools/index';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { type BrowserWindow, dialog, ipcMain } from 'electron';
import {
  hasClusterDependentServers,
  loadMCPSettings,
  makeMcpServersFromSettings,
  MCPSettings,
  saveMCPSettings,
  showSettingsChangeDialog,
} from './MCPSettings';
import {
  MCPToolsConfig,
  MCPToolStateStore,
  parseServerNameToolName,
  showToolsConfigConfirmationDialog,
  validateToolArgs,
} from './MCPToolStateStore';

const DEBUG = true;

/**
 * MCPClient
 *
 * Lightweight client intended for use in the Electron main process to manage
 * minimal MCP (Multi-Cluster Platform) concerns.
 *
 * Example:
 * ```ts
 *   const configPath = path.join(app.getPath('userData'), 'mcp-tools-config.json');
 *   const mainWindow = new BrowserWindow({ ... });
 *   const settingsPath = path.join(app.getPath('userData'), 'settings.json');
 *   const mcpClient = new MCPClient(configPath, settingsPath);
 *   await mcpClient.initialize();
 *   mcpClient.setMainWindow(mainWindow);
 *   await mcpClient.handleClustersChange(['cluster-1']);
 *   await mcpClient.cleanup();
 * ```
 */
export default class MCPClient {
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;
  private mcpToolState: MCPToolStateStore | null = null;
  private readonly configPath: string;

  /** Cached list of available tools from all MCP servers */
  private clientTools: DynamicStructuredTool[] = [];
  /** The LangChain MCP client instance managing multiple servers */
  private client: MultiServerMCPClient | null = null;
  /** Whether the MCP client has been successfully initialized */
  private isInitialized = false;
  /** Promise tracking ongoing initialization to prevent duplicate initializations */
  private initializationPromise: Promise<void> | null = null;

  private settingsPath: string;
  private clusters: string[] = [];

  private currentClusters: string[] | null = null;
  private oldClusters: string[] | null = null;

  constructor(configPath: string, settingsPath: string) {
    this.configPath = configPath;
    this.settingsPath = settingsPath;
    this.setupIpcHandlers();
  }

  /**
   * Initialize the MCP client.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.mcpToolState = new MCPToolStateStore(this.configPath);

    await this.initializeClient();

    this.initialized = true;

    if (DEBUG) {
      console.info('MCPClient: initialized');
    }
  }

  /**
   * Initialize the MCP client if not already initialized.
   *
   * @return Promise that resolves when initialization is complete.
   */
  private async initializeClient(): Promise<void> {
    if (DEBUG) {
      console.log('MCPClient: initializeClient: ', {
        isInitialized: this.isInitialized,
        initializationPromise: this.initializationPromise,
      });
    }

    if (this.isInitialized) {
      return;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (DEBUG) {
      console.log('MCPClient: initializeClient: Starting doInitialize()...');
    }

    this.initializationPromise = this.doInitializeClient();
    return this.initializationPromise;
  }

  /**
   * Perform the actual initialization of the MCP client.
   *
   * @throws {Error} If initialization fails
   */
  private async doInitializeClient(): Promise<void> {
    try {
      const mcpServers = makeMcpServersFromSettings(this.settingsPath, this.clusters);

      // If no enabled servers, skip initialization
      if (Object.keys(mcpServers).length === 0) {
        if (DEBUG) {
          console.log('MCPClient: doInitialize: No enabled MCP servers found');
        }
        this.isInitialized = true;
        return;
      }
      if (DEBUG) {
        console.log(
          'MCPClient: doInitialize: Initializing MCP client with servers:',
          Object.keys(mcpServers)
        );
      }
      this.client = new MultiServerMCPClient({
        throwOnLoadError: false, // Don't throw on load error to allow partial initialization
        prefixToolNameWithServerName: true, // Prefix to avoid name conflicts
        additionalToolNamePrefix: '',
        useStandardContentBlocks: true,
        mcpServers,
        defaultToolTimeout: 2 * 60 * 1000, // 2 minutes
      });
      // Get and cache the tools
      this.clientTools = await this.client.getTools();
      this.mcpToolState?.initConfigFromClientTools(this.clientTools);

      this.isInitialized = true;
      if (DEBUG) {
        console.log(
          'MCPClient: doInitialize: MCP client initialized successfully with',
          this.clientTools.length,
          'tools'
        );
      }
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      this.client = null;
      this.isInitialized = false;
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Clean up resources used by the MCP client.
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    this.mainWindow = null;
    this.initialized = false;

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error('Error cleaning up MCP client:', error);
      }
    }
    this.client = null;
    this.clientTools = [];
    this.isInitialized = false;
    this.initializationPromise = null;

    if (DEBUG) {
      console.info('MCPClient: cleaned up');
    }
  }

  /**
   * Set the main BrowserWindow for IPC notifications.
   *
   * @param win - The main BrowserWindow instance, or null to clear it.
   */
  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  /**
   * Handle clusters change notification.
   *
   * @param clusters - The new active clusters array, or null if none.
   */
  async handleClustersChange(newClusters: string[] | null): Promise<void> {
    if (DEBUG) {
      console.info('MCPClient: clusters changed ->', newClusters);
    }

    if (!this.initialized) {
      throw new Error('MCPClient: not initialized');
    }

    // If cluster hasn't actually changed, do nothing.
    if (JSON.stringify(this.currentClusters) === JSON.stringify(newClusters)) {
      return;
    }

    const oldClusters = this.currentClusters;
    this.currentClusters = newClusters;

    // Check if we have any cluster-dependent servers
    if (!hasClusterDependentServers(this.settingsPath)) {
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
      console.log('MCP client restarted successfully for new cluster:', newClusters);
    } catch (error) {
      console.error('Error restarting MCP client for cluster change:', error);
      // Restore previous cluster on error
      this.currentClusters = oldClusters;
      throw error;
    }
  }

  /**
   * Execute an MCP tool with given parameters.
   *
   * @param toolName - The full name of the tool to execute (including server prefix)
   * @param args - The arguments to pass to the tool
   * @param toolCallId - Unique identifier for this tool call
   *
   * @returns Result object containing success status and output or error message
   */
  private async mcpExecuteTool(toolName: string, args: any[], toolCallId: string) {
    console.log('args in mcp-execute-tool:', args);
    if (!this.mcpToolState) {
      return;
    }
    try {
      await this.initializeClient();
      if (!this.client || this.clientTools.length === 0) {
        throw new Error('MCP client not initialized or no tools available');
      }
      // Parse tool name
      const { serverName, toolName: actualToolName } = parseServerNameToolName(toolName);

      // Check if tool is enabled
      const isEnabled = this.mcpToolState.isToolEnabled(serverName, actualToolName);
      if (!isEnabled) {
        throw new Error(`Tool ${actualToolName} from server ${serverName} is disabled`);
      }
      // Find the tool by name
      const tool = this.clientTools.find(t => t.name === toolName);
      if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
      }
      // Validate parameters against schema from configuration
      const validation = validateToolArgs(tool.schema, args);

      if (!validation.valid) {
        throw new Error(`Parameter validation failed: ${validation.error}`);
      }
      console.log(`Executing MCP tool: ${toolName} with args:`, args);
      // Execute the tool directly using LangChain's invoke method
      const result = await tool.invoke(args);
      console.log(`MCP tool ${toolName} executed successfully`);
      // Record tool usage
      this.mcpToolState.recordToolUsage(serverName, actualToolName);
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
  }

  private async mcpGetStatus() {
    return {
      isInitialized: this.isInitialized,
      hasClient: this.client !== null,
    };
  }

  private async mcpResetClient() {
    try {
      if (!this.mainWindow) {
        throw new Error('Main window not set for MCP client');
      }
      // Show confirmation dialog
      const userConfirmed = await showConfirmationDialog(
        this.mainWindow,
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
  }

  private async mcpUpdateConfig(mcpSettings: MCPSettings) {
    try {
      if (!this.mainWindow) {
        throw new Error('Main window not set for MCP client');
      }
      // Get current configuration for comparison
      const currentSettings = loadMCPSettings(this.settingsPath);
      console.log('Requested MCP configuration update:', mcpSettings);
      // Show detailed confirmation dialog with changes
      const userConfirmed = await showSettingsChangeDialog(
        this.mainWindow,
        currentSettings,
        mcpSettings
      );

      if (!userConfirmed) {
        return {
          success: false,
          error: 'User cancelled the configuration update',
        };
      }

      console.log('Updating MCP configuration with user confirmation...');
      saveMCPSettings(this.settingsPath, mcpSettings);

      // Reset and reinitialize client with new config
      if (this.client && typeof this.client.close === 'function') {
        await this.client.close();
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
  }

  private async mcpGetConfig() {
    try {
      const currentSettings = loadMCPSettings(this.settingsPath);

      return {
        success: true,
        config: currentSettings || { enabled: false, servers: [] },
      };
    } catch (error) {
      console.error('Error getting MCP configuration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        config: { enabled: false, servers: [] },
      };
    }
  }

  private async mcpGetToolsConfig() {
    try {
      const toolsConfig = this.mcpToolState?.getConfig();
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
  }

  private async mcpUpdateToolsConfig(toolsConfig: MCPToolsConfig) {
    console.log('Requested MCP tools configuration update:', toolsConfig);
    try {
      if (!this.mainWindow) {
        throw new Error('Main window not set for MCP client');
      }
      // Show confirmation dialog with detailed changes
      const currentToolsConfig = this.mcpToolState?.getConfig() || {};
      const userConfirmed = await showToolsConfigConfirmationDialog(
        this.mainWindow,
        currentToolsConfig,
        toolsConfig
      );

      if (!userConfirmed) {
        return {
          success: false,
          error: 'User cancelled the operation',
        };
      }

      this.mcpToolState?.setConfig(toolsConfig);
      return { success: true };
    } catch (error) {
      console.error('Error updating MCP tools configuration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async mcpSetToolEnabled(serverName: string, toolName: string, enabled: boolean) {
    try {
      this.mcpToolState?.setToolEnabled(serverName, toolName, enabled);
      return { success: true };
    } catch (error) {
      console.error('Error setting tool enabled state:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async mcpGetToolStats(serverName: string, toolName: string) {
    try {
      const stats = this.mcpToolState?.getToolStats(serverName, toolName);
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
  }

  private async mcpClusterChange(cluster: string | null) {
    try {
      console.log('Received cluster change event:', cluster);
      if (cluster !== null) {
        // @todo: support multiple clusters
        await this.handleClustersChange([cluster]);
      }
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
  }

  /**
   * Setup IPC handlers for MCP operations.
   */
  private setupIpcHandlers(): void {
    ipcMain?.handle('mcp-execute-tool', async (event, { toolName, args, toolCallId }) =>
      this.mcpExecuteTool(toolName, args, toolCallId)
    );
    ipcMain?.handle('mcp-get-status', async () => this.mcpGetStatus());
    ipcMain?.handle('mcp-reset-client', async () => this.mcpResetClient());
    ipcMain?.handle('mcp-update-config', async (event, mcpSettings: MCPSettings) =>
      this.mcpUpdateConfig(mcpSettings)
    );
    ipcMain?.handle('mcp-get-config', async () => this.mcpGetConfig());
    ipcMain?.handle('mcp-get-tools-config', async () => this.mcpGetToolsConfig());
    ipcMain?.handle('mcp-update-tools-config', async (event, toolsConfig: MCPToolsConfig) =>
      this.mcpUpdateToolsConfig(toolsConfig)
    );
    ipcMain?.handle('mcp-set-tool-enabled', async (event, { serverName, toolName, enabled }) =>
      this.mcpSetToolEnabled(serverName, toolName, enabled)
    );
    ipcMain?.handle('mcp-get-tool-stats', async (event, { serverName, toolName }) =>
      this.mcpGetToolStats(serverName, toolName)
    );
    ipcMain?.handle('mcp-cluster-change', async (event, { cluster }) =>
      this.mcpClusterChange(cluster)
    );
  }
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
export async function showConfirmationDialog(
  mainWindow: BrowserWindow,
  title: string,
  message: string,
  operation: string
): Promise<boolean> {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Allow', 'Cancel'],
    defaultId: 1,
    title,
    message,
    detail: `Operation: ${operation}\n\nDo you want to allow this MCP operation?`,
  });
  return result.response === 0; // 0 is "Allow"
}
