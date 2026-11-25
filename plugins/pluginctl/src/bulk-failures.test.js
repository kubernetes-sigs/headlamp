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

const fs = require('fs');
const os = require('os');
const path = require('path');
const MultiPluginManager = require('./multi-plugin-management');
const { PluginManager } = require('./plugin-management');

let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pluginctl-failures-'));
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

for (const parallel of [false, true]) {
  for (const callbackKind of ['absent', 'quiet', 'collecting']) {
    for (const failure of ['metadata', 'archive']) {
      test(`${parallel ? 'parallel' : 'sequential'} ${failure} failure with ${callbackKind} callback`, async () => {
        const events = [];
        const callback = callbackKind === 'absent' ? null
          : callbackKind === 'quiet' ? () => {} : event => events.push(event);
        const fetchMock = jest.spyOn(global, 'fetch');
        if (failure === 'metadata') {
          fetchMock.mockRejectedValue(new Error('Metadata unavailable'));
        } else {
          fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({
            name: 'base', version: '1.0.0',
            data: {
              'headlamp/plugin/archive-url': 'https://github.com/example/base/releases/download/v1/base.tar.gz',
              'headlamp/plugin/archive-checksum': '0'.repeat(64),
            },
          }) }).mockResolvedValue({ ok: false, status: 503 });
          jest.spyOn(os, 'tmpdir').mockReturnValue(directory);
        }
        const configPath = path.join(directory, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify({
          plugins: [
            { name: 'base', source: 'https://artifacthub.io/packages/headlamp/example/base' },
            { name: 'dependent', source: 'https://artifacthub.io/packages/headlamp/example/dependent', dependencies: ['base'] },
          ],
          installOptions: { parallel, maxConcurrent: 2 },
        }));
        const manager = new MultiPluginManager(path.join(directory, 'installed'), '', callback);
        const install = jest.spyOn(PluginManager, 'install');
        expect(await manager.installFromConfig(configPath)).toEqual({
          total: 2, failed: 1, skipped: 1, successful: 0,
        });
        expect(install).toHaveBeenCalledTimes(1);
        if (callbackKind === 'collecting') {
          expect(events.some(event => event.message.includes(
            failure === 'metadata' ? 'Metadata unavailable' : '503'
          ))).toBe(true);
          expect(events.some(event => /installed successfully/i.test(event.message))).toBe(false);
        }
      });
    }
  }
  test(`mixed ${parallel ? 'parallel' : 'sequential'} batch counts independent success`, async () => {
    jest.spyOn(PluginManager, 'install').mockImplementation(async (source, folder, version, progress) => {
      progress(source.endsWith('/broken')
        ? { type: 'error', message: 'Install failed' }
        : { type: 'success', message: 'Plugin Installed' });
    });
    const configPath = path.join(directory, 'mixed.json');
    fs.writeFileSync(configPath, JSON.stringify({
      plugins: ['broken', 'working'].map(name => ({
        name, source: `https://artifacthub.io/packages/headlamp/example/${name}`,
      })),
      installOptions: { parallel, maxConcurrent: 2 },
    }));
    expect(await new MultiPluginManager().installFromConfig(configPath)).toEqual({
      total: 2, failed: 1, skipped: 0, successful: 1,
    });
  });
  test(`successful ${parallel ? 'parallel' : 'sequential'} batch keeps its totals and progress`, async () => {
    const events = [];
    jest.spyOn(PluginManager, 'install').mockImplementation(async (...args) => {
      args[3]({ type: 'success', message: 'Plugin Installed' });
    });
    const configPath = path.join(directory, 'success.json');
    fs.writeFileSync(configPath, JSON.stringify({
      plugins: [{ name: 'base', source: 'https://artifacthub.io/packages/headlamp/example/base' }],
      installOptions: { parallel },
    }));
    const manager = new MultiPluginManager('', '', event => events.push(event));
    expect(await manager.installFromConfig(configPath)).toEqual({
      total: 1, failed: 0, skipped: 0, successful: 1,
    });
    expect(events.some(event => event.message === 'Plugin Installed')).toBe(true);
  });
}
