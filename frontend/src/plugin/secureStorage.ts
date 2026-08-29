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

/** Secure storage operations available to a single plugin. */
export interface PluginSecureStorage {
  /**
   * Saves an encrypted plugin value.
   *
   * @param key - The plugin-local storage key.
   * @param value - The plaintext value to encrypt.
   * @returns The operation result.
   */
  save(key: string, value: string): Promise<{ success: boolean; error?: string }>;
  /**
   * Loads a decrypted plugin value.
   *
   * @param key - The plugin-local storage key.
   * @returns The operation result and loaded value.
   */
  load(key: string): Promise<{ success: boolean; value?: string | null; error?: string }>;
  /**
   * Deletes a plugin value.
   *
   * @param key - The plugin-local storage key.
   * @returns The operation result.
   */
  delete(key: string): Promise<{ success: boolean; error?: string }>;
}

/**
 * Internal bridge to Electron's secure storage handlers.
 *
 * Electron creates a random, unguessable capability token for each trusted
 * plugin namespace when plugins are loaded. Possessing that token authorizes an
 * operation only within the namespace assigned to it; the token contains no
 * namespace or secret data that plugin code can interpret. This bridge accepts
 * the token on every request so the Electron main process can recover the
 * authorized namespace without trusting a namespace supplied by the plugin.
 */
export interface SecureStorageBridge {
  /**
   * Saves a value through the Electron main process.
   *
   * @param capability - Electron's unguessable token authorizing this plugin namespace.
   * @param key - The plugin-local storage key.
   * @param value - The plaintext value to encrypt.
   * @returns The operation result.
   */
  save(capability: string, key: string, value: string): ReturnType<PluginSecureStorage['save']>;
  /**
   * Loads a value through the Electron main process.
   *
   * @param capability - Electron's unguessable token authorizing this plugin namespace.
   * @param key - The plugin-local storage key.
   * @returns The operation result and loaded value.
   */
  load(capability: string, key: string): ReturnType<PluginSecureStorage['load']>;
  /**
   * Deletes a value through the Electron main process.
   *
   * @param capability - Electron's unguessable token authorizing this plugin namespace.
   * @param key - The plugin-local storage key.
   * @returns The operation result.
   */
  delete(capability: string, key: string): ReturnType<PluginSecureStorage['delete']>;
}

/** Trusted installation metadata used to isolate a plugin's secure storage. */
export interface PluginSecureStorageMetadata {
  /** Folder name reported by the backend plugin inventory. */
  folderName?: string;
  /** Plugin priority and migration type reported by the backend. */
  type?: 'development' | 'user' | 'shipped';
  /** Inventory root reported by the backend plugin inventory. */
  source?: 'development' | 'user' | 'shipped';
}

/**
 * Derives a storage namespace from backend-controlled plugin metadata.
 *
 * @param metadata - The plugin's trusted installation metadata.
 * @returns A source-specific namespace, or undefined for incomplete metadata.
 */
export function getPluginSecureStorageNamespace(
  metadata: PluginSecureStorageMetadata
): string | undefined {
  const validSources = new Set(['development', 'user', 'shipped']);
  if (!metadata.folderName || !metadata.source || !validSources.has(metadata.source)) {
    return undefined;
  }
  return `${metadata.source}--${metadata.folderName}`;
}

/**
 * Creates the secure storage API passed to one plugin.
 *
 * Electron assigns a random, unguessable capability token to the plugin's
 * trusted storage namespace. This function closes over that token and attaches
 * it automatically to every save, load, and delete request. Plugin code sees
 * only the returned key/value API: it does not choose a namespace, pass the
 * token itself, or inspect what the token represents. The Electron main process
 * accepts the request only when the token maps to a namespace registered for
 * the current page load. This prevents a plugin from reading another plugin's
 * values merely by naming that plugin's namespace.
 *
 * @param capability - Electron's unguessable token for this plugin's namespace.
 * @param bridge - The trusted Electron secure storage bridge.
 * @returns Frozen storage operations that automatically use this plugin's token.
 */
export function createPluginSecureStorage(
  capability: string,
  bridge: SecureStorageBridge
): PluginSecureStorage {
  return Object.freeze({
    save: (key: string, value: string) => bridge.save(capability, key, value),
    load: (key: string) => bridge.load(capability, key),
    delete: (key: string) => bridge.delete(capability, key),
  });
}
