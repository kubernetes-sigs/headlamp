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

import { type BrowserWindow, dialog } from 'electron';
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
 *   const mcpClient = new MCPClient(configPath);
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

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Initialize the MCP client.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.mcpToolState = new MCPToolStateStore(this.configPath);

    this.initialized = true;
    if (DEBUG) {
      console.info('MCPClient: initialized');
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
  async handleClustersChange(clusters: string[] | null): Promise<void> {
    if (DEBUG) {
      console.info('MCPClient: clusters changed ->', clusters);
    }
    if (!this.initialized) {
      throw new Error('MCPClient: not initialized');
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
    if (DEBUG) {
      console.info('MCPClient: cleaned up');
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
