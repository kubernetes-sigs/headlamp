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

import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';
import type { SecureStorageBridge } from '../../../frontend/src/plugin/secureStorage';

/** Renderer bridge used by the isolated Electron fixture. */
type StorageTestWindow = typeof window & {
  desktopApi: {
    secureStorage: SecureStorageBridge & {
      register: (namespaces: string[]) => Promise<Record<string, string>>;
    };
  };
};

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

test.describe('plugin secure storage', () => {
  let electronApp: ElectronApplication;
  let electronPage: Page;
  let userDataDirectory: string;

  test.beforeAll(async () => {
    userDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-secure-storage-e2e-'));
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--user-data-dir=${userDataDirectory}`],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
      },
    });
    electronPage = await electronApp.firstWindow();
    await electronPage.waitForLoadState('load');
  });

  test.afterAll(async () => {
    await electronApp?.close();
    if (userDataDirectory) {
      fs.rmSync(userDataDirectory, { recursive: true, force: true });
    }
  });

  test('rejects an unknown capability across the Electron bridge', async () => {
    const result = await electronPage.evaluate(async () => {
      return (window as StorageTestWindow).desktopApi.secureStorage.save(
        'invalid-capability',
        'token',
        'value'
      );
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });
  });
});

test('migrates legacy GitHub storage across Electron restart and sign-out', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-storage-migration-e2e-'));
  let application: ElectronApplication | undefined;
  try {
    const profile = path.join(directory, 'profile');
    fs.mkdirSync(profile);
    const main = path.join(directory, 'main.cjs');
    const preload = path.join(directory, 'preload.cjs');
    const pageFile = path.join(directory, 'index.html');
    fs.writeFileSync(
      pageFile,
      '<!doctype html><html><body>Storage migration fixture</body></html>'
    );
    for (const [entry, outfile] of [
      [path.resolve(__dirname, '../fixtures/secureStorageMigrationMain.ts'), main],
      [path.resolve(appPath, 'electron/preload.ts'), preload],
    ]) {
      buildSync({
        entryPoints: [entry],
        outfile,
        bundle: true,
        external: ['electron'],
        platform: 'node',
        format: 'cjs',
        target: 'node20',
      });
    }
    const environment: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      ),
      HEADLAMP_STORAGE_TEST_PROFILE: profile,
      HEADLAMP_STORAGE_TEST_PRELOAD: preload,
      HEADLAMP_STORAGE_TEST_PAGE: pageFile,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    /**
     * Restarts the fixture against the same persisted profile.
     * @returns Remote handles to the scoped storage operations in the new renderer.
     */
    async function launchStorage() {
      await application?.close();
      application = await _electron.launch({
        executablePath: require('electron'),
        args: [main],
        env: environment,
      });
      const encryptionAvailable = await application.evaluate(
        ({ safeStorage }) =>
          safeStorage.isEncryptionAvailable() &&
          (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
      );
      test.skip(!encryptionAvailable, 'An OS-backed Electron encryption service is required');
      const page = await application.firstWindow();
      await page.waitForLoadState('load');
      return page.evaluateHandle(async () => {
        const bridge = (window as StorageTestWindow).desktopApi.secureStorage;
        const capabilities = await bridge.register(['shipped--aks-desktop', 'user--aks-desktop']);
        const key = 'aks-desktop:github-auth';
        const shipped = capabilities['shipped--aks-desktop'];
        return {
          load: () => bridge.load(shipped, key),
          remove: () => bridge.delete(shipped, key),
          denied: () =>
            Promise.all([
              bridge.load('shipped--aks-desktop', key),
              bridge.load(capabilities['user--aks-desktop'], key),
            ]),
        };
      });
    }

    const storagePath = path.join(profile, 'secure-storage.json');
    const token = { success: true, value: 'synthetic-refresh-token' };
    let storage = await launchStorage();
    const before = fs.readFileSync(storagePath, 'utf8');
    expect(await storage.evaluate(api => api.denied())).toEqual([
      { success: false, error: 'Invalid secure storage capability' },
      { success: true, value: null },
    ]);
    expect(fs.readFileSync(storagePath, 'utf8')).toBe(before);
    expect(await storage.evaluate(api => api.load())).toEqual(token);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf8'))).toEqual({
      'shipped--aks-desktop:aks-desktop:github-auth': JSON.parse(before)['aks-desktop:github-auth'],
    });
    expect(fs.readFileSync(storagePath, 'utf8')).not.toContain(token.value);

    storage = await launchStorage();
    expect(await storage.evaluate(api => api.load())).toEqual(token);
    expect(await storage.evaluate(api => api.remove())).toEqual({ success: true });
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf8'))).toEqual({});

    storage = await launchStorage();
    expect(await storage.evaluate(api => api.load())).toEqual({ success: true, value: null });
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf8'))).toEqual({});
  } finally {
    try {
      await application?.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});
