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

import spawn from 'cross-spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

let temporaryDirectory: string | undefined;

afterEach(() => {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

it.runIf(process.platform === 'win32')(
  'executes a command shim with shell disabled and preserves its argument vector',
  async () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-cross-spawn-'));
    const captureScript = path.join(temporaryDirectory, 'capture-args.js');
    const commandShim = path.join(temporaryDirectory, 'capture-args.cmd');
    fs.writeFileSync(
      captureScript,
      'process.stdout.write(JSON.stringify(process.argv.slice(2)));',
      'utf8'
    );
    fs.writeFileSync(commandShim, '@echo off\r\n"%NODE_EXE%" "%CAPTURE_SCRIPT%" %*\r\n', 'utf8');

    const args = ['argument with spaces', 'literal&metacharacter', '--flag=value'];
    const child = spawn(commandShim, args, {
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        NODE_EXE: process.execPath,
        CAPTURE_SCRIPT: captureScript,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk;
    });
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      }
    );

    expect(result).toEqual({ code: 0, signal: null });
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual(args);
  }
);
