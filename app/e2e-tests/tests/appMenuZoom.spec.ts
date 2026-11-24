/*
 * Copyright 2026 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect, test } from '@playwright/test';
import fs from 'fs';
import { createServer, Server } from 'node:http';
import os from 'os';
import path from 'path';
import { _electron, ElectronApplication, Page } from 'playwright';

const electronPath = require('electron') as string;
const appPath = path.resolve(__dirname, '../../');
const userDataDir = path.join(os.tmpdir(), `headlamp-e2e-zoom-${process.pid}`);

let electronApp: ElectronApplication;
let electronPage: Page;
let backend: Server;

if (process.env.PLAYWRIGHT_TEST_MODE === 'app') {
  test.beforeAll(async () => {
    backend = createServer((request, response) => {
      if (request.url === '/config') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
    const address = backend.address();
    if (!address || typeof address === 'string') throw new Error('Backend did not acquire a port');
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--port=${address.port}`, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        HOME: userDataDir,
        APPDATA: userDataDir,
        LOCALAPPDATA: userDataDir,
        XDG_CONFIG_HOME: userDataDir,
        XDG_DATA_HOME: userDataDir,
        ELECTRON_DEV: 'true',
        ELECTRON_START_URL: 'data:text/html,<title>Headlamp zoom test</title>',
        EXTERNAL_SERVER: 'true',
        HEADLAMP_CHECK_FOR_UPDATES: 'false',
        HEADLAMP_MCP_ENABLE: 'false',
      },
    });

    electronPage = await electronApp.firstWindow();
    await electronPage.waitForLoadState('load');
  });

  test.afterAll(async () => {
    await electronApp?.close();
    if (backend?.listening) {
      await new Promise<void>((resolve, reject) =>
        backend.close(error => (error ? reject(error) : resolve()))
      );
    }
    fs.rmSync(userDataDir, { force: true, recursive: true });
  });
}

test.describe('application menu zoom actions', () => {
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'This test only runs in app mode');
  });

  test('changes and resets the window zoom factor', async () => {
    await electronPage.evaluate(() => {
      window.desktopApi.send('setMenu', [
        {
          id: 'serialized-view',
          label: 'View',
          submenu: [
            { id: 'original-reset-zoom', label: 'Reset Zoom' },
            { id: 'original-zoom-in', label: 'Zoom In' },
            { id: 'original-zoom-out', label: 'Zoom Out' },
          ],
        },
      ]);
    });

    await expect.poll(() => hasMenuItem('original-zoom-in')).toBe(true);
    await clickMenuItem('original-reset-zoom');
    await expect.poll(() => getZoomFactor()).toBe(1);

    await clickMenuItem('original-zoom-in');
    await expect.poll(() => getZoomFactor()).toBeCloseTo(1.1);

    await clickMenuItem('original-reset-zoom');
    await expect.poll(() => getZoomFactor()).toBe(1);

    await clickMenuItem('original-zoom-out');
    await expect.poll(() => getZoomFactor()).toBeCloseTo(0.9);
  });
});

async function clickMenuItem(id: string) {
  await electronApp.evaluate(async ({ BrowserWindow, Menu }, menuId) => {
    const window = BrowserWindow.getAllWindows()[0];
    const menuItem = Menu.getApplicationMenu()?.getMenuItemById(menuId);
    if (!window || !menuItem?.click) {
      throw new Error(`Menu item ${menuId} is not clickable`);
    }

    menuItem.click(menuItem, window, {} as Electron.KeyboardEvent);
  }, id);
}

async function getZoomFactor() {
  return electronApp.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor();
  });
}

async function hasMenuItem(id: string) {
  return electronApp.evaluate(({ Menu }, menuId) => {
    return Boolean(Menu.getApplicationMenu()?.getMenuItemById(menuId));
  }, id);
}
