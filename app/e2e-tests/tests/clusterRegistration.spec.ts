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
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const appPath = path.resolve(__dirname, '../..');
const electronPath = path.join(appPath, 'node_modules', '.bin', electronExecutable);
const bundleName = 'cluster-registration-e2e';
const packageName = '@headlamp-k8s/cluster-registration-e2e';
const generatedKubeconfig = JSON.stringify({
  apiVersion: 'v1',
  clusters: [{ name: 'e2e-cluster', cluster: { server: 'https://e2e.example' } }],
  contexts: [{ name: 'e2e-cluster', context: { cluster: 'e2e-cluster', user: 'e2e-user' } }],
  users: [{ name: 'e2e-user', user: { token: 'e2e-token' } }],
  'current-context': 'e2e-cluster',
});

let backend: Server;
let electronApp: ElectronApplication;
let electronPage: Page;
let manifestDirectory: string;
let pluginDirectory: string;
let cliPath: string;
let resourceDirectory: string;
let resourcesDirectoryExisted: boolean;
let capability: string;
let kubeconfigPath: string;

function sha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFakeAzureCli(filePath: string): void {
  if (process.platform === 'win32') {
    const escapedKubeconfig = generatedKubeconfig.replaceAll('%', '%%');
    fs.writeFileSync(
      filePath,
      `@echo off\r\nset "output="\r\n:args\r\nif "%~1"=="" goto write\r\nif "%~1"=="--file" (\r\n  set "output=%~2"\r\n  shift\r\n)\r\nshift\r\ngoto args\r\n:write\r\n>"%output%" echo ${escapedKubeconfig}\r\n`
    );
    return;
  }
  fs.writeFileSync(
    filePath,
    `#!/bin/sh\nset -eu\noutput=''\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = '--file' ]; then\n    output="$2"\n    shift 2\n  else\n    shift\n  fi\ndone\ntest -n "$output"\nprintf '%s\\n' '${generatedKubeconfig}' > "$output"\n`,
    { mode: 0o755 }
  );
}

test.describe('desktop cluster registration', () => {
  test.beforeAll(async () => {
    manifestDirectory = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-cluster-registration-e2e-'))
    );
    kubeconfigPath = path.join(manifestDirectory, 'kubeconfig');
    const resourcesPath = path.join(appPath, 'resources');
    resourcesDirectoryExisted = fs.existsSync(resourcesPath);
    fs.mkdirSync(resourcesPath, { recursive: true });
    resourceDirectory = fs.mkdtempSync(path.join(resourcesPath, 'cluster-registration-e2e-'));

    const cliName = process.platform === 'win32' ? 'fake-az.cmd' : 'fake-az';
    cliPath = path.join(resourceDirectory, cliName);
    const pythonPath = path.join(resourceDirectory, 'python');
    const kubeloginPath = path.join(resourceDirectory, 'kubelogin.py');
    writeFakeAzureCli(cliPath);
    fs.writeFileSync(pythonPath, 'python fixture\n');
    fs.writeFileSync(kubeloginPath, 'kubelogin fixture\n');

    const platformTools = (filePath: string) => ({
      [process.platform]: {
        path: path.relative(resourcesPath, filePath).split(path.sep).join('/'),
        sha256: sha256(filePath),
      },
    });
    const manifestFile = path.join(manifestDirectory, 'app-build-manifest.json');
    fs.writeFileSync(
      manifestFile,
      JSON.stringify({
        'external-tools': [
          { id: 'e2e-az', platforms: platformTools(cliPath) },
          { id: 'e2e-python', platforms: platformTools(pythonPath) },
          { id: 'e2e-kubelogin', platforms: platformTools(kubeloginPath) },
        ],
        runCommands: [
          {
            environment: 'development',
            pluginLocation: 'shipped',
            plugins: [{ bundleName, packageName }],
            commands: [{ tool: 'gh', args: ['--version'] }],
            clusterRegistrationProviders: [
              {
                id: 'azure',
                type: 'azure',
                tools: {
                  cli: 'e2e-az',
                  python: 'e2e-python',
                  kubelogin: 'e2e-kubelogin',
                },
              },
            ],
          },
        ],
      })
    );

    backend = createServer((request, response) => {
      if (request.url === '/config') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>(resolve => backend.listen(0, resolve));
    const port = (backend.address() as AddressInfo).port;
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--port=${port}`, `--user-data-dir=${path.join(manifestDirectory, 'profile')}`],
      env: {
        ...process.env,
        ELECTRON_DEV: 'true',
        ELECTRON_START_URL: 'data:text/html,<html></html>',
        EXTERNAL_SERVER: 'true',
        HEADLAMP_BUILD_MANIFEST: manifestFile,
        HEADLAMP_CHECK_FOR_UPDATES: 'false',
        HEADLAMP_MCP_ENABLE: 'false',
        KUBECONFIG: kubeconfigPath,
        NODE_ENV: 'development',
      },
    });
    electronPage = await electronApp.firstWindow();
    await electronPage.waitForLoadState('load');

    const pluginResourcesPath = await electronApp.evaluate(() => process.resourcesPath);
    pluginDirectory = path.join(pluginResourcesPath, '.plugins', bundleName);
    fs.mkdirSync(pluginDirectory, { recursive: true });
    const source = 'globalThis.clusterRegistrationE2E = true;\n';
    fs.writeFileSync(path.join(pluginDirectory, 'main.js'), source);
    fs.writeFileSync(
      path.join(pluginDirectory, 'package.json'),
      JSON.stringify({ name: packageName })
    );
    const sourceDigest = createHash('sha256').update(source).digest('hex');

    const capabilities = await electronPage.evaluate(
      async ({ bundleName, packageName, sourceDigest }) =>
        window.desktopApi.commandCapabilities.register([
          {
            bundleName,
            packageName,
            path: `static-plugins/${bundleName}`,
            source: 'shipped',
            type: 'shipped',
            sourceDigest,
          },
          {
            bundleName,
            packageName: '@example/spoofed',
            path: `static-plugins/${bundleName}`,
            source: 'shipped',
            type: 'shipped',
            sourceDigest,
          },
        ]),
      { bundleName, packageName, sourceDigest }
    );
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]).toMatchObject({
      bundleName,
      packageName,
      clusterRegistrationProviders: ['azure'],
    });
    capability = capabilities[0].capability;
    expect(capability).toMatch(/^[a-f0-9]{64}$/);
  });

  test.afterAll(async () => {
    await electronApp?.close();
    if (backend) {
      await new Promise<void>((resolve, reject) =>
        backend.close(error => (error ? reject(error) : resolve()))
      );
    }
    if (pluginDirectory) fs.rmSync(pluginDirectory, { recursive: true, force: true });
    if (resourceDirectory) fs.rmSync(resourceDirectory, { recursive: true, force: true });
    const resourcesPath = path.join(appPath, 'resources');
    if (!resourcesDirectoryExisted) fs.rmSync(resourcesPath, { recursive: true, force: true });
    if (manifestDirectory) fs.rmSync(manifestDirectory, { recursive: true, force: true });
  });

  test('authorizes an attested plugin and persists provider credentials', async () => {
    const invoke = (provider: string, options: unknown, token: string) =>
      electronPage.evaluate(
        ({ provider, options, token }) =>
          window.desktopApi.registerCluster(provider, options, token),
        { provider, options, token }
      );

    await expect(invoke('gke', {}, capability)).resolves.toEqual({
      success: false,
      message: 'Cluster registration request was rejected.',
    });
    await expect(invoke('azure', {}, 'f'.repeat(64))).resolves.toEqual({
      success: false,
      message: 'Cluster registration request was rejected.',
    });
    await expect(invoke('azure', {}, capability)).resolves.toEqual({
      success: false,
      message: "Invalid options for cluster registration provider 'azure'.",
    });
    fs.appendFileSync(cliPath, 'tampered');
    await expect(
      invoke(
        'azure',
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'e2e-cluster',
          isAzureRBACEnabled: false,
        },
        capability
      )
    ).resolves.toEqual({
      success: false,
      message: "External tool 'e2e-az' failed integrity verification",
    });
    writeFakeAzureCli(cliPath);
    await expect(
      invoke(
        'azure',
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'e2e-cluster',
          isAzureRBACEnabled: false,
        },
        capability
      )
    ).resolves.toMatchObject({ success: true });

    const kubeconfig = fs.readFileSync(kubeconfigPath, 'utf8');
    expect(kubeconfig).toContain('"current-context": "e2e-cluster"');
    expect(kubeconfig).toContain('"server": "https://e2e.example"');
  });
});
