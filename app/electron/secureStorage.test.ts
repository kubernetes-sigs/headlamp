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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { backend, encryptionAvailable, handlers, userDataPath } = vi.hoisted(() => ({
  backend: { value: 'secret_service' },
  encryptionAvailable: { value: true },
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  userDataPath: { value: '' },
}));

vi.mock('electron', () => ({
  app: { getPath: () => userDataPath.value },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      if (handlers.has(channel)) {
        throw new Error(`Handler already registered for ${channel}`);
      }
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => handlers.delete(channel),
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable.value,
    getSelectedStorageBackend: () => backend.value,
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: vi.fn((value: Buffer) => value.toString().replace(/^encrypted:/, '')),
  },
}));

import { safeStorage } from 'electron';
import {
  createSecureStorageCapabilities,
  isValidKey,
  isValidNamespace,
  PluginSecureStorage,
  readSecureStorageFile,
  SECURE_STORAGE_DELETE,
  SECURE_STORAGE_LOAD,
  SECURE_STORAGE_REGISTER,
  SECURE_STORAGE_SAVE,
  setupSecureStorageHandlers,
  writeSecureStorageFile,
} from './secureStorage';

const MAX_STORAGE_FILE_BYTES = 4 * 1024 * 1024;

describe('secure storage validation', () => {
  it('accepts package namespaces and safe keys', () => {
    expect(isValidNamespace('example-plugin')).toBe(true);
    expect(isValidNamespace('@example/plugin')).toBe(true);
    expect(isValidKey('oauth:token')).toBe(true);
  });

  it.each(['', '../plugin', 'plugin/name', '__proto__'])(
    'rejects an invalid namespace or key: %s',
    value => {
      expect(isValidNamespace(value) && isValidKey(value)).toBe(false);
    }
  );

  it('creates distinct opaque capabilities for valid namespaces', () => {
    const { capabilities, namespaceByCapability } = createSecureStorageCapabilities([
      '@example/one',
      '@example/two',
      '../invalid',
    ]);

    expect(Object.keys(capabilities)).toEqual(['@example/one', '@example/two']);
    expect(capabilities['@example/one']).not.toBe(capabilities['@example/two']);
    expect(namespaceByCapability.get(capabilities['@example/one'])).toBe('@example/one');
  });

  it('rejects invalid and excessive registration values', () => {
    expect(createSecureStorageCapabilities('example').capabilities).toEqual({});
    expect(createSecureStorageCapabilities(new Array(257).fill('example')).capabilities).toEqual(
      {}
    );
    expect(isValidNamespace('a'.repeat(215))).toBe(false);
    expect(isValidKey('a'.repeat(129))).toBe(false);
    expect(isValidNamespace(1)).toBe(false);
    expect(isValidKey(1)).toBe(false);
  });

  it('returns an empty record when the storage file does not exist', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-missing-secure-storage-'));
    const storagePath = path.join(directory, 'secure-storage.json');

    expect(readSecureStorageFile(storagePath)).toEqual({});
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([null, [], 'value', 1])('rejects a non-record storage file: %j', value => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-read-'));
    const storagePath = path.join(directory, 'secure-storage.json');
    fs.writeFileSync(storagePath, JSON.stringify(value));

    expect(() => readSecureStorageFile(storagePath)).toThrow('Invalid secure storage data');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('rejects an existing store over the aggregate byte limit before reading it', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-size-'));
    const storagePath = path.join(directory, 'secure-storage.json');
    fs.writeFileSync(
      storagePath,
      JSON.stringify({ '@example/one:token': 'a'.repeat(MAX_STORAGE_FILE_BYTES) })
    );
    const read = vi.spyOn(fs, 'readFileSync');

    try {
      expect(() => readSecureStorageFile(storagePath)).toThrow('Secure storage size limit reached');
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a store that exceeds the aggregate byte limit while being read', () => {
    const storagePath = '/secure-storage.json';
    const stat = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1 } as fs.Stats);
    const read = vi
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(
        JSON.stringify({ '@example/one:token': 'a'.repeat(MAX_STORAGE_FILE_BYTES) })
      );

    try {
      expect(() => readSecureStorageFile(storagePath)).toThrow('Secure storage size limit reached');
    } finally {
      read.mockRestore();
      stat.mockRestore();
    }
  });

  it('rejects a snapshot over the aggregate byte limit before creating a file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-size-'));
    const storagePath = path.join(directory, 'secure-storage.json');

    try {
      expect(() =>
        writeSecureStorageFile(storagePath, {
          '@example/one:token': 'a'.repeat(MAX_STORAGE_FILE_BYTES),
        })
      ).toThrow('Secure storage size limit reached');
      expect(fs.existsSync(storagePath)).toBe(false);
      expect(fs.readdirSync(directory)).toEqual([]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('PluginSecureStorage', () => {
  let directory: string;
  let storagePath: string;
  let storage: PluginSecureStorage;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-'));
    storagePath = path.join(directory, 'secure-storage.json');
    storage = new PluginSecureStorage(storagePath);
    backend.value = 'secret_service';
    encryptionAvailable.value = true;
    vi.mocked(safeStorage.encryptString).mockClear();
    vi.mocked(safeStorage.decryptString).mockClear();
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('keeps values isolated by plugin namespace', () => {
    expect(storage.save('@example/one', 'token', 'first')).toEqual({ success: true });
    expect(storage.save('@example/two', 'token', 'second')).toEqual({ success: true });

    expect(storage.load('@example/one', 'token')).toEqual({
      success: true,
      value: 'first',
    });
    expect(storage.load('@example/two', 'token')).toEqual({
      success: true,
      value: 'second',
    });
  });

  it('deletes only the calling plugin value', () => {
    storage.save('@example/one', 'token', 'first');
    storage.save('@example/two', 'token', 'second');

    expect(storage.delete('@example/one', 'token')).toEqual({ success: true });
    expect(storage.load('@example/one', 'token')).toEqual({ success: true, value: null });
    expect(storage.load('@example/two', 'token')).toEqual({
      success: true,
      value: 'second',
    });
  });

  it('rejects plaintext fallback storage on Linux', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    backend.value = 'basic_text';

    expect(storage.save('@example/one', 'token', 'value')).toEqual({
      success: false,
      error: 'Encryption unavailable',
    });
    platform.mockRestore();
  });

  it('rejects invalid inputs and unavailable encryption', () => {
    expect(storage.save('../invalid', 'token', 'value')).toEqual({
      success: false,
      error: 'Invalid storage namespace or key',
    });
    expect(storage.save('@example/one', 'invalid key', 'value')).toEqual({
      success: false,
      error: 'Invalid storage namespace or key',
    });
    expect(storage.save('@example/one', 'token', 1)).toEqual({
      success: false,
      error: 'Invalid storage value',
    });
    expect(storage.save('@example/one', 'token', 'a'.repeat(64 * 1024 + 1))).toEqual({
      success: false,
      error: 'Invalid storage value',
    });

    encryptionAvailable.value = false;
    expect(storage.load('@example/one', 'token')).toEqual({
      success: false,
      error: 'Encryption unavailable',
    });
    expect(storage.delete('@example/one', 'token')).toEqual({
      success: false,
      error: 'Encryption unavailable',
    });
  });

  it('enforces each plugin entry limit while allowing updates', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 256 }, (_, index) => [`@example/one:key-${index}`, 'encrypted:value'])
    );
    fs.writeFileSync(storagePath, JSON.stringify(entries));

    expect(storage.save('@example/one', 'another-key', 'value')).toEqual({
      success: false,
      error: 'Storage entry limit reached',
    });
    expect(storage.save('@example/one', 'key-0', 'updated')).toEqual({ success: true });
  });

  it('enforces the persisted namespace limit while allowing existing namespaces', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 256 }, (_, index) => [`plugin-${index}:token`, 'encrypted:value'])
    );
    fs.writeFileSync(storagePath, JSON.stringify(entries));

    expect(storage.save('another-plugin', 'token', 'value')).toEqual({
      success: false,
      error: 'Storage namespace limit reached',
    });
    expect(storage.save('plugin-0', 'another-key', 'value')).toEqual({ success: true });
  });

  it('reports persistence failures', () => {
    vi.mocked(safeStorage.encryptString).mockImplementationOnce(() => {
      throw new Error('encryption failed');
    });
    expect(storage.save('@example/one', 'token', 'value')).toEqual({
      success: false,
      error: 'Unable to save secure storage value',
    });

    expect(storage.delete('@example/one', 'missing')).toEqual({ success: true });
    storage.save('@example/one', 'token', 'value');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('rename failed');
    });
    expect(storage.delete('@example/one', 'token')).toEqual({
      success: false,
      error: 'Unable to delete secure storage value',
    });
    rename.mockRestore();
  });

  it('preserves an unreadable store and reports each operation failure', () => {
    const persisted = JSON.stringify({ '@example/one:token': 'encrypted:value' });
    fs.writeFileSync(storagePath, persisted);
    const permissionError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const read = vi
      .spyOn(fs, 'readFileSync')
      .mockImplementationOnce(() => {
        throw permissionError;
      })
      .mockImplementationOnce(() => {
        throw permissionError;
      })
      .mockImplementationOnce(() => {
        throw permissionError;
      });

    try {
      expect(storage.save('@example/one', 'other', 'new')).toEqual({
        success: false,
        error: 'Unable to save secure storage value',
      });
      expect(storage.load('@example/one', 'token')).toEqual({
        success: false,
        error: 'Unable to load secure storage value',
      });
      expect(storage.delete('@example/one', 'token')).toEqual({
        success: false,
        error: 'Unable to delete secure storage value',
      });
    } finally {
      read.mockRestore();
    }
    expect(fs.readFileSync(storagePath, 'utf8')).toBe(persisted);
  });

  it('preserves malformed JSON and rejects mutations', () => {
    const malformed = '{"@example/one:token":';
    fs.writeFileSync(storagePath, malformed);

    expect(storage.save('@example/one', 'other', 'new')).toEqual({
      success: false,
      error: 'Unable to save secure storage value',
    });
    expect(storage.load('@example/one', 'token')).toEqual({
      success: false,
      error: 'Unable to load secure storage value',
    });
    expect(storage.delete('@example/one', 'token')).toEqual({
      success: false,
      error: 'Unable to delete secure storage value',
    });
    expect(fs.readFileSync(storagePath, 'utf8')).toBe(malformed);
  });

  it('preserves ciphertext that cannot be decrypted', () => {
    fs.writeFileSync(storagePath, JSON.stringify({ '@example/one:token': 'invalid' }));
    vi.mocked(safeStorage.decryptString).mockImplementationOnce(() => {
      throw new Error('decryption failed');
    });

    expect(storage.load('@example/one', 'token')).toEqual({
      success: false,
      error: 'Unable to decrypt secure storage value',
    });
    expect(readSecureStorageFile(storagePath)).toEqual({
      '@example/one:token': 'invalid',
    });
  });

  it('uses restricted file permissions on non-Windows platforms', () => {
    storage.save('@example/one', 'token', 'value');

    if (process.platform !== 'win32') {
      expect(fs.statSync(storagePath).mode & 0o777).toBe(0o600);
    }
  });

  it('ignores malformed persisted entries', () => {
    fs.writeFileSync(
      storagePath,
      JSON.stringify({
        '@example/one:token': 'encrypted:value',
        '../invalid:token': 'encrypted:other',
        constructor: 'encrypted:other',
      })
    );

    expect(readSecureStorageFile(storagePath)).toEqual({
      '@example/one:token': 'encrypted:value',
    });
  });
});

describe('setupSecureStorageHandlers', () => {
  it('revokes capabilities while a new main-frame document is loading', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const trustedStartUrl = 'file:///trusted/headlamp/index.html';
    const mainFrame = { url: trustedStartUrl };
    const webContents = {
      mainFrame,
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
    };
    const event = { sender: webContents, senderFrame: mainFrame };
    userDataPath.value = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-ipc-'));
    handlers.clear();
    setupSecureStorageHandlers({ webContents } as never, trustedStartUrl);

    const register = handlers.get(SECURE_STORAGE_REGISTER)!;
    const load = handlers.get(SECURE_STORAGE_LOAD)!;
    const capabilities = register(event, ['@example/one']) as Record<string, string>;
    const capability = capabilities['@example/one'];

    listeners.get('did-start-navigation')!(undefined, trustedStartUrl, false, true);
    expect(load(event, capability, 'token')).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });
    expect(register(event, ['@example/loading'])).toEqual({});

    listeners.get('did-frame-navigate')!(undefined, trustedStartUrl, 200, 'OK', true);
    expect(Object.keys(register(event, ['@example/two']) as Record<string, string>)).toEqual([
      '@example/two',
    ]);

    fs.rmSync(userDataPath.value, { recursive: true, force: true });
  });

  it('authorizes the main renderer once per page load', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const trustedStartUrl = 'file:///trusted/headlamp/index.html';
    const mainFrame = { url: `${trustedStartUrl}#/` };
    const webContents = {
      mainFrame,
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
    };
    const mainWindow = { webContents };
    const otherSender = {};
    userDataPath.value = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-ipc-'));
    handlers.clear();
    setupSecureStorageHandlers(mainWindow as never, trustedStartUrl);

    const register = handlers.get(SECURE_STORAGE_REGISTER)!;
    const save = handlers.get(SECURE_STORAGE_SAVE)!;
    const load = handlers.get(SECURE_STORAGE_LOAD)!;
    const remove = handlers.get(SECURE_STORAGE_DELETE)!;
    const event = { sender: webContents, senderFrame: mainFrame };

    mainFrame.url = 'https://untrusted.example/';
    expect(register(event, ['@example/untrusted'])).toEqual({});
    mainFrame.url = 'file:///trusted/headlamp/other.html';
    expect(register(event, ['@example/sibling'])).toEqual({});
    mainFrame.url = `${trustedStartUrl}#/`;
    expect(
      register({ sender: webContents, senderFrame: { url: mainFrame.url } }, ['@example/frame'])
    ).toEqual({});

    const capabilities = register(event, ['@example/one']) as Record<string, string>;
    const capability = capabilities['@example/one'];

    expect(register(event, ['@example/two'])).toEqual({});
    expect(register({ sender: otherSender }, ['@example/two'])).toEqual({});
    expect(save(event, capability, 'token', 'value')).toEqual({ success: true });
    expect(load(event, capability, 'token')).toEqual({ success: true, value: 'value' });
    expect(remove(event, capability, 'token')).toEqual({ success: true });
    expect(save({ sender: otherSender }, capability, 'token', 'value')).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });
    mainFrame.url = 'https://untrusted.example/';
    expect(load(event, capability, 'token')).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });
    mainFrame.url = `${trustedStartUrl}#/`;
    expect(load(event, 1, 'token')).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });
    expect(remove(event, 'invalid', 'token')).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });

    listeners.get('did-start-navigation')!(undefined, trustedStartUrl, false, false);
    expect(register(event, ['@example/two'])).toEqual({});
    listeners.get('did-frame-navigate')!(undefined, trustedStartUrl, 200, 'OK', false);
    expect(register(event, ['@example/two'])).toEqual({});
    listeners.get('did-start-navigation')!(undefined, trustedStartUrl, false, true);
    expect(register(event, ['@example/two'])).toEqual({});
    listeners.get('did-frame-navigate')!(undefined, trustedStartUrl, 200, 'OK', true);
    expect(Object.keys(register(event, ['@example/two']) as Record<string, string>)).toEqual([
      '@example/two',
    ]);

    fs.rmSync(userDataPath.value, { recursive: true, force: true });
  });

  it('replaces IPC handlers when the main window is recreated', () => {
    const trustedStartUrl = 'file:///trusted/headlamp/index.html';
    const firstFrame = { url: trustedStartUrl };
    const firstWebContents = {
      mainFrame: firstFrame,
      on: vi.fn(),
    };
    const firstEvent = { sender: firstWebContents, senderFrame: firstFrame };
    userDataPath.value = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-ipc-'));
    handlers.clear();
    setupSecureStorageHandlers({ webContents: firstWebContents } as never, trustedStartUrl);

    const firstRegister = handlers.get(SECURE_STORAGE_REGISTER)!;
    const firstCapabilities = firstRegister(firstEvent, ['@example/one']) as Record<string, string>;
    const firstCapability = firstCapabilities['@example/one'];

    const secondFrame = { url: trustedStartUrl };
    const secondWebContents = {
      mainFrame: secondFrame,
      on: vi.fn(),
    };
    const secondEvent = { sender: secondWebContents, senderFrame: secondFrame };

    expect(() =>
      setupSecureStorageHandlers({ webContents: secondWebContents } as never, trustedStartUrl)
    ).not.toThrow();

    const register = handlers.get(SECURE_STORAGE_REGISTER)!;
    const load = handlers.get(SECURE_STORAGE_LOAD)!;
    expect(register(firstEvent, ['@example/old-window'])).toEqual({});
    expect(load(firstEvent, firstCapability, 'token')).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });
    expect(Object.keys(register(secondEvent, ['@example/two']) as Record<string, string>)).toEqual([
      '@example/two',
    ]);

    fs.rmSync(userDataPath.value, { recursive: true, force: true });
  });
});
