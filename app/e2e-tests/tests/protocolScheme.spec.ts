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

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

let electronApp: ElectronApplication;
let electronPage: Page;

test.describe('desktop protocol scheme', () => {
  test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'Requires Electron app mode');

  test.beforeAll(async () => {
    const electronEnv: Record<string, string> = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (name !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
        electronEnv[name] = value;
      }
    }

    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...electronEnv,
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

  test('routes a headlamp protocol URL in the desktop app', async () => {
    await electronApp.evaluate(({ app }, deepLink) => {
      app.emit('open-url', {} as Electron.Event, deepLink);
    }, 'headlamp://cluster?name=local');

    await expect.poll(() => electronPage.url()).toMatch(/#\/cluster\?name=local$/);
  });
});
