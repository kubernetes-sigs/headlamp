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
import path from 'path';
import { _electron, ElectronApplication, Page } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

let electronApp: ElectronApplication;
let electronPage: Page;

test.describe('desktop listener cleanup', () => {
  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
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
  });

  test('stops delivering IPC events after unsubscribe', async () => {
    await electronPage.evaluate(() => {
      const desktopApi = (window as any).desktopApi;
      (window as any).listenerCleanupEvents = [];
      (window as any).unsubscribeCommand = desktopApi.receive(
        'command-stdout',
        (commandId: string, data: string) => {
          (window as any).listenerCleanupEvents.push(`${commandId}:${data}`);
        }
      );
      (window as any).unsubscribeMarker = desktopApi.receive('command-stderr', () => {
        (window as any).listenerCleanupMarker = true;
      });
    });

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('command-stdout', 'test-command', 'before');
    });
    await expect
      .poll(() => electronPage.evaluate(() => (window as any).listenerCleanupEvents))
      .toEqual(['test-command:before']);

    await electronPage.evaluate(() => (window as any).unsubscribeCommand());
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.webContents.send('command-stdout', 'test-command', 'after');
      window.webContents.send('command-stderr', 'marker');
    });
    await expect
      .poll(() => electronPage.evaluate(() => (window as any).listenerCleanupMarker))
      .toBe(true);

    await expect(
      electronPage.evaluate(() => (window as any).listenerCleanupEvents)
    ).resolves.toEqual(['test-command:before']);
    await electronPage.evaluate(() => (window as any).unsubscribeMarker());
  });
});
