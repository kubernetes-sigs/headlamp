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
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';

/** Configuration sent by the Electron main process to the renderer. */
interface AppConfig {
  /** Whether the renderer should check for application updates. */
  checkForUpdates: boolean;
}

/** Electron IPC methods exposed to the renderer by the preload script. */
interface DesktopApi {
  /** Registers a listener for an allowed IPC channel. */
  receive(channel: string, listener: (config: AppConfig) => void): (() => void) | undefined;
  /** Sends a message on an allowed IPC channel. */
  send(channel: string): void;
}

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

let electronApp: ElectronApplication;
let electronPage: Page;

test.describe('update check configuration', () => {
  test.beforeAll(async () => {
    const electronEnvironment = { ...process.env };
    delete electronEnvironment.ELECTRON_RUN_AS_NODE;

    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...electronEnvironment,
        ELECTRON_DEV: 'true',
        HEADLAMP_CHECK_FOR_UPDATES: 'false',
        NODE_ENV: 'development',
      },
    });
    electronPage = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.close();
  });

  test('sends disabled update checks to the renderer', async () => {
    const appConfig = await electronPage.evaluate(() => {
      const desktopApi = (window as Window & { desktopApi: DesktopApi }).desktopApi;

      return new Promise<AppConfig>(resolve => {
        const unsubscribe = desktopApi.receive('appConfig', config => {
          unsubscribe?.();
          resolve(config);
        });
        desktopApi.send('appConfig');
      });
    });

    expect(appConfig.checkForUpdates).toBe(false);
  });
});
