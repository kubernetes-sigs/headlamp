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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as tar from 'tar';
import { afterEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { main } = require('../scripts/setup-plugins.js') as {
  main: (
    plugins: Array<{ name: string; file?: string; enabledByDefault?: boolean }>
  ) => Promise<void>;
};

const pluginName = `setup-plugins-test-${process.pid}`;
const pluginFolder = path.resolve(__dirname, '../../.plugins', pluginName);
let temporaryFolder: string | undefined;

afterEach(() => {
  fs.rmSync(pluginFolder, { force: true, recursive: true });
  if (temporaryFolder) {
    fs.rmSync(temporaryFolder, { force: true, recursive: true });
    temporaryFolder = undefined;
  }
});

describe('setup-plugins', () => {
  test('does nothing when the manifest has no plugins', async () => {
    await expect(main([])).resolves.toBeUndefined();
  });

  test('extracts a local plugin and preserves its package metadata', async () => {
    temporaryFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-setup-plugins-'));
    const archiveRoot = path.join(temporaryFolder, 'archive', pluginName);
    const archivePath = path.join(temporaryFolder, 'plugin.tar.gz');
    const packageJson = {
      name: pluginName,
      version: '1.0.0',
      headlamp: { existingSetting: true },
    };

    fs.mkdirSync(archiveRoot, { recursive: true });
    fs.writeFileSync(path.join(archiveRoot, 'main.js'), 'console.log("test plugin");');
    fs.writeFileSync(path.join(archiveRoot, 'package.json'), JSON.stringify(packageJson));
    await tar.c({ cwd: path.dirname(archiveRoot), file: archivePath, gzip: true }, [pluginName]);

    await main([
      { name: pluginName, file: path.relative(path.resolve(__dirname, '..'), archivePath) },
    ]);

    expect(JSON.parse(fs.readFileSync(path.join(pluginFolder, 'package.json'), 'utf8'))).toEqual(
      packageJson
    );
  });

  test('writes a disabled manifest default into the plugin package', async () => {
    temporaryFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-setup-plugins-'));
    const archiveRoot = path.join(temporaryFolder, 'archive', pluginName);
    const archivePath = path.join(temporaryFolder, 'plugin.tar.gz');

    fs.mkdirSync(archiveRoot, { recursive: true });
    fs.writeFileSync(path.join(archiveRoot, 'main.js'), 'console.log("test plugin");');
    fs.writeFileSync(
      path.join(archiveRoot, 'package.json'),
      JSON.stringify({
        name: pluginName,
        version: '1.0.0',
        headlamp: { existingSetting: true },
      })
    );
    await tar.c({ cwd: path.dirname(archiveRoot), file: archivePath, gzip: true }, [pluginName]);

    await main([
      {
        name: pluginName,
        file: path.relative(path.resolve(__dirname, '..'), archivePath),
        enabledByDefault: false,
      },
    ]);

    expect(
      JSON.parse(fs.readFileSync(path.join(pluginFolder, 'package.json'), 'utf8'))
    ).toMatchObject({
      headlamp: {
        enabledByDefault: false,
        existingSetting: true,
      },
    });
  });

  test('creates Headlamp metadata for an enabled manifest default', async () => {
    temporaryFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-setup-plugins-'));
    const archiveRoot = path.join(temporaryFolder, 'archive', pluginName);
    const archivePath = path.join(temporaryFolder, 'plugin.tar.gz');

    fs.mkdirSync(archiveRoot, { recursive: true });
    fs.writeFileSync(path.join(archiveRoot, 'main.js'), 'console.log("test plugin");');
    fs.writeFileSync(
      path.join(archiveRoot, 'package.json'),
      JSON.stringify({ name: pluginName, version: '1.0.0' })
    );
    await tar.c({ cwd: path.dirname(archiveRoot), file: archivePath, gzip: true }, [pluginName]);

    await main([
      {
        name: pluginName,
        file: path.relative(path.resolve(__dirname, '..'), archivePath),
        enabledByDefault: true,
      },
    ]);

    expect(
      JSON.parse(fs.readFileSync(path.join(pluginFolder, 'package.json'), 'utf8'))
    ).toMatchObject({ headlamp: { enabledByDefault: true } });
  });

  test('skips a manifest default when the plugin package was not extracted', async () => {
    await expect(main([{ name: pluginName, enabledByDefault: false }])).resolves.toBeUndefined();
    expect(fs.existsSync(pluginFolder)).toBe(false);
  });
});
