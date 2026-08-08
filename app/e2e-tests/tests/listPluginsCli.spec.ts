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
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const appDir = path.resolve(__dirname, '../..');
const electronExecutable =
  process.platform === 'darwin'
    ? path.join(appDir, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(appDir, 'node_modules/electron/dist/electron');
const resourcesDir =
  process.platform === 'darwin'
    ? path.join(appDir, 'node_modules/electron/dist/Electron.app/Contents/Resources')
    : path.join(appDir, 'node_modules/electron/dist/resources');

test('lists plugins through the desktop CLI', () => {
  test.skip(process.platform === 'win32', 'The executable fixture requires a POSIX shell.');

  const backendPath = path.join(resourcesDir, 'headlamp-server');
  const backupPath = `${backendPath}.list-plugins-e2e-backup-${process.pid}`;
  const hadBackend = fs.existsSync(backendPath);

  if (hadBackend) {
    fs.renameSync(backendPath, backupPath);
  }

  try {
    fs.writeFileSync(
      backendPath,
      '#!/bin/sh\n' +
        'if [ "$1" != "list-plugins" ]; then exit 2; fi\n' +
        'printf "plugin-one\\nplugin-two\\n"\n',
      { mode: 0o755 }
    );

    const env = { ...process.env, ELECTRON_DEV: 'true' };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(electronExecutable, [appDir, 'list-plugins'], {
      cwd: appDir,
      encoding: 'utf8',
      env,
      timeout: 30_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('plugin-one\nplugin-two\n');
  } finally {
    fs.rmSync(backendPath, { force: true });
    if (hadBackend) {
      fs.renameSync(backupPath, backendPath);
    }
  }
});
