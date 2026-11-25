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
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createServer, Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';
import * as tar from 'tar';

interface DesktopBridge {
  send(channel: string, value?: unknown): void;
  receive(channel: string, listener: (value: unknown) => void): (() => void) | undefined;
  removeListener(channel: string, listener: (value: unknown) => void): void;
}

const appPath = path.resolve(__dirname, '../..');
const electronPath = require('electron') as string;
const pluginName = 'headlamp-e2e-lifecycle';
const metadataUrl = `https://artifacthub.io/api/v1/packages/headlamp/e2e/${pluginName}`;
const packageUrl = metadataUrl.replace('/api/v1/', '/');
let app: ElectronApplication;
let page: Page;
let directory: string;
let destination: string;
let backend: Server;
let port: number;

async function exchange(channel: string, reply: string, value?: unknown): Promise<unknown> {
  return page.evaluate(
    ({ channel, reply, value }) => {
      const api = (window as Window & { desktopApi?: DesktopBridge }).desktopApi;
      if (!api) throw new Error('Desktop preload bridge is unavailable');
      return new Promise(resolve => {
        const receive = (response: unknown) => {
          api.removeListener(reply, receive);
          resolve(response);
        };
        api.receive(reply, receive);
        api.send(channel, value);
      });
    },
    { channel, reply, value }
  );
}

async function action(data: Record<string, unknown>) {
  await page.evaluate(data => {
    const api = (window as Window & { desktopApi?: DesktopBridge }).desktopApi;
    if (!api) throw new Error('Desktop preload bridge is unavailable');
    api.send('plugin-manager', JSON.stringify(data));
  }, data);
}

async function progress(identifier: string) {
  const errors = await app.evaluate(() => Reflect.get(globalThis, '__pluginManagerE2E').errors);
  expect(errors).toEqual([]);
  const response = await exchange(
    'plugin-manager',
    'plugin-manager',
    JSON.stringify({
      action: 'GET',
      identifier,
    })
  );
  if (typeof response !== 'string') throw new Error('Expected serialized plugin progress');
  return JSON.parse(response);
}

test.beforeEach(async () => {
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-ipc-')));
  destination = path.join(directory, 'installed');
  const temporary = path.join(directory, 'tmp');
  fs.mkdirSync(temporary);
  const manifest = path.join(directory, 'app-build-manifest.json');
  fs.writeFileSync(manifest, '{}');
  const archives: Buffer[] = [];
  for (const version of ['1.0.0', '2.0.0']) {
    const source = path.join(directory, version, 'package');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'main.js'), `globalThis.pluginVersion = '${version}';`);
    fs.writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({ name: pluginName, version })
    );
    const archive = path.join(directory, `${version}.tar.gz`);
    await tar.create({ cwd: path.dirname(source), file: archive, gzip: true }, ['package']);
    archives.push(fs.readFileSync(archive));
  }
  backend = createServer((request, response) => {
    const index = request.url === '/1.0.0.tar.gz' ? 0 : request.url === '/2.0.0.tar.gz' ? 1 : -1;
    if (index >= 0) response.writeHead(200).end(archives[index]);
    else if (request.url === '/config') response.writeHead(200).end('{}');
    else response.writeHead(404).end();
  });
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
  const address = backend.address();
  if (!address || typeof address === 'string') throw new Error('Backend did not acquire a port');
  port = address.port;
  app = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: ['.', `--port=${port}`, `--user-data-dir=${path.join(directory, 'profile')}`],
    env: {
      ...process.env,
      HOME: directory,
      APPDATA: directory,
      LOCALAPPDATA: directory,
      XDG_CONFIG_HOME: directory,
      XDG_DATA_HOME: directory,
      TMPDIR: temporary,
      ELECTRON_DEV: 'true',
      NODE_ENV: 'test',
      EXTERNAL_SERVER: 'true',
      ELECTRON_START_URL: 'data:text/html,<title>Plugin lifecycle test</title>',
      HEADLAMP_CHECK_FOR_UPDATES: 'false',
      HEADLAMP_MCP_ENABLE: 'false',
      HEADLAMP_BACKEND_TOKEN: 'e2e-backend-token',
      HEADLAMP_APP_VERSION: '0.0.0-e2e',
      HEADLAMP_BUILD_MANIFEST: manifest,
    },
  });
  page = await app.firstWindow();
  const metadata = ['1.0.0', '2.0.0'].map((version, index) => ({
    package_id: '00000000-0000-4000-8000-000000000001',
    name: pluginName,
    display_name: 'E2E plugin',
    version,
    repository: {
      repository_id: '00000000-0000-4000-8000-000000000002',
      name: 'e2e',
      user_alias: 'test',
    },
    data: {
      'headlamp/plugin/archive-url': `http://localhost:${port}/${version}.tar.gz`,
      'headlamp/plugin/archive-checksum': crypto
        .createHash('sha256')
        .update(archives[index])
        .digest('hex'),
      'headlamp/plugin/version-compat': '*',
    },
  }));
  await app.evaluate(
    ({ dialog }, { metadataUrl, metadata }) => {
      const errors: string[] = [];
      const state = { consent: 0, version: 0, errors };
      Reflect.set(globalThis, '__pluginManagerE2E', state);
      const originalFetch = globalThis.fetch;
      const archives = new Set(metadata.map(info => info.data['headlamp/plugin/archive-url']));
      globalThis.fetch = async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url === metadataUrl) return new Response(JSON.stringify(metadata[state.version]));
        if (!archives.has(url)) throw new Error(`Unexpected network request: ${url}`);
        return originalFetch(input, init);
      };
      dialog.showMessageBox = async () => ({ response: state.consent, checkboxChecked: false });
      dialog.showErrorBox = (title, content) => {
        state.errors.push(`${title}: ${content}`);
      };
    },
    { metadataUrl, metadata }
  );
});

test.afterEach(async () => {
  await app?.close();
  if (backend?.listening) {
    await new Promise<void>((resolve, reject) =>
      backend.close(error => (error ? reject(error) : resolve()))
    );
  }
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test('declining consent does not install a plugin', async () => {
  await app.evaluate(() => {
    Reflect.get(globalThis, '__pluginManagerE2E').consent = 1;
  });
  await action({
    action: 'INSTALL',
    identifier: 'declined',
    URL: packageUrl,
    destinationFolder: destination,
  });

  await expect
    .poll(() => progress('declined'))
    .toMatchObject({
      type: 'error',
      message: 'installation cancelled due to user consent',
    });
  expect(fs.existsSync(destination)).toBe(false);
});

test('installs, lists, updates and removes a plugin through the renderer bridge', async () => {
  const bundle = path.join(destination, pluginName);
  const packageFile = path.join(bundle, 'package.json');
  await action({
    action: 'INSTALL',
    identifier: 'install',
    URL: packageUrl,
    destinationFolder: destination,
  });
  await expect
    .poll(() => progress('install'))
    .toMatchObject({ type: 'success', message: 'Plugin Installed' });
  expect(JSON.parse(fs.readFileSync(packageFile, 'utf8')).version).toBe('1.0.0');

  const listed = await exchange(
    'plugin-manager',
    'plugin-manager',
    JSON.stringify({
      action: 'LIST',
      identifier: 'list',
      destinationFolder: destination,
    })
  );
  if (typeof listed !== 'string') throw new Error('Expected serialized plugin list');
  expect(JSON.parse(listed)).toMatchObject({
    identifier: 'list',
    type: 'success',
    data: [expect.objectContaining({ pluginName, pluginVersion: '1.0.0' })],
  });
  await app.evaluate(() => {
    Reflect.get(globalThis, '__pluginManagerE2E').version = 1;
  });
  await action({
    action: 'UPDATE',
    identifier: 'update',
    pluginName,
    destinationFolder: destination,
  });
  await expect
    .poll(() => progress('update'))
    .toMatchObject({ type: 'success', message: 'Plugin Updated' });
  expect(JSON.parse(fs.readFileSync(packageFile, 'utf8')).version).toBe('2.0.0');

  await action({
    action: 'UNINSTALL',
    identifier: 'uninstall',
    pluginName,
    destinationFolder: destination,
  });
  await expect
    .poll(() => progress('uninstall'))
    .toMatchObject({ type: 'success', message: 'Plugin Uninstalled' });
  expect(fs.existsSync(bundle)).toBe(false);
});

test('reports invalid operations without creating files', async () => {
  expect(await progress('unknown')).toMatchObject({
    type: 'error',
    message: 'No such operation in progress',
  });
  for (const operation of ['UPDATE', 'UNINSTALL']) {
    await action({ action: operation, identifier: operation, destinationFolder: destination });
    await expect
      .poll(() => progress(operation))
      .toMatchObject({ type: 'error', message: 'Plugin Name is required' });
  }
  expect(fs.existsSync(destination)).toBe(false);
});

test('returns the configured version, ready backend port and token to its renderer', async () => {
  expect(await exchange('appConfig', 'appConfig')).toMatchObject({
    checkForUpdates: false,
    appVersion: '0.0.0-e2e',
  });
  expect(await exchange('request-backend-port', 'backend-port')).toBe(port);
  expect(await exchange('request-backend-token', 'backend-token')).toBe('e2e-backend-token');
});

test('validates and persists tray visibility requests', async () => {
  const initial = await exchange('request-tray-icon', 'tray-icon');
  await page.evaluate(() => {
    const api = (window as Window & { desktopApi?: DesktopBridge }).desktopApi;
    if (!api) throw new Error('Desktop preload bridge is unavailable');
    api.send('set-tray-icon', 'invalid');
  });
  expect(await exchange('request-tray-icon', 'tray-icon')).toBe(initial);
  await page.evaluate(() => {
    const api = (window as Window & { desktopApi?: DesktopBridge }).desktopApi;
    if (!api) throw new Error('Desktop preload bridge is unavailable');
    api.send('set-tray-icon', false);
  });
  expect(await exchange('request-tray-icon', 'tray-icon')).toBe(false);
});
