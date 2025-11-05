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
