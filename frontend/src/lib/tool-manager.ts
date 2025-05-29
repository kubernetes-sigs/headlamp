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

interface ProgressResp {
  type: string;
  message: string;
  data?: Record<string, any>;
}

interface ToolMetadata {
  name: string;
  version: string;
  platform: string;
  arch: string;
  downloadUrl: string;
  sha256?: string;
  installPath: string;
}

interface InstalledTool {
  name: string;
  version: string;
  installPath: string;
  binPath?: string;
}

/**
 * ToolManager provides methods to interact with the tool management system.
 * This class communicates with the main process through IPC to perform tool operations.
 */
export class ToolManager {
  private static readonly MESSAGE_TIMEOUT = 30000; // 30 seconds
  private static readonly MESSAGE_LIMIT = 1000;

  private static async addListenerWithLimitations(identifier: string): Promise<ProgressResp> {
    return new Promise((resolve, reject) => {
      let messageCount = 0;
      const timeout = setTimeout(() => {
        window.desktopApi.removeAllListeners(`tool-manager-${identifier}`);
        reject(new Error('Operation timed out'));
      }, this.MESSAGE_TIMEOUT);

      window.desktopApi.on(`tool-manager-${identifier}`, (data: ProgressResp) => {
        messageCount++;
        if (messageCount > this.MESSAGE_LIMIT) {
          window.desktopApi.removeAllListeners(`tool-manager-${identifier}`);
          clearTimeout(timeout);
          reject(new Error('Too many messages received'));
          return;
        }

        if (data.type === 'error') {
          window.desktopApi.removeAllListeners(`tool-manager-${identifier}`);
          clearTimeout(timeout);
          reject(new Error(data.message));
          return;
        }

        if (data.type === 'success') {
          window.desktopApi.removeAllListeners(`tool-manager-${identifier}`);
          clearTimeout(timeout);
          resolve(data);
          return;
        }
      });
    });
  }

  /**
   * Install a tool with the given metadata.
   * @param identifier Unique identifier for this operation
   * @param toolMetadata Metadata for the tool to install
   */
  static install(identifier: string, toolMetadata: ToolMetadata): void {
    window.desktopApi.send(
      'tool-manager',
      JSON.stringify({
        action: 'INSTALL',
        identifier,
        toolMetadata,
      })
    );
  }

  /**
   * Update an installed tool to a new version.
   * @param identifier Unique identifier for this operation
   * @param name Name of the tool to update
   * @param newMetadata New metadata for the tool
   */
  static update(identifier: string, name: string, newMetadata: ToolMetadata): void {
    window.desktopApi.send(
      'tool-manager',
      JSON.stringify({
        action: 'UPDATE',
        identifier,
        name,
        newMetadata,
      })
    );
  }

  /**
   * Uninstall a tool.
   * @param identifier Unique identifier for this operation
   * @param name Name of the tool to uninstall
   */
  static uninstall(identifier: string, name: string): void {
    window.desktopApi.send(
      'tool-manager',
      JSON.stringify({
        action: 'UNINSTALL',
        identifier,
        name,
      })
    );
  }

  /**
   * List all installed tools.
   * @returns A promise that resolves with the list of installed tools
   */
  static async list(): Promise<Record<string, InstalledTool> | undefined> {
    const identifier = 'list-tools';
    window.desktopApi.send(
      'tool-manager',
      JSON.stringify({
        action: 'LIST',
        identifier,
      })
    );
    const data = await this.addListenerWithLimitations(identifier);
    return data.data;
  }
}
