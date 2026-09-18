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
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron, ElectronApplication, Page } from 'playwright';

const appPath = path.resolve(__dirname, '../../');
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const electronDistPath = path.join(appPath, 'node_modules', 'electron', 'dist');
const electronResourcesPath =
  process.platform === 'darwin'
    ? path.join(electronDistPath, 'Electron.app', 'Contents', 'Resources')
    : path.join(electronDistPath, 'resources');
const pluginName = 'default-disabled-e2e';

let electronApp: ElectronApplication;
let electronPage: Page;
let pluginPath: string;
let userDataPath: string;

test.describe('plugin default enablement', () => {
  test.setTimeout(2 * 60 * 1000);

  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'This test only runs in app mode');
  });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(2 * 60 * 1000);

    if (process.env.PLAYWRIGHT_TEST_MODE !== 'app') {
      return;
    }

    pluginPath = path.join(electronResourcesPath, '.plugins', pluginName);
    fs.mkdirSync(pluginPath, { recursive: true });
    fs.writeFileSync(path.join(pluginPath, 'main.js'), '');
    fs.writeFileSync(
      path.join(pluginPath, 'package.json'),
      JSON.stringify({
        name: pluginName,
        version: '1.0.0',
        description: 'Default-disabled e2e fixture',
        homepage: 'https://example.com/default-disabled-e2e',
        isManagedByHeadlampPlugin: true,
        artifacthub: {
          title: 'Default-disabled e2e fixture',
          url: 'https://example.com/default-disabled-e2e',
          repoName: 'e2e',
          author: 'Headlamp',
          version: '1.0.0',
        },
        devDependencies: {
          '@kinvolk/headlamp-plugin': '^0.8.0',
        },
        headlamp: {
          enabledByDefault: false,
        },
      })
    );

    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-default-e2e-'));
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--user-data-dir=${userDataPath}`],
      env: {
        ...process.env,
        ELECTRON_DEV: 'true',
        NODE_ENV: 'development',
      },
    });
    electronPage = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp?.close();
    if (pluginPath) {
      fs.rmSync(pluginPath, { force: true, recursive: true });
    }
    if (userDataPath) {
      fs.rmSync(userDataPath, { force: true, recursive: true });
    }
  });

  test('starts a newly discovered default-disabled plugin disabled', async () => {
    await electronPage.waitForLoadState('load');
    const baseUrl = electronPage.url().split('#')[0];
    await electronPage.goto(`${baseUrl}#/settings/plugins`);

    const pluginRow = electronPage.getByRole('row').filter({ hasText: pluginName });
    const pluginToggle = pluginRow.getByRole('checkbox');
    await expect(pluginToggle).toBeVisible();
    await expect(pluginToggle).not.toBeChecked();
  });
});
