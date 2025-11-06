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

import type { ClientConfig } from '@langchain/mcp-adapters';
import os from 'os';
import path from 'path';
import { loadSettings, saveSettings } from '../settings';

const DEBUG = true;

interface MCPSettings {
  /**
   * Whether MCP is enabled or not
   */
  enabled: boolean;
  /**
   * List of MCP servers
   */
  servers: MCPServer[];
}

interface MCPServer {
  /**
   * Server name
   */
  name: string;
  /**
   * Command to run the MCP tool
   */
  command: string;
  /**
   * Arguments for the MCP tool command
   */
  args: string[];
  /**
   * Whether the MCP server is enabled or not
   */
  enabled: boolean;
  /**
   * Environment variables for the MCP tool command
   */
  env?: Record<string, string>;
}

/**
 * Load MCP server configuration from settings
 *
 * @param settingsPath - path to settings file
 * @returns MCP settings or null if not found
 */
export function loadMCPSettings(settingsPath: string): MCPSettings | null {
  const settings = loadSettings(settingsPath);
  if (!settings || typeof settings !== 'object') {
    return null;
  }

  const mcp = (settings as any).mcp;
  return mcp ? (mcp as MCPSettings) : null;
}

/**
 * Save MCP server configuration to settings
 *
 * @param settingsPath - path to settings file
 * @param mcpSettings - MCP settings to save
 */
export function saveMCPSettings(settingsPath: string, mcpSettings: MCPSettings): void {
  const settings = loadSettings(settingsPath);
  settings.mcp = mcpSettings;
  saveSettings(settingsPath, settings);
}

/**
 * Expand environment variables and resolve paths in arguments.
 *
 * @param args - The array of argument strings to expand.
 * @param currentCluster - The current cluster name to replace HEADLAMP_CURRENT_CLUSTER.
 * @param cluster - The specific cluster name to replace HEADLAMP_CURRENT_CLUSTER, if provided.
 *
 * @returns The array of expanded argument strings.
 */
export function expandEnvAndResolvePaths(args: string[], cluster: string | null = null): string[] {
  return args.map(arg => {
    // Replace Windows environment variables like %USERPROFILE%
    let expandedArg = arg;

    // Handle HEADLAMP_CURRENT_CLUSTER placeholder
    if (expandedArg.includes('HEADLAMP_CURRENT_CLUSTER')) {
      expandedArg = expandedArg.replace(/HEADLAMP_CURRENT_CLUSTER/g, cluster || '');
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
      const match = expandedArg.match(/type=bind,src=(.+?),dst=(.+)/);
      if (match) {
        let srcPath = match[1];
        const dstPath = match[2];

        // Resolve the source path
        if (process.platform === 'win32') {
          srcPath = path.resolve(srcPath);
          // For Docker on Windows, we might need to convert C:\ to /c/ format
          if (srcPath.match(/^[A-Za-z]:/)) {
            srcPath = '/' + srcPath.charAt(0).toLowerCase() + srcPath.slice(2).replace(/\\/g, '/');
          }
        }

        expandedArg = `type=bind,src=${srcPath},dst=${dstPath}`;
      }
    }

    return expandedArg;
  });
}

/**
 * Make mpcServers from settings for the mpcServers arg of MultiServerMCPClient.
 *
 * @param settingsPath - path to settings file
 * @param clusters - list of current clusters
 *
 * @returns Record of MCP servers
 */
export function makeMcpServersFromSettings(
  settingsPath: string,
  clusters: string[]
): ClientConfig['mcpServers'] {
  const mcpServers: ClientConfig['mcpServers'] = {};

  const mcpSettings = loadMCPSettings(settingsPath);
  if (
    !mcpSettings ||
    !mcpSettings.enabled ||
    !mcpSettings.servers ||
    mcpSettings.servers.length === 0
  ) {
    return mcpServers;
  }

  for (const server of mcpSettings.servers) {
    if (!server.enabled || !server.name || !server.command) {
      continue;
    }

    const expandedArgs = expandEnvAndResolvePaths(server.args || [], clusters[0] || null);

    if (DEBUG) {
      console.log(`Expanded args for ${server.name}:`, expandedArgs);
    }

    const serverEnv = server.env ? { ...process.env, ...server.env } : process.env;

    mcpServers[server.name] = {
      transport: 'stdio',
      command: server.command,
      args: expandedArgs,
      env: serverEnv as Record<string, string>,
      restart: {
        enabled: true,
        maxAttempts: 3,
        delayMs: 2000,
      },
    };
  }

  return mcpServers;
}

/**
 * settingsChanges returns a list of human-readable descriptions of changes
 * between the current MCP settings and next MCP settings.
 *
 * @param currentSettings - The current MCP settings, or null if none exist.
 * @param nextSettings - The next MCP settings to compare against.
 *
 * @returns An array of strings describing the changes.
 */
export function settingsChanges(
  currentSettings: MCPSettings | null,
  nextSettings: MCPSettings | null
): string[] {
  const changes: string[] = [];

  // Check if MCP is being enabled/disabled
  const currentEnabled = currentSettings?.enabled ?? false;
  const nextEnabled = nextSettings?.enabled ?? false;

  if (currentEnabled !== nextEnabled) {
    changes.push(`• MCP will be ${nextEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // Get current and next server lists
  const currentServers = currentSettings?.servers ?? [];
  const nextServers = nextSettings?.servers ?? [];

  // Check for added servers
  const currentServerNames = new Set(currentServers.map(s => s.name));
  const nextServerNames = new Set(nextServers.map(s => s.name));

  for (const server of nextServers) {
    if (!currentServerNames.has(server.name)) {
      changes.push(`• ADD server: "${server.name}" (${server.command})`);
    }
  }

  // Check for removed servers
  for (const server of currentServers) {
    if (!nextServerNames.has(server.name)) {
      changes.push(`• REMOVE server: "${server.name}"`);
    }
  }

  // Check for modified servers
  for (const nextServer of nextServers) {
    const currentServer = currentServers.find(s => s.name === nextServer.name);
    if (currentServer) {
      const serverChanges: string[] = [];

      // Check enabled status
      if (currentServer.enabled !== nextServer.enabled) {
        serverChanges.push(`${nextServer.enabled ? 'enable' : 'disable'}`);
      }

      // Check command
      if (currentServer.command !== nextServer.command) {
        serverChanges.push(`change command: "${currentServer.command}" → "${nextServer.command}"`);
      }

      // Check arguments
      const currentArgs = JSON.stringify(currentServer.args || []);
      const nextArgs = JSON.stringify(nextServer.args || []);
      if (currentArgs !== nextArgs) {
        serverChanges.push(`change arguments: ${currentArgs} → ${nextArgs}`);
      }

      // Check environment variables
      const currentEnv = JSON.stringify(currentServer.env || {});
      const nextEnv = JSON.stringify(nextServer.env || {});
      if (currentEnv !== nextEnv) {
        serverChanges.push(`change environment variables`);
      }

      if (serverChanges.length > 0) {
        changes.push(`• MODIFY server "${nextServer.name}": ${serverChanges.join(', ')}`);
      }
    }
  }

  return changes;
}
