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
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron } from 'playwright';

const appPath = path.resolve(__dirname, '../..');
const electronPath = path.join(
  appPath,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'darwin'
    ? 'Electron.app/Contents/MacOS/Electron'
    : process.platform === 'win32'
    ? 'electron.exe'
    : 'electron'
);

test('restores native default menus when renderer plugins are not re-registered', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-menu-reload-'));
  const html = path.join(profile, 'index.html');
  const kubeconfig = path.join(profile, 'kubeconfig');
  fs.writeFileSync(
    html,
    '<!doctype html><html><title>Menu reload</title><body>Menu reload</body></html>'
  );
  fs.writeFileSync(
    kubeconfig,
    'apiVersion: v1\nkind: Config\nclusters: []\ncontexts: []\nusers: []\n'
  );
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to reserve a backend port'));
        return;
      }
      server.close(error => (error ? reject(error) : resolve(address.port)));
    });
  });
  let app: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  try {
    const electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--port=${port}`, `--user-data-dir=${path.join(profile, 'electron')}`],
      env: {
        ...process.env,
        HOME: profile,
        APPDATA: profile,
        LOCALAPPDATA: profile,
        XDG_CONFIG_HOME: profile,
        KUBECONFIG: kubeconfig,
        ELECTRON_DEV: 'true',
        ELECTRON_START_URL: pathToFileURL(html).href,
        EXTERNAL_SERVER: 'false',
      },
    });
    app = electronApp;
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('load');
    await page.evaluate(() => {
      const api = (
        window as Window & {
          desktopApi?: { send: (channel: string, data?: unknown) => void };
        }
      ).desktopApi;
      if (!api) {
        throw new Error('Desktop API is unavailable');
      }
      api.send('pluginsLoaded');
      api.send('setMenu', [
        {
          id: 'original-help',
          label: 'Help',
          submenu: [{ id: 'plugin-documentation', label: 'Plugin documentation' }],
        },
      ]);
    });
    await expect
      .poll(() =>
        electronApp.evaluate(
          ({ Menu }) => !!Menu.getApplicationMenu()?.getMenuItemById('plugin-documentation')
        )
      )
      .toBe(true);

    await page.reload();
    await page.evaluate(() => {
      const api = (
        window as Window & {
          desktopApi?: { send: (channel: string) => void };
        }
      ).desktopApi;
      if (!api) {
        throw new Error('Desktop API is unavailable');
      }
      api.send('pluginsLoaded');
    });
    await expect
      .poll(() =>
        electronApp.evaluate(({ Menu }) => ({
          plugin: !!Menu.getApplicationMenu()?.getMenuItemById('plugin-documentation'),
          documentation: !!Menu.getApplicationMenu()?.getMenuItemById('original-documentation'),
          issue: !!Menu.getApplicationMenu()?.getMenuItemById('original-open-issue'),
        }))
      )
      .toEqual({ plugin: false, documentation: true, issue: true });
  } finally {
    try {
      await app?.close();
    } finally {
      await fs.promises.rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  }
});
