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

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const launcherPath = require.resolve('../../tools/run-backend');
const { backendExecutable } = require(launcherPath);

const OLDER = new Date('2025-01-01T00:00:00Z');
const NEWER = new Date('2025-01-02T00:00:00Z');

describe('backendExecutable', () => {
  let backendDir: string;
  let built: string;
  let executable: string;

  function writeFile(file: string, contents: string, mtime: Date) {
    fs.writeFileSync(file, contents);
    fs.utimesSync(file, mtime, mtime);
  }

  beforeEach(() => {
    backendDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-run-backend-'));
    built = path.join(backendDir, 'headlamp-server');
    executable = `${built}.exe`;
  });

  afterEach(() => {
    fs.rmSync(backendDir, { recursive: true, force: true });
  });

  it.each(['linux', 'darwin'])('returns the extensionless build on %s', platform => {
    writeFile(built, 'built', NEWER);

    expect(backendExecutable(platform, backendDir)).toBe(built);
    expect(fs.existsSync(executable)).toBe(false);
  });

  it('creates a missing .exe from the build on Windows', () => {
    writeFile(built, 'built', NEWER);

    expect(backendExecutable('win32', backendDir)).toBe(executable);
    expect(fs.readFileSync(executable, 'utf8')).toBe('built');
  });

  it('refreshes a .exe that is older than the build on Windows', () => {
    writeFile(executable, 'stale', OLDER);
    writeFile(built, 'built', NEWER);

    expect(backendExecutable('win32', backendDir)).toBe(executable);
    expect(fs.readFileSync(executable, 'utf8')).toBe('built');
  });

  it('keeps a .exe that is newer than the build on Windows', () => {
    writeFile(built, 'built', OLDER);
    writeFile(executable, 'newer', NEWER);

    expect(backendExecutable('win32', backendDir)).toBe(executable);
    expect(fs.readFileSync(executable, 'utf8')).toBe('newer');
  });

  it('falls back to an existing .exe-only build on Windows', () => {
    writeFile(executable, 'exe-only', NEWER);

    expect(backendExecutable('win32', backendDir)).toBe(executable);
    expect(fs.readFileSync(executable, 'utf8')).toBe('exe-only');
    expect(fs.existsSync(built)).toBe(false);
  });
});

describe('run-backend signal forwarding', () => {
  // Runs the launcher's main() with a stubbed process and spawn, so signals can
  // be emitted without affecting the test runner.
  function runLauncher() {
    const toolsDir = path.dirname(launcherPath);
    const forwarded: string[] = [];
    const child = Object.assign(new EventEmitter(), {
      kill: (signal: string) => forwarded.push(signal),
    });
    const exitCodes: number[] = [];
    const launcher = Object.assign(new EventEmitter(), {
      platform: 'linux',
      argv: ['node', launcherPath, '-dev'],
      exit: (code: number) => exitCodes.push(code),
    });

    const launcherModule = { exports: {} };
    const launcherRequire = Object.assign(
      (name: string) => {
        if (name === 'child_process') {
          return {
            spawn(executable: string, args: string[], options: { stdio: string }) {
              expect(executable).toBe(path.join(toolsDir, '..', 'backend', 'headlamp-server'));
              expect(Array.from(args)).toEqual(['-dev']);
              expect(options.stdio).toBe('inherit');
              return child;
            },
          };
        }
        return require(name);
      },
      { main: launcherModule }
    );

    vm.runInNewContext(
      fs.readFileSync(launcherPath, 'utf8'),
      {
        require: launcherRequire,
        module: launcherModule,
        __dirname: toolsDir,
        process: launcher,
        console,
      },
      { filename: launcherPath }
    );

    return { child, launcher, forwarded, exitCodes };
  }

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const)(
    'forwards %s to the backend and exits after it does',
    signal => {
      const { child, launcher, forwarded, exitCodes } = runLauncher();

      expect(launcher.emit(signal)).toBe(true);
      expect(forwarded).toEqual([signal]);
      expect(exitCodes).toEqual([]);

      child.emit('exit', null, signal);
      expect(exitCodes).toEqual([128 + (os.constants.signals[signal] || 0)]);
    }
  );
});
