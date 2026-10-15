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

import { chromium, expect, test } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');
const testDir = path.join(os.tmpdir(), `headlamp-e2e-headless-token-${process.pid}`);
const urlOutputPath = path.join(testDir, 'headless-url.txt');

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

test.describe('Headless mode real application authentication', () => {
  test('launches app with --headless, sanitizes URL fragment, and maintains authentication across reloads', async () => {
    fs.mkdirSync(testDir, { recursive: true });

    let electronProcess: ReturnType<typeof spawn> | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

    try {
      const electronEnv = {
        ...process.env,
        ELECTRON_DEV: 'true',
        EXTERNAL_SERVER: 'false',
        HEADLAMP_CHECK_FOR_UPDATES: 'false',
        HEADLAMP_MCP_ENABLE: 'false',
        HEADLAMP_E2E_HEADLESS_URL_PATH: urlOutputPath,
      };

      electronProcess = spawn(
        electronPath,
        ['.', '--headless', '--port=0', `--user-data-dir=${testDir}`],
        {
          cwd: appPath,
          detached: process.platform !== 'win32',
          env: electronEnv,
          shell: process.platform === 'win32',
          stdio: 'pipe',
          windowsHide: true,
        }
      );

      // Wait for Electron to start the backend and write the headless URL
      await expect
        .poll(
          () => {
            if (fs.existsSync(urlOutputPath)) {
              const content = fs.readFileSync(urlOutputPath, 'utf8').trim();
              if (content.startsWith('http://127.0.0.1:')) {
                return content;
              }
            }
            return '';
          },
          { timeout: 30_000 }
        )
        .toContain('#backendToken=');

      const headlessUrl = fs.readFileSync(urlOutputPath, 'utf8').trim();
      expect(headlessUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#backendToken=[a-f0-9]+$/);

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Wait for backend server to be responsive
      const baseUrl = headlessUrl.split('#')[0];
      await expect
        .poll(
          async () => {
            try {
              const res = await fetch(baseUrl);
              return res.status;
            } catch {
              return 0;
            }
          },
          { timeout: 15_000 }
        )
        .toBe(200);

      // 1. Navigate to the headless launch URL with the fragment
      const response = await page.goto(headlessUrl, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);

      // 2. Fragment must be immediately stripped from the address bar
      await expect.poll(() => page.url(), { timeout: 10_000 }).not.toContain('backendToken');

      // 3. /config fetch succeeds with 200 when authenticated
      const origin = new URL(page.url()).origin;
      const initialStatus = await page.evaluate(async targetOrigin => {
        const res = await fetch(`${targetOrigin}/config`);
        return res.status;
      }, origin);
      expect(initialStatus).toBe(200);

      // 4. Reload page (URL has no hash fragment)
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect(page.url()).not.toContain('backendToken');

      // 5. Token is restored from sessionStorage and /config still succeeds
      await expect
        .poll(
          async () => {
            return await page.evaluate(async targetOrigin => {
              try {
                const res = await fetch(`${targetOrigin}/config`);
                return res.status;
              } catch {
                return 0;
              }
            }, origin);
          },
          { timeout: 10_000 }
        )
        .toBe(200);
    } finally {
      if (browser) {
        await browser.close();
      }
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
      fs.rmSync(testDir, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  test('does not publish the headless token URL to an occupied port during a bind race', async () => {
    const receivedRequests: string[] = [];
    const unrelatedServer = createServer((request, response) => {
      receivedRequests.push(String(request.url));
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
    await new Promise<void>(resolve => unrelatedServer.listen(0, '127.0.0.1', resolve));
    const occupiedPort = (unrelatedServer.address() as AddressInfo).port;
    const internalUserDataDir = path.join(os.tmpdir(), `headlamp-e2e-headless-race-${process.pid}`);
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
    const headlessUrlPath = path.join(internalUserDataDir, 'headless-url.txt');
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
  fs.appendFileSync(tokenPath, String(request.url) + '\\n');
  response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
}).listen(Number(port), '127.0.0.1', () => fs.writeFileSync(readyPath, 'ready'));
`
      );
      execFileSync('go', ['build', '-o', backendFixtureExecutable, backendFixturePath]);
      const startedElectronProcess = spawn(
        electronPath,
        ['.', '--headless', `--port=${occupiedPort}`, `--user-data-dir=${internalUserDataDir}`],
        {
          cwd: appPath,
          detached: process.platform !== 'win32',
          env: {
            ...process.env,
            ELECTRON_DEV: 'true',
            EXTERNAL_SERVER: 'false',
            HEADLAMP_CHECK_FOR_UPDATES: 'false',
            HEADLAMP_E2E_HEADLESS_URL_PATH: headlessUrlPath,
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

      startedElectronProcess.stdout.on('data', data => {
        output += data.toString();
      });
      startedElectronProcess.stderr.on('data', data => {
        output += data.toString();
      });

      // Wait for Electron to retry and publish the headless URL on the retried port
      await expect
        .poll(
          () => {
            if (fs.existsSync(headlessUrlPath)) {
              const content = fs.readFileSync(headlessUrlPath, 'utf8').trim();
              if (content.startsWith('http://127.0.0.1:')) {
                return content;
              }
            }
            return '';
          },
          { timeout: 30_000 }
        )
        .toContain('#backendToken=');

      // Verify that Electron retried after the port collision
      expect(output).toContain('selected port became occupied; retrying');

      const publishedHeadlessUrl = fs.readFileSync(headlessUrlPath, 'utf8').trim();
      const publishedPort = Number(new URL(publishedHeadlessUrl.split('#')[0]).port);

      // The published URL must NOT point to the occupied port
      expect(publishedPort).not.toBe(occupiedPort);
      expect(publishedPort).toBeGreaterThan(occupiedPort);

      // The race server must never have received any requests containing the token
      expect(
        fs.existsSync(receivedTokenPath) ? fs.readFileSync(receivedTokenPath, 'utf8') : ''
      ).toBe('');
      expect(receivedRequests).toEqual([]);

      // Verify that the retried backend server is running and responsive
      const baseUrl = publishedHeadlessUrl.split('#')[0];
      const res = await fetch(baseUrl);
      expect(res.status).toBe(200);
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
      fs.rmSync(internalUserDataDir, {
        force: true,
        recursive: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  });
});
