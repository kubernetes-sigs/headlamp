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

/**
 * Interface for the response from a plugin manager progress event.
 *
 * @interface
 * @property {string} type - The type of the progress event.
 * @property {string} message - The message associated with the progress event.
 * @property {string} [identifier] - The unique identifier for the plugin. Optional.
 * @property {Record<string, any>} [data] - Any additional data associated with the progress event. Optional.
 */
interface ProgressResp {
  type: string;
  message: string;
  identifier?: string;
  data?: Record<string, any>;
}

/**
 * A wrapper class for initiating calls to Electron via desktopApi for managing plugins.
 */
export class PluginManager {
  /**
   * Adds a listener with limitations to the 'plugin-manager' event.
   * The listener will be removed after receiving a response with the matching identifier or after reaching the message limit.
   * If no response is received within a reasonable time, the promise will be rejected with a timeout error.
   *
   * @param {string} identifier - The unique identifier for the plugin.
   * @returns {Promise<ProgressResp>} - A promise that resolves with the response if a matching one is received, or rejects with an error if the message limit or timeout is exceeded.
   * @private
   *
   */
  private static async addListenerWithLimitations(identifier: string): Promise<ProgressResp> {
    const waitCount = 10;
    let count = 0;

    return new Promise((resolve, reject) => {
      const handleResponse = (response: string) => {
        const parsedResponse = JSON.parse(response);
        if (parsedResponse.identifier === identifier) {
          clearTimeout(timeoutId);
          window.desktopApi.removeListener('plugin-manager', handleResponse);
          resolve(parsedResponse);
        } else if (++count >= waitCount) {
          clearTimeout(timeoutId);
          window.desktopApi.removeListener('plugin-manager', handleResponse);
          reject(new Error('Message limit exceeded without a matching response'));
        }
      };

      window.desktopApi.receive('plugin-manager', handleResponse);

      // Add a timeout to ensure the promise is rejected if no response is received within a reasonable time
      const timeoutId = setTimeout(() => {
        window.desktopApi.removeListener('plugin-manager', handleResponse);
        reject(new Error('Timeout exceeded without a matching response'));
      }, 10000);
    });
  }

  /**
   * Sends a request to install a plugin from the specified ArtifactHub URL.
   *
   * @param {string} identifier - The unique identifier for the plugin.
   * @param {string} name - The name of the plugin to be installed.
   * @param {string} URL - The URL from where the plugin will be installed.
   * @static
   * @example
   * PluginManager.install('pluginID', ' https://artifacthub.io/packages/headlamp/<repo_name>/<plugin_name>');
   */
  static install(identifier: string, name: string, URL: string) {
    window.desktopApi.send(
      'plugin-manager',
      JSON.stringify({
        action: 'INSTALL',
        identifier,
        URL,
        pluginName: name,
      })
    );
  }

  /**
   * Sends a request to update a plugin with the specified identifier and name.
   *
   * @param {string} identifier - The unique identifier for the plugin.
   * @param {string} name - The name of the plugin to be updated.
   * @static
   * @example
   * PluginManager.update('pluginID', 'my-plugin');
   */
  static update(identifier: string, name: string) {
    window.desktopApi.send(
      'plugin-manager',
      JSON.stringify({
        action: 'UPDATE',
        identifier,
        pluginName: name,
      })
    );
  }

  /**
   * Sends a request to uninstall a plugin with the specified identifier and name.
   *
   * @param {string} identifier - The unique identifier for the plugin.
   * @param {string} name - The name of the plugin to be uninstalled.
   * @static
   * @example
   * PluginManager.uninstall('pluginID', 'my-plugin');
   */
  static uninstall(identifier: string, name: string) {
    window.desktopApi.send(
      'plugin-manager',
      JSON.stringify({
        action: 'UNINSTALL',
        identifier,
        pluginName: name,
      })
    );
  }

  /**
   * Sends a request to cancel the operation (install, update, uninstall) for a plugin with the specified identifier.
   *
   * @param {string} identifier - The unique identifier for the plugin.
   * @static
   * @async
   * @example
   * PluginManager.cancel('pluginID');
   */
  static async cancel(identifier: string) {
    window.desktopApi.send(
      'plugin-manager',
      JSON.stringify({
        action: 'CANCEL',
        identifier,
      })
    );
  }

  /**
   * Sends a request to list all installed plugins.
   *
   * @returns {Promise<Record<string, any> | undefined>} - A promise that resolves with a record of all installed plugins, or undefined if there was an error.
   * @throws {Error} - Throws an error if the response type is 'error'.
   * @static
   * @async
   * @example
   * try {
   *   const plugins = await PluginManager.list();
   *   console.log('Installed plugins:', plugins);
   * } catch (error) {
   *   console.error('Error:', error.message);
   * }
   */
  static async list(): Promise<Record<string, any> | undefined> {
    const identifier = 'list-plugins';
    window.desktopApi.send(
      'plugin-manager',
      JSON.stringify({
        action: 'LIST',
        identifier,
      })
    );
    const data = await this.addListenerWithLimitations(identifier);
    if (data.type === 'error') {
      throw new Error(data.message);
    }
    return data.data;
  }

  /**
   * Sends a request to get the status of a plugin with the specified identifier.
   *
   * @param {string} identifier - The unique identifier for the plugin.
   * @returns {Promise<ProgressResp>} - A promise that resolves with the status of the plugin, or rejects with an error if the message limit or timeout is exceeded.
   * @static
   * @async
   * @example
   * try {
   *   const status = await PluginManager.getStatus('pluginID');
   *   console.log('Plugin status:', status);
   * } catch (error) {
   *   console.error('Error:', error.message);
   * }
   */
  static async getStatus(identifier: string): Promise<ProgressResp> {
    window.desktopApi.send(
      'plugin-manager',
      JSON.stringify({
        action: 'GET',
        identifier,
      })
    );
    return await this.addListenerWithLimitations(identifier);
  }
}
