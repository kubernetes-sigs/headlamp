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

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
      frontend.kill('SIGTERM');
      upgradedSocket?.destroy();
      await new Promise(resolve => backend.close(resolve));
    }
  }
);
