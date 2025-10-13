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

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface MCPToolState {
  enabled: boolean;
  lastUsed?: Date;
  usageCount?: number;
}

export interface MCPServerToolState {
  [toolName: string]: MCPToolState;
}

export interface MCPToolsConfig {
  [serverName: string]: MCPServerToolState;
}

export class MCPConfigManager {
  private configPath: string;
  private config: MCPToolsConfig = {};

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'headlamp-mcp-config.json');
    this.loadConfig();
  }

  /**
   * Load MCP tools configuration from file
   */
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(configData);
        console.log('MCP tools configuration loaded successfully');
      } else {
        console.log('MCP tools configuration file does not exist, using default empty config');
        this.config = {};
      }
    } catch (error) {
      console.error('Error loading MCP tools configuration:', error);
      this.config = {};
    }
  }

  /**
   * Save MCP tools configuration to file
   */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      console.log('MCP tools configuration saved successfully');
    } catch (error) {
      console.error('Error saving MCP tools configuration:', error);
    }
  }

  /**
   * Get the enabled state of a specific tool
   */
  isToolEnabled(serverName: string, toolName: string): boolean {
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
  setToolEnabled(serverName: string, toolName: string, enabled: boolean): void {
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
  getDisabledTools(serverName: string): string[] {
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
  getEnabledTools(serverName: string): string[] {
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
  recordToolUsage(serverName: string, toolName: string): void {
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
  getConfig(): MCPToolsConfig {
    return { ...this.config };
  }

  /**
   * Set the complete configuration
   */
  setConfig(newConfig: MCPToolsConfig): void {
    this.config = { ...newConfig };
    this.saveConfig();
  }

  /**
   * Reset configuration to empty state
   */
  resetConfig(): void {
    this.config = {};
    this.saveConfig();
  }

  /**
   * Initialize default configuration for available tools
   */
  initializeToolsConfig(serverName: string, toolNames: string[]): void {
    if (!this.config[serverName]) {
      this.config[serverName] = {};
    }

    const serverConfig = this.config[serverName];
    let hasChanges = false;

    for (const toolName of toolNames) {
      if (!serverConfig[toolName]) {
        serverConfig[toolName] = {
          enabled: true,
          usageCount: 0,
        };
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveConfig();
    }
  }

  /**
   * Get tool statistics
   */
  getToolStats(serverName: string, toolName: string): MCPToolState | null {
    const serverConfig = this.config[serverName];
    if (!serverConfig || !serverConfig[toolName]) {
      return null;
    }

    return { ...serverConfig[toolName] };
  }
}
