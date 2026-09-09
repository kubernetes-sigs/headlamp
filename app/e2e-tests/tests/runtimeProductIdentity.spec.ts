/*
 * Copyright 2026 The Kubernetes Authors
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
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';

const appPath = path.resolve(__dirname, '../..');
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(appPath, `node_modules/.bin/${electronExecutable}`);

test('uses product identity while preserving custom Electron storage', async () => {
  const configHome = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-product-e2e-')),
  );
  const manifestFile = path.join(configHome, 'app-build-manifest.json');
  const customUserData = path.join(configHome, 'custom-profile');
  const runtimeEntry = path.join(configHome, 'runtime-product-identity.mjs');
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({ product: { name: 'example-desktop', productName: 'Example Desktop' } }),
  );
  buildSync({
    bundle: true,
    entryPoints: [path.join(appPath, 'electron/runtimeProductIdentity.ts')],
    external: ['electron'],
    format: 'esm',
    outfile: runtimeEntry,
    platform: 'node',
  });

  const electronApp = await _electron.launch({
    cwd: configHome,
    executablePath: electronPath,
    args: [runtimeEntry, `--user-data-dir=${customUserData}`],
    env: { ...process.env, HEADLAMP_BUILD_MANIFEST: manifestFile },
  });

  try {
    const runtimeIdentity = await electronApp.evaluate(({ app }) => ({
      name: app.getName(),
      userData: app.getPath('userData'),
    }));
    expect(runtimeIdentity).toEqual({
      name: 'Example Desktop',
      userData: customUserData,
    });
  } finally {
    await electronApp.close();
    fs.rmSync(configHome, { force: true, recursive: true });
  }
});
