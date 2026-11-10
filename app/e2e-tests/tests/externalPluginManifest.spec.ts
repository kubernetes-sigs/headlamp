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
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('setup-plugins verifies plugin identity from an external manifest', () => {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-external-manifest-'));

  try {
    const appDirectory = path.join(temporaryRoot, 'app');
    const scriptsDirectory = path.join(appDirectory, 'scripts');
    const pluginSource = path.join(temporaryRoot, 'plugin-source', 'example-plugin');
    const stalePlugin = path.join(temporaryRoot, '.plugins', 'stale-plugin');
    fs.mkdirSync(scriptsDirectory, { recursive: true });
    fs.mkdirSync(pluginSource, { recursive: true });
    fs.mkdirSync(stalePlugin, { recursive: true });
    fs.writeFileSync(path.join(stalePlugin, 'main.js'), 'globalThis.stalePluginLoaded = true;');
    fs.copyFileSync(
      path.join(repositoryRoot, 'scripts', 'setup-plugins.ts'),
      path.join(scriptsDirectory, 'setup-plugins.ts')
    );
    fs.copyFileSync(
      path.join(repositoryRoot, 'scripts', 'build-manifest.ts'),
      path.join(scriptsDirectory, 'build-manifest.ts')
    );
    fs.symlinkSync(
      path.join(repositoryRoot, 'node_modules'),
      path.join(appDirectory, 'node_modules')
    );
    fs.writeFileSync(path.join(appDirectory, 'app-build-manifest.json'), '{"plugins":[]}');
    fs.writeFileSync(path.join(pluginSource, 'main.js'), 'globalThis.externalPluginLoaded = true;');
    fs.writeFileSync(
      path.join(pluginSource, 'package.json'),
      JSON.stringify({ name: 'example-plugin', version: '1.0.0' })
    );

    const archive = path.join(temporaryRoot, 'example-plugin.tar.gz');
    execFileSync('tar', [
      '-czf',
      archive,
      '-C',
      path.dirname(pluginSource),
      path.basename(pluginSource),
    ]);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const manifest = path.join(temporaryRoot, 'product-manifest.json');
    const invalidManifest = path.join(temporaryRoot, 'invalid-product-manifest.json');
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        plugins: [
          {
            name: 'example-plugin',
            packageName: 'example-plugin',
            file: './example-plugin.tar.gz',
            sha256,
          },
        ],
      })
    );
    fs.writeFileSync(
      invalidManifest,
      JSON.stringify({
        plugins: [
          { name: 'example-plugin', file: './example-plugin.tar.gz', sha256: '0'.repeat(64) },
        ],
      })
    );

    expect(() =>
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', path.join(scriptsDirectory, 'setup-plugins.ts')],
        {
          env: { ...process.env, HEADLAMP_BUILD_MANIFEST: invalidManifest },
          stdio: 'pipe',
        }
      )
    ).toThrow();
    expect(fs.existsSync(stalePlugin)).toBe(true);

    execFileSync(
      process.execPath,
      ['--experimental-strip-types', path.join(scriptsDirectory, 'setup-plugins.ts')],
      {
        env: {
          ...process.env,
          HEADLAMP_BUILD_MANIFEST: manifest,
        },
        stdio: 'pipe',
      }
    );

    const installedPlugin = path.join(temporaryRoot, '.plugins', 'example-plugin');
    expect(fs.existsSync(stalePlugin)).toBe(false);
    expect(fs.readFileSync(path.join(installedPlugin, 'main.js'), 'utf8')).toContain(
      'externalPluginLoaded'
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(installedPlugin, 'package.json'), 'utf8'))
    ).toMatchObject({
      name: 'example-plugin',
      version: '1.0.0',
    });

    fs.rmSync(installedPlugin, { recursive: true, force: true });
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        plugins: [
          {
            name: 'example-plugin',
            packageName: '@other/plugin',
            file: './example-plugin.tar.gz',
            sha256,
          },
        ],
      })
    );

    expect(() =>
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', path.join(scriptsDirectory, 'setup-plugins.ts')],
        {
          env: {
            ...process.env,
            HEADLAMP_BUILD_MANIFEST: manifest,
          },
          stdio: 'pipe',
        }
      )
    ).toThrow(/Plugin package name mismatch/);
    expect(fs.existsSync(installedPlugin)).toBe(false);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
