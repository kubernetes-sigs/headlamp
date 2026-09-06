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
import findProcess from 'find-process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

test('passes app-specific storage directories to the backend', async () => {
  test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'Requires Electron app mode');

  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-e2e-config-'));
  const appName = 'Headlamp';
  const configBase =
    process.platform === 'darwin'
      ? path.join(configHome, 'Library', 'Preferences', appName)
      : process.platform === 'win32'
      ? path.join(configHome, appName, 'Config')
      : path.join(configHome, appName);
  const kubeConfigBase =
    process.platform === 'darwin'
      ? path.join(configHome, 'Library', 'Application Support', appName)
      : configBase;

  const electronApp = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: ['.'],
    env: {
      ...process.env,
      APPDATA: configHome,
      ELECTRON_DEV: 'true',
      HOME: configHome,
      LOCALAPPDATA: configHome,
      XDG_CONFIG_HOME: configHome,
    },
  });

  try {
    await electronApp.firstWindow();

    await expect
      .poll(async () => {
        const processes = await findProcess('name', 'headlamp-server');
        return processes.find(process => process.cmd.includes(configHome))?.cmd;
      })
      .toContain('--plugins-dir');

    const processes = await findProcess('name', 'headlamp-server');
    const command = processes.find(process => process.cmd.includes(configHome))?.cmd;
    expect(command).toContain(path.join(configBase, 'plugins'));
    expect(command).toContain('--user-plugins-dir');
    expect(command).toContain(path.join(configBase, 'user-plugins'));
    expect(command).toContain('--kubeconfig-dir');
    expect(command).toContain(path.join(kubeConfigBase, 'kubeconfigs'));
  } finally {
    await electronApp.close();
    fs.rmSync(configHome, { force: true, recursive: true });
  }
});
