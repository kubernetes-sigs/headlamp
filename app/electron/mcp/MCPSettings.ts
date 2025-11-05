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

import os from 'os';
import path from 'path';
import { loadSettings, saveSettings } from '../settings';

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
