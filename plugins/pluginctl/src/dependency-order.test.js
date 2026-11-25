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

let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pluginctl-order-')); });
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
function setup(plugins, parallel, maxConcurrent = 2) {
  const config = path.join(directory, 'plugins.json');
  fs.writeFileSync(config, JSON.stringify({
    plugins: plugins.map(plugin => ({ ...plugin,
      source: `https://artifacthub.io/packages/headlamp/example/${plugin.name}` })),
    installOptions: { parallel, maxConcurrent },
  }));
  const manager = new MultiPluginManager(directory);
  const cleanup = jest.spyOn(manager, '_cleanupUnusedPlugins').mockImplementation(() => {});
  return { manager, config, cleanup };
}
for (const parallel of [false, true]) {
  describe(parallel ? 'parallel dependencies' : 'sequential dependencies', () => {
    test('installs reversed dependency chains only after prerequisites finish', async () => {
      const { manager, config } = setup([
        { name: 'leaf', dependencies: ['middle'] },
        { name: 'middle', dependencies: ['base'] }, { name: 'base' },
      ], parallel);
      const finished = new Set();
      const order = [];
      jest.spyOn(manager, 'installPlugin').mockImplementation(async plugin => {
        for (const dependency of plugin.dependencies || []) expect(finished.has(dependency)).toBe(true);
        await Promise.resolve();
        finished.add(plugin.name);
        order.push(plugin.name);
      });
      expect(await manager.installFromConfig(config)).toEqual({ total: 3, successful: 3, failed: 0, skipped: 0 });
      expect(order).toEqual(['base', 'middle', 'leaf']);
    });
    test('rejects missing dependencies before installs or cleanup', async () => {
      const { manager, config, cleanup } = setup([{ name: 'dependent', dependencies: ['missing'] }], parallel);
      const install = jest.spyOn(manager, 'installPlugin').mockResolvedValue();
      await expect(manager.installFromConfig(config)).rejects.toThrow(/missing/i);
      expect(install).not.toHaveBeenCalled();
      expect(cleanup).not.toHaveBeenCalled();
    });
    test('rejects cycles before installation', async () => {
      const { manager, config } = setup([
        { name: 'first', dependencies: ['second'] }, { name: 'second', dependencies: ['first'] },
      ], parallel);
      const install = jest.spyOn(manager, 'installPlugin').mockResolvedValue();
      await expect(manager.installFromConfig(config)).rejects.toThrow(/Circular dependencies/);
      expect(install).not.toHaveBeenCalled();
    });
    test('skips transitive dependents after failure but installs independent plugins', async () => {
      const { manager, config } = setup([
        { name: 'leaf', dependencies: ['middle'] },
        { name: 'middle', dependencies: ['base'] }, { name: 'base' }, { name: 'independent' },
      ], parallel);
      const called = [];
      jest.spyOn(manager, 'installPlugin').mockImplementation(async plugin => {
        called.push(plugin.name);
        if (plugin.name === 'base') throw new Error('Fixture install failure');
      });
      expect(await manager.installFromConfig(config)).toEqual({ total: 4, failed: 1, skipped: 2, successful: 1 });
      expect(called.sort()).toEqual(['base', 'independent']);
    });
    test('accepts an empty configuration', async () => {
      const { manager, config } = setup([], parallel);
      expect(await manager.installFromConfig(config)).toEqual({ total: 0, failed: 0, skipped: 0, successful: 0 });
    });
  });
}

test('independent installs overlap without exceeding maxConcurrent', async () => {
  const { manager, config } = setup(['first', 'second', 'third'].map(name => ({ name })), true, 2);
  let active = 0;
  let peak = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const install = jest.spyOn(manager, 'installPlugin').mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    if (active === 2) release();
    await barrier;
    active--;
  });
  expect(await manager.installFromConfig(config)).toEqual({ total: 3, successful: 3, failed: 0, skipped: 0 });
  expect(peak).toBe(2);
  expect(install).toHaveBeenCalledTimes(3);
});

test('siblings sharing a prerequisite can run in the same batch', () => {
  const manager = new MultiPluginManager();
  const graph = manager._createDependencyGraph([
    { name: 'leaf', dependencies: ['left', 'right'] },
    { name: 'left', dependencies: ['base'] },
    { name: 'right', dependencies: ['base'] }, { name: 'base' },
  ]);
  expect(manager._createOptimalChunks(graph, 2)).toEqual([
    ['base'], ['left', 'right'], ['leaf'],
  ]);
});

test('scheduler fails instead of looping when no plugin is ready', () => {
  const manager = new MultiPluginManager();
  expect(() => manager._createOptimalChunks(new Map([
    ['first', ['second']], ['second', ['first']],
  ]), 2)).toThrow(/unresolved dependencies/);
});
