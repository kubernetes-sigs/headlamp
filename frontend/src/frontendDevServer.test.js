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

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** How long to wait for the process group to exit after SIGTERM before SIGKILL. */
const GROUP_EXIT_TIMEOUT_MS = 5000;

/**
 * The child is spawned with `detached: true`, making it the leader of its
 * own process group. Signaling the negative pid signals the whole group
 * (npm and the rsbuild dev server it launched).
 */
function signalProcessGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function processGroupIsAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function waitForProcessGroupToExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupIsAlive(pid)) {
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return true;
}

/** Resolves when `promise` settles or after `timeoutMs`, whichever comes first. */
async function waitWithTimeout(promise, timeoutMs) {
  let timer;
  try {
    await Promise.race([
      promise,
      new Promise(resolve => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `npm start` launches the rsbuild dev server as a child of the npm
 * process. Signaling only the npm process stops npm but leaves the
 * rsbuild child running (still holding the dev server port), because
 * SIGTERM is never delivered to it. Stop the whole process tree instead,
 * and wait for it to actually exit so no process is left behind when the
 * test finishes.
 *
 * On POSIX npm can exit before its descendants do (they may clean up
 * asynchronously after SIGTERM), so this waits for the whole process
 * group, npm included, and sends SIGKILL to it if it has not exited
 * within `groupExitTimeoutMs`.
 */
async function stopProcessTree(child, { groupExitTimeoutMs = GROUP_EXIT_TIMEOUT_MS } = {}) {
  if (!child.pid) {
    return;
  }
  // If npm already exited (for example because startup failed), its 'exit'
  // event has fired and will not fire again, so do not wait for it. The
  // process group is still signaled below to stop any surviving children.
  const alreadyExited = child.exitCode !== null || child.signalCode !== null;
  const exited = alreadyExited
    ? Promise.resolve()
    : new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/pid', `${child.pid}`, '/T', '/F']);
    if (result.error || result.status !== 0) {
      // taskkill can fail to start or to find the process. Stop npm itself so
      // the wait below does not hang on a process that is still alive.
      child.kill();
    }
    await waitWithTimeout(exited, groupExitTimeoutMs);
    return;
  }

  signalProcessGroup(child, 'SIGTERM');
  // The group wait starts right after SIGTERM, so it also bounds the wait
  // for npm itself: if npm ignores SIGTERM, SIGKILL is still sent.
  if (!(await waitForProcessGroupToExit(child.pid, groupExitTimeoutMs))) {
    signalProcessGroup(child, 'SIGKILL');
    await waitForProcessGroupToExit(child.pid, groupExitTimeoutMs);
  }
  await exited;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  if (!port) {
    throw new Error('Failed to reserve a local port');
  }
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The development server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test(
  'stopping the process tree returns right away if the process already exited',
  { timeout: 5000 },
  async () => {
    const child = spawn(process.execPath, ['-e', ''], {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    await new Promise(resolve => child.once('exit', resolve));

    await stopProcessTree(child);
  }
);

/**
 * Starts a parent process (the leader of its own process group) that exits
 * as soon as it receives SIGTERM, and a descendant that either takes 700 ms
 * to exit after SIGTERM or ignores SIGTERM. Resolves once the descendant has
 * installed its signal handler, with the descendant's pid.
 */
async function spawnTreeWithSlowDescendant(ignoreSigterm) {
  const descendantSource = `
    process.on('SIGTERM', () => ${ignoreSigterm ? '{}' : 'setTimeout(() => process.exit(0), 700)'});
    setInterval(() => {}, 1000);
    console.log('ready');
  `;
  const parentSource = `
    const { spawn } = require('node:child_process');
    const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    descendant.stdout.once('data', () => console.log(descendant.pid));
    process.on('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 1000);
  `;
  const parent = spawn(process.execPath, ['-e', parentSource], {
    stdio: ['ignore', 'pipe', 'ignore'],
    detached: true,
  });
  const descendantPid = await new Promise((resolve, reject) => {
    parent.stdout.once('data', data => resolve(Number(data.toString().trim())));
    parent.once('error', reject);
  });
  return { parent, descendantPid };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test.skipIf(process.platform === 'win32')(
  'stopping the process tree waits for a descendant that exits after its parent',
  { timeout: 15000 },
  async () => {
    const { parent, descendantPid } = await spawnTreeWithSlowDescendant(false);
    try {
      await stopProcessTree(parent);
      expect(processIsAlive(descendantPid)).toBe(false);
    } finally {
      if (processIsAlive(descendantPid)) {
        process.kill(descendantPid, 'SIGKILL');
      }
    }
  }
);

test.skipIf(process.platform === 'win32')(
  'stopping the process tree force-kills a descendant that ignores SIGTERM',
  { timeout: 15000 },
  async () => {
    const { parent, descendantPid } = await spawnTreeWithSlowDescendant(true);
    try {
      await stopProcessTree(parent, { groupExitTimeoutMs: 300 });
      expect(processIsAlive(descendantPid)).toBe(false);
    } finally {
      if (processIsAlive(descendantPid)) {
        process.kill(descendantPid, 'SIGKILL');
      }
    }
  }
);

test.skipIf(process.platform === 'win32')(
  'stopping the process tree force-kills a leader that ignores SIGTERM',
  { timeout: 15000 },
  async () => {
    const leader = spawn(
      process.execPath,
      ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); console.log('ready');"],
      { stdio: ['ignore', 'pipe', 'ignore'], detached: true }
    );
    try {
      await new Promise((resolve, reject) => {
        leader.stdout.once('data', resolve);
        leader.once('error', reject);
      });
      await stopProcessTree(leader, { groupExitTimeoutMs: 300 });
      expect(processIsAlive(leader.pid)).toBe(false);
    } finally {
      if (processIsAlive(leader.pid)) {
        process.kill(leader.pid, 'SIGKILL');
      }
    }
  }
);

test(
  'the default development server proxies base-prefixed WebSockets',
  { timeout: 30000 },
  async () => {
    const frontendPort = await reservePort();
    let upgradedPath;
    let upgradedSocket;
    const backend = http.createServer();
    backend.on('upgrade', (request, socket) => {
      upgradedPath = request.url;
      upgradedSocket = socket;
      const key = request.headers['sec-websocket-key'];
      const accept = createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
    });
    await new Promise((resolve, reject) => {
      backend.once('error', reject);
      backend.listen(0, '127.0.0.1', resolve);
    });
    const address = backend.address();
    const backendPort = typeof address === 'object' && address ? address.port : undefined;
    const npmCli = process.env.npm_execpath;
    if (!backendPort || !npmCli) {
      throw new Error('Failed to prepare the development server test');
    }

    const frontend = spawn(
      process.execPath,
      [npmCli, 'start', '--', '--host', '127.0.0.1', '--port', `${frontendPort}`],
      {
        cwd: frontendDirectory,
        env: {
          ...process.env,
          HEADLAMP_PORT: `${backendPort}`,
          PUBLIC_URL: '/headlamp',
        },
        stdio: 'ignore',
        detached: process.platform !== 'win32',
      }
    );

    try {
      await waitForServer(`http://127.0.0.1:${frontendPort}/headlamp/`);
      await new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${frontendPort}/headlamp/wsMultiplexer`);
        const timeout = setTimeout(() => reject(new Error('WebSocket proxy timed out')), 5000);
        socket.addEventListener('open', () => {
          clearTimeout(timeout);
          socket.close();
          resolve();
        });
        socket.addEventListener('error', () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket proxy failed'));
        });
      });
      expect(upgradedPath).toBe('/headlamp/wsMultiplexer');
    } finally {
      try {
        await stopProcessTree(frontend);
      } finally {
        // Release the socket and the backend even if stopping the dev server fails.
        upgradedSocket?.destroy();
        await new Promise(resolve => backend.close(resolve));
      }
    }
  }
);
