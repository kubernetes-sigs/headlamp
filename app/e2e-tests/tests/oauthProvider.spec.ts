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
import { build } from 'esbuild';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electronPath = require('electron') as string;
const fixturePath = path.resolve(__dirname, '../fixtures/oauthProviderMain.ts');
const callbackUrl = 'headlamp://oauth/callback?code=e2e-code&state=e2e-state';
const electronEnvironment = { ...process.env };
delete electronEnvironment.ELECTRON_RUN_AS_NODE;

let electronProcess: ChildProcess | undefined;
let electronProcessFailure = '';
let outputPath: string;
let temporaryDirectory: string;

test.describe('OAuth provider registry', () => {
  test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'Requires Electron app mode');

  test.beforeAll(async () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-oauth-e2e-'));
    const bundlePath = path.join(temporaryDirectory, 'oauthProviderMain.cjs');
    outputPath = path.join(temporaryDirectory, 'callback-url.txt');

    await build({
      bundle: true,
      entryPoints: [fixturePath],
      external: ['electron'],
      format: 'cjs',
      outfile: bundlePath,
      platform: 'node',
      target: 'node20',
    });

    electronProcess = spawn(electronPath, [bundlePath], {
      env: {
        ...electronEnvironment,
        HEADLAMP_OAUTH_CALLBACK_URL: callbackUrl,
        HEADLAMP_OAUTH_OUTPUT_PATH: outputPath,
        HEADLAMP_OAUTH_PROTOCOL_SCHEME: 'headlamp',
      },
      stdio: 'pipe',
    });
    electronProcess.stderr?.on('data', chunk => {
      electronProcessFailure += chunk.toString();
    });
    electronProcess.on('exit', (code, signal) => {
      if (!fs.existsSync(outputPath)) {
        electronProcessFailure += `Electron exited with code ${code} and signal ${signal}`;
      }
    });
  });

  test.afterAll(() => {
    electronProcess?.kill();
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  test('dispatches a launch callback emitted before Electron is ready', async () => {
    await expect
      .poll(() => {
        if (electronProcessFailure) {
          throw new Error(electronProcessFailure);
        }
        return fs.existsSync(outputPath) && fs.readFileSync(outputPath, 'utf8');
      })
      .toBe(callbackUrl);
  });
});
