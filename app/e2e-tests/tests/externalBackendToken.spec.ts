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
import fs from 'fs';
import { createServer } from 'http';
import type { ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { _electron } from 'playwright';

const backendToken = 'external-development-token';
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');
const userDataDir = path.join(os.tmpdir(), `headlamp-e2e-external-token-${process.pid}`);

test('waits for the authenticated external backend before opening a window', async () => {
  const receivedTokens: Array<string | undefined> = [];
  const readinessResponses: ServerResponse[] = [];
  let releaseReadiness: (() => void) | undefined;
  const readinessRequested = new Promise<void>(resolve => {
    releaseReadiness = resolve;
  });
  let finishReadiness: (() => void) | undefined;
  const backend = createServer((request, response) => {
    if (request.url !== '/config') {
      response.writeHead(404).end();
      return;
    }

    receivedTokens.push(request.headers['x-headlamp_backend-token']);
    readinessResponses.push(response);
    finishReadiness = () => {
      for (const readinessResponse of readinessResponses) {
        if (!readinessResponse.writableEnded) {
          readinessResponse.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        }
      }
    };
    releaseReadiness?.();
  });
  await new Promise<void>(resolve => backend.listen(0, resolve));
  const port = (backend.address() as AddressInfo).port;

  const electronApp = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: ['.', `--port=${port}`, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      ELECTRON_DEV: 'true',
      ELECTRON_START_URL: 'data:text/html,<title>External backend token test</title>',
      EXTERNAL_SERVER: 'true',
      HEADLAMP_BACKEND_TOKEN: backendToken,
    },
  });

  try {
    const firstWindow = electronApp.firstWindow();
    await readinessRequested;
    expect(receivedTokens.at(0)).toBe(backendToken);
    await electronApp.evaluate(({ app }) => {
      app.emit('activate');
      app.emit('activate');
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(receivedTokens).toHaveLength(1);
    await expect(
      Promise.race([
        firstWindow.then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 100)),
      ])
    ).resolves.toBe(false);

    finishReadiness?.();
    await firstWindow;
    await expect
      .poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1);
  } finally {
    finishReadiness?.();
    await electronApp.close();
    await new Promise<void>((resolve, reject) =>
      backend.close(error => (error ? reject(error) : resolve()))
    );
    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
});