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

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as tar from 'tar';
import { afterEach, describe, expect, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { main, runCli } = require('../scripts/setup-plugins.js') as {
  main: (
    plugins: Array<{ name: string; file?: string; enabledByDefault?: boolean }>
  ) => Promise<void>;
  runCli: (setup: () => Promise<void>, exit: (code: number) => void) => Promise<void>;
};

const pluginName = `setup-plugins-test-${process.pid}`;
const pluginFolder = path.resolve(__dirname, '../../.plugins', pluginName);
const malformedPluginFolder = `${pluginFolder}-malformed`;
const validPluginFolder = `${pluginFolder}-valid`;
let temporaryFolder: string | undefined;

function createTemporaryFolder() {
  return fs.mkdtempSync(path.resolve(__dirname, `../.setup-plugins-test-${process.pid}-`));
}

afterEach(() => {
  fs.rmSync(pluginFolder, { force: true, recursive: true });
  fs.rmSync(malformedPluginFolder, { force: true, recursive: true });
  fs.rmSync(validPluginFolder, { force: true, recursive: true });
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
    temporaryFolder = createTemporaryFolder();
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
  }, 30000);

  test('writes a disabled manifest default into the plugin package', async () => {
    temporaryFolder = createTemporaryFolder();
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
  }, 30000);

  test('creates Headlamp metadata for an enabled manifest default', async () => {
    temporaryFolder = createTemporaryFolder();
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
  }, 30000);

  test('skips a manifest default when the plugin package was not extracted', async () => {
    await expect(main([{ name: pluginName, enabledByDefault: false }])).resolves.toBeUndefined();
    expect(fs.existsSync(pluginFolder)).toBe(false);
  });

  test('continues after malformed plugin metadata', async () => {
    fs.mkdirSync(malformedPluginFolder, { recursive: true });
    fs.mkdirSync(validPluginFolder, { recursive: true });
    fs.writeFileSync(path.join(malformedPluginFolder, 'package.json'), '{invalid json');
    fs.writeFileSync(
      path.join(validPluginFolder, 'package.json'),
      JSON.stringify({ name: `${pluginName}-valid` })
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await main([
      { name: `${pluginName}-malformed`, enabledByDefault: false },
      { name: `${pluginName}-valid`, enabledByDefault: false },
    ]);

    expect(consoleError).toHaveBeenCalledWith(
      `Failed to update enabledByDefault for plugin ${pluginName}-malformed:`,
      expect.any(SyntaxError)
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(validPluginFolder, 'package.json'), 'utf8'))
    ).toEqual({
      name: `${pluginName}-valid`,
      headlamp: { enabledByDefault: false },
    });
    consoleError.mockRestore();
  });

  test('exits with an error when CLI setup fails', async () => {
    const error = new Error('setup failed');
    const exit = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runCli(() => Promise.reject(error), exit);

    expect(consoleError).toHaveBeenCalledWith('Failed to set up plugins:', error);
    expect(exit).toHaveBeenCalledWith(1);
    consoleError.mockRestore();
  });
});
