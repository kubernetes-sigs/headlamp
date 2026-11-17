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

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { instrumentCode, mergeCoverage } from '../scripts/coverage';

const scripts = path.resolve(__dirname, '../scripts');
const sourceRoot = path.resolve(__dirname);
const nodeRequire = createRequire(import.meta.url);
let directory: string;

beforeEach(() => {
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-coverage-')));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

async function execute(source: string, file: string) {
  const context = { answer: 0, __headlampCoverage__: {} };
  vm.runInNewContext(await instrumentCode(source, file), context, {
    contextCodeGeneration: { strings: false },
  });
  return context;
}

it('preserves TypeScript execution while adding source-mapped statement counters', async () => {
  const file = path.join(sourceRoot, 'coverage-fixture.ts');
  const context = await execute('const value: number = 7; globalThis.answer = value;', file);

  expect(context.answer).toBe(7);
  expect(context.__headlampCoverage__).toHaveProperty([file]);
});

it('merges source-map line ends without duplicating statements or dropping unvisited sources', async () => {
  const main = path.join(sourceRoot, 'main.ts');
  const preload = path.join(sourceRoot, 'preload.ts');
  const unvisited = path.join(sourceRoot, 'settings.ts');
  const buildConfig = path.resolve(sourceRoot, '../electron-builder.config.ts');
  const blank = (file: string) => ({
    path: file,
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: null } } },
    fnMap: {},
    branchMap: {},
    s: { 0: 0 },
    f: {},
    b: {},
  });
  const unit = path.join(directory, 'unit.json');
  const raw = path.join(directory, 'raw');
  const report = path.join(directory, 'combined');
  fs.mkdirSync(raw);
  fs.mkdirSync(`${raw}-status`);
  const statusFile = path.join(`${raw}-status`, 'process');
  fs.writeFileSync(statusFile, 'complete');
  fs.writeFileSync(
    unit,
    JSON.stringify({
      [main]: blank(main),
      [preload]: blank(preload),
      [unvisited]: blank(unvisited),
      [buildConfig]: blank(buildConfig),
    })
  );
  for (const [index, file] of [main, preload].entries()) {
    const context = await execute('globalThis.answer = 1;', file);
    fs.writeFileSync(path.join(raw, `${index}.json`), JSON.stringify(context.__headlampCoverage__));
  }
  const dependency = path.join(directory, 'node_modules/dependency.js');
  fs.writeFileSync(
    path.join(raw, 'dependency.json'),
    JSON.stringify({ [dependency]: blank(dependency) })
  );

  await mergeCoverage(unit, raw, report);

  const result = JSON.parse(fs.readFileSync(path.join(report, 'coverage-summary.json'), 'utf8'));
  expect(result.total.statements).toMatchObject({ covered: 2, total: 3 });
  expect(result[unvisited].statements).toMatchObject({ covered: 0, total: 1 });
  expect(Object.keys(result)).not.toContain(dependency);
  expect(Object.keys(result)).not.toContain(buildConfig);

  for (const status of ['pending', 'failed']) {
    fs.writeFileSync(statusFile, status);
    await expect(mergeCoverage(unit, raw, report)).rejects.toThrow('collection failed');
  }
  fs.writeFileSync(statusFile, 'complete');

  const incompatible = JSON.parse(fs.readFileSync(unit, 'utf8'));
  incompatible[main].statementMap[0].end.column = 1;
  fs.writeFileSync(unit, JSON.stringify(incompatible));
  await expect(mergeCoverage(unit, raw, report)).rejects.toThrow('incompatible statement maps');
});

it('fails explicitly when a selected E2E suite produces no coverage', async () => {
  const unit = path.join(directory, 'unit.json');
  const raw = path.join(directory, 'raw');
  fs.mkdirSync(raw);
  fs.writeFileSync(unit, '{}');

  await expect(mergeCoverage(unit, raw, path.join(directory, 'combined'))).rejects.toThrow(
    'Electron produced no E2E coverage snapshots'
  );
});

it('flushes the main process on quit and the sandboxed preload on unload', () => {
  const raw = path.join(directory, 'raw');
  const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const ipcMain = new EventEmitter();
  const processEvents = Object.assign(new EventEmitter(), {
    env: { HEADLAMP_E2E_COVERAGE_DIR: raw },
    pid: 123,
    platform: 'linux',
    kill: vi.fn(),
  });
  const mainCoverage = { main: { s: { 0: 1 } } };
  vm.runInNewContext(fs.readFileSync(path.join(scripts, 'coverage-main.js'), 'utf8'), {
    require: (id: string) => (id === 'electron' ? { app, ipcMain } : nodeRequire(id)),
    process: processEvents,
    __headlampCoverage__: mainCoverage,
  });

  const window = new EventEmitter();
  const preloadCoverage = { preload: { s: { 0: 2 } } };
  vm.runInNewContext(fs.readFileSync(path.join(scripts, 'coverage-preload.js'), 'utf8'), {
    require: () => ({
      ipcRenderer: {
        sendSync: (channel: string, data: unknown) => {
          const event: { returnValue?: unknown } = {};
          ipcMain.emit(channel, event, data);
          return event.returnValue;
        },
      },
    }),
    window: { addEventListener: window.on.bind(window) },
    __headlampCoverage__: preloadCoverage,
  });
  expect(fs.readdirSync(raw)).toEqual([]);
  window.emit('unload');
  app.emit('will-quit');
  processEvents.emit('exit');

  const files = fs.readdirSync(raw);
  expect(files).toHaveLength(2);
  expect(JSON.parse(fs.readFileSync(path.join(raw, 'main-123.json'), 'utf8'))).toEqual(
    mainCoverage
  );
  const snapshot = files.find(file => file.startsWith('preload-'));
  expect(snapshot).toBeDefined();
  expect(JSON.parse(fs.readFileSync(path.join(raw, snapshot!), 'utf8'))).toEqual(preloadCoverage);
  mainCoverage.main.s[0] = 2;
  processEvents.emit('SIGTERM');
  expect(app.quit).toHaveBeenCalledOnce();
  expect(processEvents.kill).not.toHaveBeenCalled();
  expect(JSON.parse(fs.readFileSync(path.join(raw, 'main-123.json'), 'utf8'))).toEqual(
    mainCoverage
  );
});

it('does not silently enable preload collection without an instrumented main process', () => {
  expect(() =>
    vm.runInNewContext(fs.readFileSync(path.join(scripts, 'coverage-preload.js'), 'utf8'), {
      require: () => ({ ipcRenderer: { sendSync: () => false } }),
    })
  ).toThrow('The instrumented preload requires the Electron coverage collector');
});

it.each([true, false])(
  'retains collection failure and quits gracefully (preload failure: %s)',
  failPreload => {
    const raw = path.join(directory, 'raw');
    const ipcMain = new EventEmitter();
    const logError = vi.fn();
    const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
    const processEvents = Object.assign(new EventEmitter(), {
      env: { HEADLAMP_E2E_COVERAGE_DIR: raw },
      pid: 123,
      platform: 'linux',
    });
    vm.runInNewContext(fs.readFileSync(path.join(scripts, 'coverage-main.js'), 'utf8'), {
      require: (id: string) => (id === 'electron' ? { app, ipcMain } : nodeRequire(id)),
      process: processEvents,
      console: { error: logError },
      __headlampCoverage__: { main: {} },
    });
    ipcMain.emit('__headlamp_e2e_coverage__', {}, { preload: {} });
    app.emit('will-quit');
    expect(fs.readdirSync(raw)).toHaveLength(2);
    fs.rmSync(raw, { recursive: true });
    const event: { returnValue?: boolean } = {};

    if (failPreload) {
      ipcMain.emit('__headlamp_e2e_coverage__', event, { preload: {} });
      expect(event.returnValue).toBe(false);
      expect(logError).toHaveBeenCalledWith(
        'Failed to save Electron preload coverage:',
        expect.any(Error)
      );
    }
    processEvents.emit('SIGTERM');
    expect(app.quit).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith(
      'Failed to save Electron main coverage:',
      expect.any(Error)
    );
    fs.mkdirSync(raw);
    processEvents.emit('exit');
    const statusDirectory = `${raw}-status`;
    const statuses = fs.readdirSync(statusDirectory);
    expect(statuses).toHaveLength(1);
    expect(fs.readFileSync(path.join(statusDirectory, statuses[0]), 'utf8')).toBe('failed');
  }
);

it.each([0, 1])(
  'fails after interruption during restoration even when E2E exits %s',
  async e2eStatus => {
    const processEvents = Object.assign(new EventEmitter(), {
      platform: 'linux',
      execPath: process.execPath,
      env: { npm_execpath: 'npm-cli.js' },
      argv: ['node', 'test-coverage.js'],
      exitCode: undefined,
    });
    const restorationKill = vi.fn();
    let calls = 0;
    const spawn = vi.fn(() => {
      calls++;
      const child = Object.assign(new EventEmitter(), {
        kill: calls === 4 ? restorationKill : vi.fn(),
      });
      const current = calls;
      queueMicrotask(() => {
        if (current === 4) {
          processEvents.emit('SIGTERM');
          processEvents.emit('SIGINT');
        }
        child.emit('close', current === 3 ? e2eStatus : 0, null);
      });
      return child;
    });
    const fakeRequire = Object.assign(
      (id: string) => {
        if (id === 'node:child_process') return { spawn };
        if (id === 'node:fs') return { rmSync: vi.fn(), mkdirSync: vi.fn() };
        if (id === './coverage')
          return {
            mergeCoverage: vi.fn().mockResolvedValue({
              statements: { covered: 1, total: 1, pct: 100 },
            }),
          };
        return nodeRequire(id);
      },
      { resolve: () => 'playwright-cli.js' }
    );
    const log = vi.fn();

    vm.runInNewContext(fs.readFileSync(path.join(scripts, 'test-coverage.js'), 'utf8'), {
      require: fakeRequire,
      process: processEvents,
      __dirname: scripts,
      console: { log, error: vi.fn() },
      Promise,
    });
    await vi.waitFor(() => expect(processEvents.exitCode).toBe(1));

    expect(spawn).toHaveBeenCalledTimes(4);
    expect(restorationKill).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(processEvents.listenerCount('SIGTERM')).toBe(0);
  }
);
