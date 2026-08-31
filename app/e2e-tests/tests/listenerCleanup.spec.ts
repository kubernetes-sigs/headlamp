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
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron, ElectronApplication, Page } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');
const runCommandPath = path.resolve(
  __dirname,
  '../../../frontend/src/components/App/runCommand.ts'
);

let electronApp: ElectronApplication;
let electronPage: Page;
let userDataDirectory: string;

/**
 * Persists consent for the command used by the Electron test.
 *
 * @param allowed - Whether `gh --version` is allowed to run.
 */
async function setCommandConsent(allowed: boolean): Promise<void> {
  const settingsDirectory = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  fs.mkdirSync(settingsDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(settingsDirectory, 'settings.json'),
    JSON.stringify({ confirmedCommands: { 'gh --version': allowed } })
  );
}

test.describe('desktop listener cleanup', () => {
  test.beforeAll(async () => {
    const bundle = await build({
      entryPoints: [runCommandPath],
      bundle: true,
      format: 'iife',
      globalName: 'RunCommandModule',
      platform: 'browser',
      write: false,
    });
    userDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-listener-e2e-'));
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
    await electronPage.addInitScript(() => {
      (window as any).desktopApi.receive(
        'plugin-permission-secrets',
        (secrets: Record<string, number>) => {
          (window as any).listenerCleanupPermissionSecrets = secrets;
        }
      );
    });
    await electronPage.reload({ waitUntil: 'load' });
    await expect
      .poll(() =>
        electronPage.evaluate(() => Boolean((window as any).listenerCleanupPermissionSecrets))
      )
      .toBe(true);
    await electronPage.addScriptTag({ content: bundle.outputFiles[0].text });
    await electronPage.evaluate(() => {
      (window as any).runE2ECommand = async () => {
        const desktopApi = (window as any).desktopApi;
        const permissionSecrets = (window as any).listenerCleanupPermissionSecrets;
        const removedChannels: string[] = [];
        const receive = (
          channel: string,
          listener: (commandId: string, data: string | number) => void
        ) => {
          const unsubscribe = desktopApi.receive(channel, listener);
          return () => {
            removedChannels.push(channel);
            unsubscribe?.();
          };
        };
        const commandProcess = (window as any).RunCommandModule.runCommand(
          'gh',
          ['--version'],
          {},
          permissionSecrets,
          desktopApi.send,
          receive
        );

        return await new Promise((resolve, reject) => {
          const stdout: string[] = [];
          const stderr: string[] = [];
          const timeout = window.setTimeout(
            () => reject(new Error('Timed out waiting for command-exit')),
            10000
          );
          commandProcess.stdout.on('data', (data: string) => stdout.push(data));
          commandProcess.stderr.on('data', (data: string) => stderr.push(data));
          commandProcess.on('exit', (code: number | null) => {
            window.clearTimeout(timeout);
            resolve({ code, stdout, stderr, removedChannels });
          });
        });
      };
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
    fs.rmSync(userDataDirectory, { force: true, recursive: true });
  });

  test('delivers complete command output before cleaning up listeners', async () => {
    await setCommandConsent(true);

    const result = await electronPage.evaluate(() => (window as any).runE2ECommand());

    expect(result.code).toBe(0);
    expect(result.stdout.join('')).toContain('gh version');
    expect(result.stderr).toEqual([]);
    expect(result.removedChannels).toEqual(['command-stdout', 'command-stderr', 'command-exit']);
  });

  test('cleans up listeners when command consent is denied', async () => {
    await setCommandConsent(false);

    const result = await electronPage.evaluate(() => (window as any).runE2ECommand());

    expect(result).toEqual({
      code: -3,
      stdout: [],
      stderr: [],
      removedChannels: ['command-stdout', 'command-stderr', 'command-exit'],
    });
  });
});
