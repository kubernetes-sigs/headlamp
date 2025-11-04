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

import * as fs from 'fs';

/**
 * State of a single MCP tool.
 */
export interface MCPToolState {
  /**
   * Whether the tool is enabled or disabled
   */
  enabled: boolean;
  /**
   * Timestamp of the last time the tool was used
   */
  lastUsed?: Date;
  /**
   * Number of times the tool has been used
   */
  usageCount?: number;
  /**
   * JSON schema for tool parameters
   */
  inputSchema?: any;
  /**
   * Description of the tool from MCP server
   */
  description?: string;
}

/**
 * State of all MCP tools for a specific server.
 */
export interface MCPServerToolState {
  [toolName: string]: MCPToolState;
}

/**
 * Configuration for MCP tools across multiple servers.
 */
export interface MCPToolsConfig {
  [serverName: string]: MCPServerToolState;
}

/**
 * MCPToolStateStore manages configuration for MCP (Multi-Cluster Platform)
 * tools, including enabled/disabled state and usage statistics.
 *
 * Example:
 * ```ts
 *  const toolStatePath = path.join(app.getPath('userData'), 'mcp-tools-config.json');
 *  const toolState = new MCPToolStateStore(toolStatePath);
 *
 *  // Example inputSchema
 *  const exampleSchema = {
 *    type: 'object',
 *     properties: {
 *       param1: { type: 'string', description: 'Parameter 1' },
 *       param2: { type: 'number', description: 'Parameter 2' },
 *     },
 *    required: ['param1'],
 *  };
 *
 *  // Initialize default config for available tools
 *  toolState.initializeToolsConfig('my-cluster', [
 *    { name: 'tool-a', inputSchema: exampleSchema, description: 'Tool A description' },
 *    { name: 'tool-b', inputSchema: exampleSchema, description: 'Tool B description' },
 *  ]);
 *
 *  // Enable or disable a tool
 *  toolState.setToolEnabled('my-cluster', 'tool-a', false);
 *
 *  // Check if a tool is enabled
 *  const isEnabled = toolState.isToolEnabled('my-cluster', 'tool-a');
 *
 *  // Get all disabled tools for a server
 *  const disabledTools = toolState.getDisabledTools('my-cluster');
 *
 *  // Record tool usage
 *  toolState.recordToolUsage('my-cluster', 'tool-a');
 *
 *  // Get tool statistics
 *  const toolStats = toolState.getToolStats('my-cluster', 'tool-a');
 *
 *  // Replace entire tools configuration
 *  toolState.replaceToolsConfig({
 *   'my-cluster': [
 *     { name: 'tool-a', inputSchema: {...}, description: 'Tool A description' },
 *     { name: 'tool-b', inputSchema: {...}, description: 'Tool B description' },
 *   ],
 *   'another-cluster': [
 *     { name: 'tool-c', inputSchema: {...}, description: 'Tool C description' },
 *   ],
 *  });
 *
 *  // Reset configuration
 *  toolState.resetConfig();
 *
 *  // Get the complete configuration
 *  const completeConfig = toolState.getConfig();
 *
 *  // Set the complete configuration
 *  toolState.setConfig(completeConfig);
 * ```
 */
export class MCPToolStateStore {
  private toolStatePath: string;
  private config: MCPToolsConfig = {};

  constructor(configPath: string) {
    this.toolStatePath = configPath;
  }

  /**
   * Initialize the MCP client.
   */
  async initialize(): Promise<void> {
    return await this.loadConfig();
  }

  /**
   * Load MCP tools configuration from file
   */
  private async loadConfig(): Promise<void> {
    try {
      await fs.promises.access(this.toolStatePath, fs.constants.F_OK);
      const configData = await fs.promises.readFile(this.toolStatePath, 'utf-8');
      this.config = JSON.parse(configData);
    } catch (error) {
      // If file doesn't exist or any error occurs, fall back to empty config
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        this.config = {};
      } else {
        console.error('Error loading MCP tools configuration:', error);
        this.config = {};
      }
    }
  }

  /**
   * Save MCP tools configuration to file
   */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.toolStatePath, JSON.stringify(this.config, null, 2), 'utf-8');
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
   * Initialize default configuration for available tools with schemas
   */
  initializeToolsConfig(
    serverName: string,
    toolsInfo: Array<{
      name: string;
      inputSchema?: any;
      description?: string;
    }>
  ): void {
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
  getToolStats(serverName: string, toolName: string): MCPToolState | null {
    const serverConfig = this.config[serverName];
    if (!serverConfig || !serverConfig[toolName]) {
      return null;
    }

    return { ...serverConfig[toolName] };
  }

  /**
   * Replace the entire tools configuration with a new set of tools
   * This overwrites all existing tools with only the current ones
   */
  replaceToolsConfig(
    toolsByServer: Record<
      string,
      Array<{
        name: string;
        inputSchema?: any;
        description?: string;
      }>
    >
  ): void {
    // Create a new config object
    const newConfig: MCPToolsConfig = {};

    for (const [serverName, toolsInfo] of Object.entries(toolsByServer)) {
      newConfig[serverName] = {};

      for (const toolInfo of toolsInfo) {
        const toolName = toolInfo.name;

        // Check if this tool existed in the old config to preserve enabled state and usage count
        const oldToolState = this.config[serverName]?.[toolName];

        newConfig[serverName][toolName] = {
          enabled: oldToolState?.enabled ?? true, // Preserve enabled state or default to true
          usageCount: oldToolState?.usageCount ?? 0, // Preserve usage count or default to 0
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
  replaceConfig(newConfig: MCPToolsConfig): void {
    this.config = newConfig;
    this.saveConfig();
  }
}
