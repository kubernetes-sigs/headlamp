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
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');
const manifestPath = path.join(appPath, 'app-build-manifest.json');

let electronApp: ElectronApplication;
let electronPage: Page;
let originalManifest: string;

test.describe('desktop protocol scheme', () => {
  test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'Requires Electron app mode');

  test.beforeAll(async () => {
    originalManifest = fs.readFileSync(manifestPath, 'utf8');
    const productManifest = JSON.parse(originalManifest);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ ...productManifest, protocolScheme: 'test-headlamp' }, null, 2) + '\n'
    );

    const electronEnv: Record<string, string> = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (name !== 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
        electronEnv[name] = value;
      }
    }

    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', 'test-headlamp://cluster?name=startup'],
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
    fs.writeFileSync(manifestPath, originalManifest);
  });

  test('routes a product protocol URL from the startup command line', async () => {
    await expect.poll(() => electronPage.url()).toMatch(/#\/cluster\?name=startup$/);
  });

  test('routes a product protocol URL in the desktop app', async () => {
    await electronApp.evaluate(({ app }, deepLink) => {
      app.emit('open-url', { preventDefault() {} } as Electron.Event, deepLink);
    }, 'test-headlamp://cluster?name=local');

    await expect.poll(() => electronPage.url()).toMatch(/#\/cluster\?name=local$/);
  });

  test('routes a product protocol URL from a second instance', async () => {
    await electronApp.evaluate(
      ({ app }, commandLine) => {
        app.emit('second-instance', {} as Electron.Event, commandLine, process.cwd(), {});
      },
      ['electron', '.', 'test-headlamp://cluster?name=secondary']
    );

    await expect.poll(() => electronPage.url()).toMatch(/#\/cluster\?name=secondary$/);
  });
});
