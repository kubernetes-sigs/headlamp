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
import os from 'node:os';
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

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

test.describe('plugin secure storage', () => {
  test('rejects an unknown capability across the Electron bridge', async () => {
    const result = await electronPage.evaluate(async () => {
      return window.desktopApi.secureStorage.save('invalid-capability', 'token', 'value');
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid secure storage capability',
    });
  });
});
