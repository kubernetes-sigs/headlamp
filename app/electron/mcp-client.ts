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
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

  constructor() {
    this.setupIpcHandlers();
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

        // Convert LangChain tools to our format
        const toolsInfo = this.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.schema,
        }));

        console.log('MCP tools retrieved:', toolsInfo.length, 'tools');
        return { success: true, tools: toolsInfo };
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

        // Find the tool by name
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) {
          throw new Error(`Tool ${toolName} not found`);
        }

        // Execute the tool directly using LangChain's invoke method
        const result = await tool.invoke(args);
        console.log(`MCP tool ${toolName} executed successfully`);

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

    // Handle MCP client reset/restart
    ipcMain.handle('mcp-reset-client', async () => {
      try {
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

    // Handle MCP configuration updates
    ipcMain.handle('mcp-update-config', async (event, mcpConfig: MCPConfig) => {
      try {
        console.log('Updating MCP configuration...');

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
