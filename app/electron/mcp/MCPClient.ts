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

import type { BrowserWindow } from 'electron';

const DEBUG = true;

/**
 * MCPClient
 *
 * Lightweight client intended for use in the Electron main process to manage
 * minimal MCP (Multi-Cluster Platform) concerns.
 *
 * Example:
 * ```ts
 *   const mcpClient = new MCPClient();
 *   await mcpClient.initialize();
 *   mcpClient.setMainWindow(mainWindow);
 *   await mcpClient.handleClustersChange(['cluster-1']);
 *   await mcpClient.cleanup();
 * ```
 */
export default class MCPClient {
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;

  constructor() {}

  /**
   * Initialize the MCP client.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
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
