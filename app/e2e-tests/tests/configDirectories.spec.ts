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
import net from 'net';
import os from 'os';
import path from 'path';
import { _electron } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

test('uses Headlamp development config directories for branded products', async () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-e2e-config-'));
  // Give Electron a branded identity while verifying that development still uses Headlamp paths.
  const manifestFile = path.join(configHome, 'app-build-manifest.json');
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({ product: { name: 'example-desktop', productName: 'Example Desktop' } })
  );
  const backendPort = await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    // Restrict the temporary listener to local IPv4 instead of exposing it on external interfaces.
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to reserve an Electron backend port'));
        return;
      }
      server.close(error => (error ? reject(error) : resolve(address.port)));
    });
  });
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
    args: ['.', `--port=${backendPort}`],
    env: {
      ...process.env,
      APPDATA: configHome,
      ELECTRON_DEV: 'true',
      HEADLAMP_BUILD_MANIFEST: manifestFile,
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
