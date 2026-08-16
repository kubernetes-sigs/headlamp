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
import { _electron } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

test.describe('plugin command bridge', () => {
  test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'Plugin commands are desktop-only');

  test('runs an allowed command through renderer IPC', async ({ page }) => {
    await page.close();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-command-e2e-'));

    const electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--user-data-dir=${userDataDir}`, '--port=4566'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
      },
    });

    try {
      await electronApp.evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 0;
      });

      const electronPage = await electronApp.firstWindow();
      await electronPage.addInitScript(() => {
        const output: string[] = [];

        window.desktopApi.receive(
          'plugin-permission-secrets',
          (secrets: Record<string, number>) => {
            const commandId = 'plugin-command-e2e';
            window.desktopApi.receive('command-stdout', (id: string, chunk: string) => {
              if (id === commandId) {
                output.push(chunk);
              }
            });
            window.desktopApi.receive('command-exit', (id: string, code: number) => {
              if (id === commandId) {
                (window as any).__pluginCommandResult = { code, output: output.join('') };
              }
            });
            window.desktopApi.send('run-command', {
              id: commandId,
              command: 'gh',
              args: ['--version'],
              options: {},
              permissionSecrets: { 'runCmd-gh': secrets['runCmd-gh'] },
            });
          }
        );
        window.desktopApi.send('request-plugin-permission-secrets');
      });
      await electronPage.reload();

      await expect
        .poll(() => electronPage.evaluate(() => (window as any).__pluginCommandResult ?? null))
        .toEqual(expect.objectContaining({ code: 0 }));

      const result = await electronPage.evaluate(() => (window as any).__pluginCommandResult);
      expect(result.output).toContain('gh version');
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
