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
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import type { ServerResponse } from 'http';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { _electron } from 'playwright';

const backendToken = 'external-development-token';
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');
const userDataDir = path.join(os.tmpdir(), `headlamp-e2e-external-token-${process.pid}`);
const internalBackendReadyMessage = 'HEADLAMP_BACKEND_READY';

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

test('does not send the internal backend token to an unrelated port owner', async () => {
  const receivedTokens: Array<string | undefined> = [];
  const unrelatedServer = createServer((request, response) => {
    receivedTokens.push(request.headers['x-headlamp_backend-token']);
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
  await new Promise<void>(resolve => unrelatedServer.listen(0, '127.0.0.1', resolve));
  const occupiedPort = (unrelatedServer.address() as AddressInfo).port;
  const internalUserDataDir = path.join(os.tmpdir(), `headlamp-e2e-internal-token-${process.pid}`);
  let electronProcess: ReturnType<typeof spawn> | undefined;

  try {
    electronProcess = spawn(
      electronPath,
      ['.', `--port=${occupiedPort}`, `--user-data-dir=${internalUserDataDir}`],
      {
        cwd: appPath,
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          ELECTRON_DEV: 'true',
          ELECTRON_START_URL: 'data:text/html,<title>Internal backend readiness test</title>',
          EXTERNAL_SERVER: 'false',
          HEADLAMP_CHECK_FOR_UPDATES: 'false',
          HEADLAMP_MCP_ENABLE: 'false',
        },
        shell: process.platform === 'win32',
        windowsHide: true,
      }
    );
    await new Promise<void>((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for backend readiness:\n${output.slice(-2000)}`)),
        20_000
      );
      const handleOutput = (data: Buffer) => {
        output += data.toString();
        if (output.includes(internalBackendReadyMessage)) {
          clearTimeout(timeout);
          resolve();
        }
      };
      electronProcess!.stdout.on('data', handleOutput);
      electronProcess!.stderr.on('data', handleOutput);
      electronProcess!.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      electronProcess!.once('exit', exitCode => {
        clearTimeout(timeout);
        reject(new Error(`Electron exited before backend readiness with code ${exitCode}`));
      });
    });

    expect(receivedTokens).toEqual([]);
  } finally {
    if (electronProcess?.pid && electronProcess.exitCode === null) {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/pid', String(electronProcess.pid), '/T', '/F']);
      } else {
        process.kill(-electronProcess.pid, 'SIGTERM');
      }
    }
    await new Promise<void>((resolve, reject) =>
      unrelatedServer.close(error => (error ? reject(error) : resolve()))
    );
    fs.rmSync(internalUserDataDir, { force: true, recursive: true });
  }
});
