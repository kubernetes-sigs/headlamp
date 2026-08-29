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
 * Provides capability-scoped encrypted storage to desktop plugins.
 *
 * @remarks
 * ## Execution and concurrency model
 *
 * This module runs in Electron's main process. Its IPC handlers and file-system
 * operations are synchronous and contain no `await`, so each request runs to
 * completion on the main-process JavaScript thread before another IPC callback
 * can run. This serializes requests made through this module within one
 * Headlamp process, at the cost of briefly blocking the main process during
 * disk and operating-system key-store access.
 *
 * This module does not provide an operating-system file lock or coordinate with
 * other processes that modify the storage file. Headlamp's application-level
 * single-instance lock normally prevents a second Headlamp process, but callers
 * must not treat these helpers as a general cross-process transaction API.
 *
 * ## Security model
 *
 * - IPC requests are accepted only from the main frame of the main Headlamp
 *   window while it displays the configured Headlamp document URL.
 * - During each page load, that document may register trusted plugin namespaces
 *   once. Electron creates a random capability token for each namespace and
 *   forgets all tokens when main-frame navigation starts.
 * - Save, load, and delete requests identify a namespace only through its
 *   capability token. Renderer code cannot select a namespace by name at the
 *   storage IPC boundary.
 * - Values are encrypted and decrypted by Electron `safeStorage`. Linux's
 *   plaintext `basic_text` fallback is rejected.
 * - Namespaces, keys, values, entry counts, namespace counts, and the shared
 *   store's serialized size are bounded. Persisted prototype keys and malformed
 *   values are discarded.
 * - Read and decryption failures preserve existing ciphertext instead of
 *   treating the store or value as absent.
 *
 * ## Persistence and platform limits
 *
 * A complete JSON snapshot is written to a temporary file, flushed, closed,
 * and then renamed over the destination. This avoids exposing a partially
 * written destination in the usual local-file-system case, but Node does not
 * document a cross-platform atomicity guarantee for `renameSync`, and this code
 * does not make the directory entry durable with a directory `fsync`.
 *
 * The temporary file is created with mode `0o600` on POSIX systems. Windows
 * does not implement Unix owner/group/other mode distinctions, so `0o600` is
 * not an owner-only Windows ACL. On Windows, access control comes from the ACL
 * inherited from Electron's per-user `userData` directory; confidentiality of
 * the file contents additionally comes from `safeStorage` encryption.
 *
 * @packageDocumentation
 */

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { app, ipcMain, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** IPC channel used to register plugin namespaces and receive opaque capabilities. */
export const SECURE_STORAGE_REGISTER = 'secure-storage-register';
/** IPC channel used to save an encrypted plugin value. */
export const SECURE_STORAGE_SAVE = 'secure-storage-save';
/** IPC channel used to load and decrypt a plugin value. */
export const SECURE_STORAGE_LOAD = 'secure-storage-load';
/** IPC channel used to delete a plugin value. */
export const SECURE_STORAGE_DELETE = 'secure-storage-delete';

/** Secure-storage IPC channels replaced together when the main window changes. */
const SECURE_STORAGE_CHANNELS = [
  SECURE_STORAGE_REGISTER,
  SECURE_STORAGE_SAVE,
  SECURE_STORAGE_LOAD,
  SECURE_STORAGE_DELETE,
] as const;

/** Package-like names accepted as trusted plugin storage namespaces. */
const VALID_NAMESPACE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
/** Characters accepted in plugin-local storage keys. */
const VALID_KEY = /^[a-z0-9_-][a-z0-9:_-]*$/i;
/** Object prototype properties that must never become persisted storage keys. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Maximum npm-compatible plugin namespace length. */
const MAX_NAMESPACE_LENGTH = 214;
/** Maximum plugin-local storage key length. */
const MAX_KEY_LENGTH = 128;
/** Maximum plaintext value size in UTF-16 code units. */
const MAX_VALUE_LENGTH = 64 * 1024;
/** Maximum encrypted entries persisted for one plugin namespace. */
const MAX_ENTRIES_PER_NAMESPACE = 256;
/** Maximum distinct plugin namespaces in registration and persisted storage. */
const MAX_NAMESPACES = 256;
/** Maximum UTF-8 size of the shared encrypted storage JSON file. */
const MAX_STORAGE_FILE_BYTES = 4 * 1024 * 1024;

/** The result of a secure storage operation. */
export interface SecureStorageResult {
  /** Whether the operation completed successfully. */
  success: boolean;
  /** The loaded plaintext value, or null when the key does not exist. */
  value?: string | null;
  /** A stable error description when the operation fails. */
  error?: string;
}

/** Opaque capability registration data for trusted plugin namespaces. */
export interface SecureStorageCapabilities {
  /** Opaque capability keyed by trusted plugin namespace. */
  capabilities: Record<string, string>;
  /** Trusted plugin namespace keyed by opaque capability. */
  namespaceByCapability: Map<string, string>;
}

/**
 * Checks whether a value is a valid plugin storage namespace.
 *
 * @param namespace - The value to validate.
 * @returns Whether the value can be used as a storage namespace.
 */
export function isValidNamespace(namespace: unknown): namespace is string {
  return (
    typeof namespace === 'string' &&
    namespace.length <= MAX_NAMESPACE_LENGTH &&
    VALID_NAMESPACE.test(namespace)
  );
}

/**
 * Checks whether a value is a valid plugin storage key.
 *
 * @param key - The value to validate.
 * @returns Whether the value can be used as a storage key.
 */
export function isValidKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length <= MAX_KEY_LENGTH &&
    VALID_KEY.test(key) &&
    !DANGEROUS_KEYS.has(key)
  );
}

/**
 * Combines a trusted plugin namespace and plugin-local key for persistence.
 *
 * @param namespace - The plugin's trusted installation namespace.
 * @param key - The plugin-local storage key.
 * @returns The namespaced key written to the secure storage file.
 */
function storedKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

/**
 * Checks whether a persisted key contains a valid namespace and local key.
 *
 * @param key - The persisted namespaced key to validate.
 * @returns Whether the key is safe to load into secure storage.
 */
function isValidStoredKey(key: string): boolean {
  const separator = key.indexOf(':');
  return (
    separator > 0 &&
    isValidNamespace(key.slice(0, separator)) &&
    isValidKey(key.slice(separator + 1))
  );
}

/**
 * Reads and validates encrypted entries from a secure storage file.
 *
 * @param storagePath - The secure storage file path.
 * @returns Valid encrypted entries, or an empty record when the file does not exist.
 * @throws When the file cannot be read or does not contain a record.
 */
export function readSecureStorageFile(storagePath: string): Record<string, string> {
  try {
    if (fs.statSync(storagePath).size > MAX_STORAGE_FILE_BYTES) {
      throw new Error('Secure storage size limit reached');
    }
    const serialized = fs.readFileSync(storagePath, 'utf8');
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_FILE_BYTES) {
      throw new Error('Secure storage size limit reached');
    }
    const parsed = JSON.parse(serialized);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Invalid secure storage data');
    }

    const result: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && isValidStoredKey(key)) {
        result[key] = value;
      }
    }
    return result;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return Object.create(null);
    }
    throw error;
  }
}

/**
 * Writes a complete encrypted-store snapshot before replacing the destination.
 *
 * The temporary file is flushed before replacement. Mode `0o600` supplies
 * owner-only permissions on POSIX systems, but does not create an equivalent
 * Windows ACL. Replacement behavior and atomicity depend on the operating
 * system and file system.
 *
 * @param storagePath - The secure storage file path.
 * @param data - The encrypted entries to persist.
 */
export function writeSecureStorageFile(storagePath: string, data: Record<string, string>): void {
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_FILE_BYTES) {
    throw new Error('Secure storage size limit reached');
  }
  const temporaryPath = `${storagePath}.tmp-${process.pid}-${Date.now()}`;
  const descriptor = fs.openSync(temporaryPath, 'w', 0o600);
  try {
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  try {
    fs.renameSync(temporaryPath, storagePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }
}

/**
 * Checks whether Electron provides encrypted storage without a plaintext fallback.
 *
 * @returns Whether secure values can be encrypted on the current platform.
 */
function encryptionIsAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
}

/**
 * Checks whether a document URL is the configured Headlamp document.
 *
 * Hash fragments are ignored because Headlamp uses them for client-side routes.
 * The protocol, host, port, path, and query must otherwise match exactly.
 *
 * @param documentUrl - The URL of the renderer document making an IPC request.
 * @param trustedStartUrl - The URL originally loaded into the Headlamp window.
 * @returns Whether the request comes from the trusted Headlamp document.
 */
function isTrustedDocumentUrl(documentUrl: string, trustedStartUrl: string): boolean {
  try {
    const document = new URL(documentUrl);
    const trusted = new URL(trustedStartUrl);
    document.hash = '';
    trusted.hash = '';
    return document.href === trusted.href;
  } catch {
    return false;
  }
}

/** Stores encrypted values in plugin-specific namespaces. */
export class PluginSecureStorage {
  /** File containing encrypted values keyed by trusted plugin namespace. */
  private readonly storagePath: string;

  /**
   * Creates plugin secure storage backed by a JSON file.
   *
   * @param storagePath - The secure storage file path.
   */
  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  /**
   * Encrypts and saves a value for one plugin namespace.
   *
   * @param namespace - The plugin's trusted installation namespace.
   * @param key - The plugin-local storage key.
   * @param value - The plaintext value to encrypt.
   * @returns The operation result.
   */
  save(namespace: string, key: unknown, value: unknown): SecureStorageResult {
    if (!isValidNamespace(namespace) || !isValidKey(key)) {
      return { success: false, error: 'Invalid storage namespace or key' };
    }
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) {
      return { success: false, error: 'Invalid storage value' };
    }
    if (!encryptionIsAvailable()) {
      return { success: false, error: 'Encryption unavailable' };
    }

    try {
      const data = readSecureStorageFile(this.storagePath);
      const entry = storedKey(namespace, key);
      const namespacePrefix = `${namespace}:`;
      const storedKeys = Object.keys(data);
      const namespaceEntries = storedKeys.filter(item => item.startsWith(namespacePrefix));
      if (namespaceEntries.length === 0) {
        const namespaceCount = new Set(storedKeys.map(item => item.slice(0, item.indexOf(':'))))
          .size;
        if (namespaceCount >= MAX_NAMESPACES) {
          return { success: false, error: 'Storage namespace limit reached' };
        }
      }
      const entryCount = namespaceEntries.length;
      if (!(entry in data) && entryCount >= MAX_ENTRIES_PER_NAMESPACE) {
        return { success: false, error: 'Storage entry limit reached' };
      }

      data[entry] = safeStorage.encryptString(value).toString('base64');
      writeSecureStorageFile(this.storagePath, data);
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to save secure storage value' };
    }
  }

  /**
   * Loads and decrypts a value for one plugin namespace.
   *
   * @param namespace - The plugin's trusted installation namespace.
   * @param key - The plugin-local storage key.
   * @returns The operation result and loaded value.
   */
  load(namespace: string, key: unknown): SecureStorageResult {
    if (!isValidNamespace(namespace) || !isValidKey(key)) {
      return { success: false, error: 'Invalid storage namespace or key' };
    }
    if (!encryptionIsAvailable()) {
      return { success: false, error: 'Encryption unavailable' };
    }

    let data: Record<string, string>;
    try {
      data = readSecureStorageFile(this.storagePath);
    } catch {
      return { success: false, error: 'Unable to load secure storage value' };
    }
    const entry = storedKey(namespace, key);
    const encrypted = data[entry];
    if (!encrypted) {
      return { success: true, value: null };
    }

    try {
      return {
        success: true,
        value: safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
      };
    } catch {
      return { success: false, error: 'Unable to decrypt secure storage value' };
    }
  }

  /**
   * Deletes a value from one plugin namespace.
   *
   * @param namespace - The plugin's trusted installation namespace.
   * @param key - The plugin-local storage key.
   * @returns The operation result.
   */
  delete(namespace: string, key: unknown): SecureStorageResult {
    if (!isValidNamespace(namespace) || !isValidKey(key)) {
      return { success: false, error: 'Invalid storage namespace or key' };
    }
    if (!encryptionIsAvailable()) {
      return { success: false, error: 'Encryption unavailable' };
    }

    try {
      const data = readSecureStorageFile(this.storagePath);
      const entry = storedKey(namespace, key);
      if (!(entry in data)) {
        return { success: true };
      }
      delete data[entry];
      writeSecureStorageFile(this.storagePath, data);
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to delete secure storage value' };
    }
  }
}

/**
 * Creates opaque capabilities for valid plugin namespaces.
 *
 * @param namespaces - Plugin package names requesting secure storage.
 * @returns Capabilities keyed by namespace and their reverse lookup map.
 */
export function createSecureStorageCapabilities(namespaces: unknown): SecureStorageCapabilities {
  const capabilities: Record<string, string> = Object.create(null);
  const namespaceByCapability = new Map<string, string>();
  if (!Array.isArray(namespaces) || namespaces.length > MAX_NAMESPACES) {
    return { capabilities, namespaceByCapability };
  }

  for (const namespace of new Set(namespaces)) {
    if (!isValidNamespace(namespace)) {
      continue;
    }
    const capability = crypto.randomBytes(32).toString('hex');
    capabilities[namespace] = capability;
    namespaceByCapability.set(capability, namespace);
  }
  return { capabilities, namespaceByCapability };
}

/**
 * Registers secure storage IPC handlers for the main renderer window.
 *
 * Electron permits one invoke handler per channel. Recreating the main window
 * therefore replaces all secure-storage handlers as one synchronous setup step.
 * The replacement closures reference only the new window and begin with an
 * empty capability map, so requests and tokens from the old window are rejected.
 *
 * @param mainWindow - The trusted Headlamp browser window.
 * @param trustedStartUrl - The exact Headlamp document URL allowed to use storage.
 */
export function setupSecureStorageHandlers(
  mainWindow: BrowserWindow,
  trustedStartUrl: string
): void {
  for (const channel of SECURE_STORAGE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  const storage = new PluginSecureStorage(
    path.join(app.getPath('userData'), 'secure-storage.json')
  );
  let registrationAllowed = true;
  let namespaceByCapability = new Map<string, string>();

  const fromMainWindow = (event: IpcMainInvokeEvent) =>
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    isTrustedDocumentUrl(event.senderFrame.url, trustedStartUrl);
  const namespaceFor = (event: IpcMainInvokeEvent, capability: unknown) =>
    fromMainWindow(event) && typeof capability === 'string'
      ? namespaceByCapability.get(capability)
      : undefined;

  ipcMain.handle(SECURE_STORAGE_REGISTER, (event, namespaces: unknown) => {
    if (!fromMainWindow(event) || !registrationAllowed) {
      return {};
    }
    registrationAllowed = false;
    const registration = createSecureStorageCapabilities(namespaces);
    namespaceByCapability = registration.namespaceByCapability;
    return registration.capabilities;
  });

  ipcMain.handle(SECURE_STORAGE_SAVE, (event, capability, key, value) => {
    const namespace = namespaceFor(event, capability);
    return namespace
      ? storage.save(namespace, key, value)
      : { success: false, error: 'Invalid secure storage capability' };
  });
  ipcMain.handle(SECURE_STORAGE_LOAD, (event, capability, key) => {
    const namespace = namespaceFor(event, capability);
    return namespace
      ? storage.load(namespace, key)
      : { success: false, error: 'Invalid secure storage capability' };
  });
  ipcMain.handle(SECURE_STORAGE_DELETE, (event, capability, key) => {
    const namespace = namespaceFor(event, capability);
    return namespace
      ? storage.delete(namespace, key)
      : { success: false, error: 'Invalid secure storage capability' };
  });

  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      registrationAllowed = false;
      namespaceByCapability.clear();
    }
  });
  mainWindow.webContents.on(
    'did-frame-navigate',
    (_event, url, _httpResponseCode, _httpStatusText, isMainFrame) => {
      if (isMainFrame) {
        registrationAllowed = isTrustedDocumentUrl(url, trustedStartUrl);
        namespaceByCapability.clear();
      }
    }
  );
}
