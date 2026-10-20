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
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';

const appPath = path.resolve(__dirname, '../..');
const plugins = [
  { bundleName: 'github-oauth-e2e', packageName: '@headlamp-k8s/github-oauth-e2e' },
  { bundleName: 'github-oauth-e2e-other', packageName: '@headlamp-k8s/github-oauth-e2e-other' },
];
let backend: Server;
let electronApp: ElectronApplication;
let page: Page;
let directory: string;
const pluginDirectories: string[] = [];
let capability: string;
let ungrantedCapability: string;

test.describe('GitHub OAuth compiled desktop bridge', () => {
  test.beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-github-oauth-e2e-'));
    const manifest = path.join(directory, 'manifest.json');
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        product: { protocols: { name: 'test', schemes: ['test-desktop'] } },
        githubOAuth: { clientId: 'test-client', clientSecret: 'test-public-client-credential' },
        runCommands: [
          {
            environment: 'development',
            pluginLocation: 'shipped',
            plugins: [plugins[0]],
            commands: [{ tool: 'gh', args: ['--version'] }],
            githubOAuth: true,
          },
          {
            environment: 'development',
            pluginLocation: 'shipped',
            plugins: [plugins[1]],
            commands: [{ tool: 'gh', args: ['--version'] }],
          },
        ],
      })
    );
    backend = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
    await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
    const port = (backend.address() as AddressInfo).port;
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: path.join(
        appPath,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'electron.cmd' : 'electron'
      ),
      args: [
        '.',
        '--no-sandbox',
        `--port=${port}`,
        `--user-data-dir=${path.join(directory, 'profile')}`,
      ],
      env: {
        ...process.env,
        ELECTRON_DEV: 'true',
        ELECTRON_START_URL: 'data:text/html,<html></html>',
        EXTERNAL_SERVER: 'true',
        HEADLAMP_BACKEND_TOKEN: 'test-backend-token',
        HEADLAMP_BUILD_MANIFEST: manifest,
        HEADLAMP_CHECK_FOR_UPDATES: 'false',
        HEADLAMP_MCP_ENABLE: 'false',
      },
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('load');

    // Real synthetic shipped plugins pass the one-time provenance registration;
    // only the product-granted identity may use GitHub OAuth.
    const resourcesPath = await electronApp.evaluate(() => process.resourcesPath);
    const registrations = plugins.map(({ bundleName, packageName }) => {
      const pluginDirectory = path.join(resourcesPath, '.plugins', bundleName);
      pluginDirectories.push(pluginDirectory);
      fs.mkdirSync(pluginDirectory, { recursive: true });
      const source = `globalThis[${JSON.stringify(bundleName)}] = true;\n`;
      fs.writeFileSync(path.join(pluginDirectory, 'main.js'), source);
      fs.writeFileSync(
        path.join(pluginDirectory, 'package.json'),
        JSON.stringify({ name: packageName })
      );
      return {
        bundleName,
        packageName,
        path: `static-plugins/${bundleName}`,
        source: 'shipped',
        type: 'shipped',
        sourceDigest: createHash('sha256').update(source).digest('hex'),
      };
    });
    const capabilities = await page.evaluate(
      registrations => window.desktopApi.commandCapabilities.register(registrations),
      registrations
    );
    expect(capabilities).toHaveLength(2);
    expect(capabilities[0]).toMatchObject({ ...plugins[0], githubOAuth: true });
    expect(capabilities[1]).not.toHaveProperty('githubOAuth');
    capability = capabilities[0].capability;
    ungrantedCapability = capabilities[1].capability;

    // Keep all Electron/IPC/protocol code real. Only the external browser and
    // GitHub transport are simulated; no personal account or token is used.
    await electronApp.evaluate(({ shell }) => {
      const state = globalThis as any;
      state.oauthRequests = [];
      shell.openExternal = async value => {
        state.oauthAuthorizationUrl = value;
      };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        if (String(input) !== 'https://github.com/login/oauth/access_token') {
          return originalFetch(input, init);
        }
        const body = new URLSearchParams(String(init?.body));
        state.oauthRequests.push(Object.fromEntries(body));
        const refreshed = body.get('grant_type') === 'refresh_token';
        return new Response(
          JSON.stringify({
            access_token: refreshed ? 'ghu_rotated' : 'ghu_fresh',
            refresh_token: refreshed ? 'ghr_rotated' : 'ghr_fresh',
            expires_in: 28800,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
    if (backend) await new Promise<void>(resolve => backend.close(() => resolve()));
    for (const pluginDirectory of pluginDirectories) {
      fs.rmSync(pluginDirectory, { recursive: true, force: true });
    }
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  });

  test('exposes no global token subscription and denies wrong capabilities', async () => {
    expect(
      await page.evaluate(() => {
        const api = window.desktopApi as any;
        return [
          typeof api.startGitHubOAuth,
          typeof api.onGitHubOAuthCallback,
          typeof api.refreshGitHubOAuth,
          Object.keys(api.githubOAuth).sort(),
        ];
      })
    ).toEqual(['undefined', 'undefined', 'undefined', ['refresh', 'start']]);
    for (const wrong of [ungrantedCapability, 'f'.repeat(64), undefined]) {
      await expect(
        page.evaluate(token => (window.desktopApi as any).githubOAuth.start(token), wrong)
      ).resolves.toEqual({ success: false, error: 'Unauthorized request' });
      await expect(
        page.evaluate(
          token => (window.desktopApi as any).githubOAuth.refresh(token, 'ghr_fresh'),
          wrong
        )
      ).resolves.toEqual({ success: false, error: 'Unauthorized request' });
    }
    expect(await electronApp.evaluate(() => (globalThis as any).oauthAuthorizationUrl)).toBe(
      undefined
    );
    expect(await electronApp.evaluate(() => (globalThis as any).oauthRequests)).toEqual([]);
  });

  test('signs in with PKCE and refreshes through the actual compiled preload and main process', async () => {
    await page.evaluate(token => {
      const state = window as any;
      state.oauthStart = state.desktopApi.githubOAuth.start(token);
    }, capability);
    await expect
      .poll(() => electronApp.evaluate(() => (globalThis as any).oauthAuthorizationUrl))
      .toBeTruthy();
    const authorize = new URL(
      await electronApp.evaluate(() => (globalThis as any).oauthAuthorizationUrl)
    );
    expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(authorize.searchParams.get('client_id')).toBe('test-client');
    expect(authorize.searchParams.get('redirect_uri')).toBe(
      'http://localhost:48321/oauth/callback'
    );
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const challenge = authorize.searchParams.get('code_challenge')!;
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorize.searchParams.has('code_verifier')).toBe(false);
    const callback = new URL('http://127.0.0.1:48321/oauth/callback');
    callback.search = new URLSearchParams({
      state: authorize.searchParams.get('state')!,
      code: 'test-authorization-code',
    }).toString();
    const response = await fetch(callback);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('ghu_fresh');
    expect(await page.evaluate(() => (window as any).oauthStart)).toMatchObject({
      success: true,
      accessToken: 'ghu_fresh',
      refreshToken: 'ghr_fresh',
    });
    const refreshed = await page.evaluate(
      token => (window as any).desktopApi.githubOAuth.refresh(token, 'ghr_fresh'),
      capability
    );
    expect(refreshed).toMatchObject({
      success: true,
      accessToken: 'ghu_rotated',
      refreshToken: 'ghr_rotated',
    });
    expect(Date.parse(refreshed.expiresAt)).toBeGreaterThan(Date.now());
    const requests = await electronApp.evaluate(() => (globalThis as any).oauthRequests);
    expect(requests).toEqual([
      {
        client_id: 'test-client',
        client_secret: 'test-public-client-credential',
        code: 'test-authorization-code',
        redirect_uri: 'http://localhost:48321/oauth/callback',
        code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      },
      {
        client_id: 'test-client',
        client_secret: 'test-public-client-credential',
        grant_type: 'refresh_token',
        refresh_token: 'ghr_fresh',
      },
    ]);
    expect(createHash('sha256').update(requests[0].code_verifier).digest('base64url')).toBe(
      challenge
    );
  });
});
