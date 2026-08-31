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

test.describe('run command', () => {
  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
        ELECTRON_START_URL: 'data:text/html,<html></html>',
        EXTERNAL_SERVER: 'true',
        HEADLAMP_CHECK_FOR_UPDATES: 'false',
        HEADLAMP_MCP_ENABLE: 'false',
      },
    });
    electronPage = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('rejects invalid commands from the renderer', async () => {
    const exitCode = electronPage.evaluate(() => {
      return new Promise<number>(resolve => {
        const removeListener = window.desktopApi.receive(
          'command-exit',
          (commandId: string, code: number) => {
            if (commandId === 'invalid-command-e2e') {
              removeListener();
              resolve(code);
            }
          }
        );
      });
    });
    const rejection = electronApp.waitForEvent('console', {
      predicate: message => message.text().includes('Invalid command: invalid-command'),
    });

    await electronPage.evaluate(() => {
      window.desktopApi.send('run-command', {
        id: 'invalid-command-e2e',
        command: 'invalid-command',
        args: [],
        options: {},
        permissionSecrets: {},
      });
    });

    await expect(rejection).resolves.toBeDefined();
    await expect(exitCode).resolves.toBe(-1);
  });
});
