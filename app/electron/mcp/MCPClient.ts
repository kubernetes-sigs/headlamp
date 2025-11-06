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
import { type BrowserWindow, dialog } from 'electron';
import { hasClusterDependentServers, makeMcpServersFromSettings } from './MCPSettings';
import { MCPToolStateStore } from './MCPToolStateStore';

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
