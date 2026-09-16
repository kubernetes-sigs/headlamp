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

/** Waits briefly for a child exit event after test cleanup sends a termination signal. */
async function waitForExit(child: ReturnType<typeof spawn>, timeoutMs = 5_000): Promise<boolean> {
  if (child.exitCode !== null) {
    return true;
  }
  return new Promise(resolve => {
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

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

    const receivedToken = request.headers['x-headlamp_backend-token'];
    receivedTokens.push(Array.isArray(receivedToken) ? receivedToken[0] : receivedToken);
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
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
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
    const receivedToken = request.headers['x-headlamp_backend-token'];
    receivedTokens.push(Array.isArray(receivedToken) ? receivedToken[0] : receivedToken);
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
  await new Promise<void>(resolve => unrelatedServer.listen(0, '127.0.0.1', resolve));
  const occupiedPort = (unrelatedServer.address() as AddressInfo).port;
  const internalUserDataDir = path.join(os.tmpdir(), `headlamp-e2e-internal-token-${process.pid}`);
  const backendFixturePath = path.resolve(__dirname, '../fixtures/backendBindRace.go');
  const backendFixtureExecutable = path.join(
    internalUserDataDir,
    process.platform === 'win32' ? 'backend-bind-race.exe' : 'backend-bind-race'
  );
  const firstAttemptPath = path.join(internalUserDataDir, 'first-attempt');
  const raceServerPath = path.join(internalUserDataDir, 'race-server.js');
  const raceServerReadyPath = path.join(internalUserDataDir, 'race-server-ready');
  const raceServerPidPath = path.join(internalUserDataDir, 'race-server.pid');
  const receivedTokenPath = path.join(internalUserDataDir, 'received-token');
  let electronProcess: ReturnType<typeof spawn> | undefined;
  let output = '';

  try {
    fs.mkdirSync(internalUserDataDir, { recursive: true });
    fs.writeFileSync(
      raceServerPath,
      `const fs = require('fs');
const http = require('http');
const [port, readyPath, tokenPath] = process.argv.slice(2);
http.createServer((request, response) => {
  fs.appendFileSync(tokenPath, String(request.headers['x-headlamp_backend-token']) + '\\n');
  response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
}).listen(Number(port), '127.0.0.1', () => fs.writeFileSync(readyPath, 'ready'));
`
    );
    execFileSync('go', ['build', '-o', backendFixtureExecutable, backendFixturePath]);
    const startedElectronProcess = spawn(
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
          HEADLAMP_E2E_BACKEND_PATH: backendFixtureExecutable,
          HEADLAMP_E2E_FIRST_ATTEMPT: firstAttemptPath,
          HEADLAMP_E2E_NODE: process.execPath,
          HEADLAMP_E2E_RACE_SERVER: raceServerPath,
          HEADLAMP_E2E_RACE_SERVER_PID: raceServerPidPath,
          HEADLAMP_E2E_RACE_SERVER_READY: raceServerReadyPath,
          HEADLAMP_E2E_RECEIVED_TOKEN: receivedTokenPath,
          HEADLAMP_MCP_ENABLE: 'false',
        },
        shell: process.platform === 'win32',
        stdio: 'pipe',
        windowsHide: true,
      }
    );
    electronProcess = startedElectronProcess;
    await new Promise<void>((resolve, reject) => {
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
      startedElectronProcess.stdout.on('data', handleOutput);
      startedElectronProcess.stderr.on('data', handleOutput);
      startedElectronProcess.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      startedElectronProcess.once('exit', exitCode => {
        clearTimeout(timeout);
        reject(new Error(`Electron exited before backend readiness with code ${exitCode}`));
      });
    });

    expect(output).toContain('selected port became occupied; retrying');
    expect(receivedTokens).toEqual([]);
    expect(fs.existsSync(receivedTokenPath) ? fs.readFileSync(receivedTokenPath, 'utf8') : '').toBe(
      ''
    );
  } finally {
    if (electronProcess?.pid && electronProcess.exitCode === null) {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/pid', String(electronProcess.pid), '/T', '/F']);
      } else {
        process.kill(-electronProcess.pid, 'SIGTERM');
      }
      if (!(await waitForExit(electronProcess)) && process.platform !== 'win32') {
        process.kill(-electronProcess.pid, 'SIGKILL');
        await waitForExit(electronProcess);
      }
    }
    if (fs.existsSync(raceServerPidPath)) {
      try {
        process.kill(Number(fs.readFileSync(raceServerPidPath, 'utf8')), 'SIGTERM');
      } catch {
        // The race server may already have exited during test cleanup.
      }
    }
    await new Promise<void>((resolve, reject) =>
      unrelatedServer.close(error => (error ? reject(error) : resolve()))
    );
    fs.rmSync(internalUserDataDir, { force: true, recursive: true });
  }
});
