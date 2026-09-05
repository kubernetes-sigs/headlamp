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
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron, Page } from 'playwright';

const clusterName = `headlamp-token-${process.pid}`;
const watchNamespace = `headlamp-token-watch-${process.pid}`;
const testDir = path.join(os.tmpdir(), `headlamp-e2e-backend-token-${process.pid}`);
const minikubeKubeconfig = path.join(testDir, 'minikube.kubeconfig');
const appKubeconfig = path.join(testDir, 'app.kubeconfig');
const isolatedConfigDir = path.join(testDir, 'config');
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');
const backendPath = path.resolve(appPath, '../backend/headlamp-server');
const pluginCatalogSourcePath = path.resolve(appPath, '../.plugins/plugin-catalog');
const electronDistPath = path.join(appPath, 'node_modules', 'electron', 'dist');
const electronResourcesPath =
  process.platform === 'darwin'
    ? path.join(electronDistPath, 'Electron.app', 'Contents', 'Resources')
    : path.join(electronDistPath, 'resources');
const pluginCatalogPath = path.join(electronResourcesPath, '.plugins', 'plugin-catalog');
const backendProtocolPrefix = 'base64url.headlamp.backend.authorization.k8s.io.';
const multiplexerProtocol = 'headlamp.multiplexer.k8s.io';
const reusableClusterContext = process.env.HEADLAMP_APP_E2E_CONTEXT;

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let electronPage: Page;

function run(
  command: string,
  args: string[],
  ignoreFailure = false,
  env: NodeJS.ProcessEnv = process.env
): string {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    }).trim();
  } catch (error) {
    if (ignoreFailure) {
      return '';
    }
    throw error;
  }
}

/**
 * Writes an isolated certificate-backed kubeconfig for the desktop app.
 * Reuses a CI cluster context when configured, otherwise creates a local Minikube profile.
 */
function setupCertificateBackedCluster(): void {
  fs.mkdirSync(isolatedConfigDir, { recursive: true, mode: 0o700 });

  if (reusableClusterContext) {
    fs.writeFileSync(
      appKubeconfig,
      run('kubectl', [
        '--context',
        reusableClusterContext,
        'config',
        'view',
        '--minify',
        '--raw',
        '--flatten',
      ]),
      { mode: 0o600 }
    );
    const isolatedContext = run('kubectl', [
      '--kubeconfig',
      appKubeconfig,
      'config',
      'current-context',
    ]);
    run('kubectl', [
      '--kubeconfig',
      appKubeconfig,
      'config',
      'rename-context',
      isolatedContext,
      clusterName,
    ]);
  } else {
    run('minikube', ['start', '--profile', clusterName], false, {
      ...process.env,
      KUBECONFIG: minikubeKubeconfig,
    });
  }

  const kubeconfig = run('kubectl', [
    '--kubeconfig',
    reusableClusterContext ? appKubeconfig : minikubeKubeconfig,
    '--context',
    clusterName,
    'config',
    'view',
    '--minify',
    '--raw',
    '--flatten',
  ]);
  if (
    !kubeconfig.includes('certificate-authority-data:') ||
    !kubeconfig.includes('client-certificate-data:')
  ) {
    throw new Error('Expected the test cluster to produce a certificate-backed kubeconfig');
  }
  fs.writeFileSync(appKubeconfig, kubeconfig, { mode: 0o600 });
}

/**
 * Requests the selected backend port from the Electron main process.
 *
 * @returns The selected port, or undefined until one has been assigned.
 */
function getBackendPort(): Promise<number | undefined> {
  return electronPage.evaluate(
    () =>
      new Promise<number | undefined>((resolve, reject) => {
        const desktopApi = (
          window as Window & {
            desktopApi?: {
              send: (channel: string, data?: unknown) => void;
              receive: (
                channel: string,
                callback: (port: number | undefined) => void
              ) => (() => void) | undefined;
            };
          }
        ).desktopApi;
        if (!desktopApi) {
          reject(new Error('Desktop API is unavailable'));
          return;
        }

        let unsubscribe: (() => void) | undefined;
        const timeout = window.setTimeout(() => {
          unsubscribe?.();
          resolve(undefined);
        }, 250);
        unsubscribe = desktopApi.receive('backend-port', port => {
          window.clearTimeout(timeout);
          unsubscribe?.();
          resolve(port);
        });
        desktopApi.send('request-backend-port');
      })
  );
}

/**
 * Waits until the backend listener enforces authentication on its config route.
 *
 * @returns The port of the ready backend server.
 */
async function waitForBackend(): Promise<number> {
  let backendPort: number | undefined;

  await expect
    .poll(
      async () => {
        backendPort = await getBackendPort();
        if (!backendPort) {
          return undefined;
        }

        try {
          return (await fetch(`http://localhost:${backendPort}/config`)).status;
        } catch {
          return undefined;
        }
      },
      { timeout: 30_000 }
    )
    .toBe(403);

  return backendPort!;
}

function getBackendToken(): Promise<string> {
  return electronPage.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const desktopApi = (
          window as Window & {
            desktopApi?: {
              send: (channel: string, data?: unknown) => void;
              receive: (
                channel: string,
                callback: (token: string) => void
              ) => (() => void) | undefined;
            };
          }
        ).desktopApi;
        if (!desktopApi) {
          reject(new Error('Desktop API is unavailable'));
          return;
        }

        let unsubscribe: (() => void) | undefined;
        unsubscribe = desktopApi.receive('backend-token', token => {
          unsubscribe?.();
          resolve(token);
        });
        desktopApi.send('request-backend-token');
      })
  );
}

test.beforeAll(async () => {
  test.setTimeout(4 * 60 * 1000);

  fs.accessSync(backendPath, fs.constants.X_OK);
  fs.cpSync(pluginCatalogSourcePath, pluginCatalogPath, { recursive: true });
  setupCertificateBackedCluster();
  electronApp = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_DEV: 'true',
      KUBECONFIG: appKubeconfig,
      XDG_CONFIG_HOME: isolatedConfigDir,
    },
  });
  electronPage = await electronApp.firstWindow();
  await electronPage.waitForLoadState('load');
});

test.afterAll(async () => {
  test.setTimeout(2 * 60 * 1000);

  await electronApp?.close();
  fs.rmSync(pluginCatalogPath, { force: true, recursive: true });
  if (fs.existsSync(appKubeconfig)) {
    run(
      'kubectl',
      ['--kubeconfig', appKubeconfig, 'delete', 'namespace', watchNamespace, '--ignore-not-found'],
      true
    );
  }
  if (!reusableClusterContext) {
    run('minikube', ['delete', '--profile', clusterName], true, {
      ...process.env,
      KUBECONFIG: minikubeKubeconfig,
    });
  }
  fs.rmSync(testDir, { force: true, recursive: true });
});

test.describe('desktop backend token', () => {
  test('loads the bundled plugin catalog through the authenticated proxy', async () => {
    await waitForBackend();
    await expect(electronPage.getByText('Plugin Catalog', { exact: true }).first()).toBeVisible();

    const responsePromise = electronPage.waitForResponse(response => {
      return new URL(response.url()).pathname === '/externalproxy';
    });
    await electronPage.evaluate(() => {
      window.location.hash = '#/plugin-catalog';
    });

    const response = await responsePromise;
    expect(response.request().headers()['x-headlamp_backend-token']).toBeTruthy();
    expect(response.status()).toBe(200);
  });

  test('rejects missing and wrong tokens for REST and multiplexer requests', async () => {
    const backendPort = await waitForBackend();

    const protectedURLs = [
      `http://localhost:${backendPort}/config`,
      `http://localhost:${backendPort}/clusters/${clusterName}/version`,
    ];
    for (const url of protectedURLs) {
      const response = await fetch(url);
      expect(response.status).toBe(403);

      const wrongTokenResponse = await fetch(url, {
        headers: { 'X-HEADLAMP_BACKEND-TOKEN': 'wrong-token' },
      });
      expect(wrongTokenResponse.status).toBe(403);
    }

    const websocketOpened = (protocols?: string[]) =>
      electronPage.evaluate(
        ({ port, protocols }) =>
          new Promise<boolean>(resolve => {
            const socket = new WebSocket(`ws://localhost:${port}/wsMultiplexer`, protocols);
            const timeout = window.setTimeout(() => {
              socket.close();
              resolve(false);
            }, 5000);

            socket.addEventListener('open', () => {
              window.clearTimeout(timeout);
              socket.close();
              resolve(true);
            });
            socket.addEventListener('error', () => {
              window.clearTimeout(timeout);
              resolve(false);
            });
          }),
        { port: backendPort, protocols }
      );
    await expect(websocketOpened()).resolves.toBe(false);

    const wrongTokenProtocol =
      backendProtocolPrefix + Buffer.from('wrong-token').toString('base64url');
    await expect(websocketOpened([multiplexerProtocol, wrongTokenProtocol])).resolves.toBe(false);
  });

  test('authorizes certificate-backed REST and multiplexer watch updates', async () => {
    test.setTimeout(2 * 60 * 1000);
    const backendPort = await waitForBackend();
    const backendToken = await getBackendToken();

    const helperResponse = await fetch(
      `http://localhost:${backendPort}/clusters/${clusterName}/portforward/list`,
      {
        headers: { 'X-HEADLAMP_BACKEND-TOKEN': backendToken },
      }
    );
    expect(helperResponse.status).toBe(200);

    const namespacesPath = `/clusters/${clusterName}/api/v1/namespaces`;
    const responsePromise = electronPage.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === namespacesPath && url.searchParams.get('watch') !== '1';
    });
    await electronPage.evaluate(name => {
      window.location.hash = `#/c/${name}`;
    }, clusterName);
    await electronPage.waitForURL(new RegExp(`/c/${clusterName}`));
    await electronPage.getByText('Namespaces', { exact: true }).click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.request().headers()['x-headlamp_backend-token']).toBeTruthy();

    const backendProtocol = backendProtocolPrefix + Buffer.from(backendToken).toString('base64url');

    await electronPage.evaluate(
      ({ port, protocol, publicProtocol, cluster, namespace }) =>
        new Promise<void>((resolve, reject) => {
          type WatchWindow = Window & {
            backendTokenWatch?: Promise<string>;
            backendTokenWatchSocket?: WebSocket;
          };
          const watchWindow = window as WatchWindow;
          const socket = new WebSocket(`ws://localhost:${port}/wsMultiplexer`, [
            publicProtocol,
            protocol,
          ]);
          watchWindow.backendTokenWatchSocket = socket;

          let resolveWatch: (data: string) => void = () => {};
          let rejectWatch: (error: Error) => void = () => {};
          watchWindow.backendTokenWatch = new Promise<string>((watchResolve, watchReject) => {
            resolveWatch = watchResolve;
            rejectWatch = watchReject;
          });

          const timeout = window.setTimeout(() => {
            const error = new Error('Timed out waiting for a multiplexer watch update');
            rejectWatch(error);
            reject(error);
            socket.close();
          }, 30000);

          socket.addEventListener('open', () => {
            socket.send(
              JSON.stringify({
                clusterId: cluster,
                path: '/api/v1/namespaces',
                query: 'watch=1',
                userId: 'desktop-e2e',
                type: 'REQUEST',
              })
            );
          });
          socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data));
            if (message.type === 'ERROR') {
              const error = new Error(message.data || 'Multiplexer returned an error');
              window.clearTimeout(timeout);
              rejectWatch(error);
              reject(error);
              socket.close();
              return;
            }
            if (message.type === 'STATUS' && JSON.parse(message.data).state === 'connected') {
              resolve();
              return;
            }
            if (message.type === 'DATA') {
              const data = message.binary ? atob(message.data) : message.data;
              if (data.includes(namespace)) {
                window.clearTimeout(timeout);
                resolveWatch(data);
              }
            }
          });
          socket.addEventListener('error', () => {
            const error = new Error('Multiplexer WebSocket failed');
            window.clearTimeout(timeout);
            rejectWatch(error);
            reject(error);
          });
        }),
      {
        port: backendPort,
        protocol: backendProtocol,
        publicProtocol: multiplexerProtocol,
        cluster: clusterName,
        namespace: watchNamespace,
      }
    );

    run('kubectl', ['--kubeconfig', appKubeconfig, 'create', 'namespace', watchNamespace]);
    const watchData = await electronPage.evaluate(
      () =>
        (
          window as Window & {
            backendTokenWatch?: Promise<string>;
          }
        ).backendTokenWatch
    );

    expect(watchData).toContain(watchNamespace);
    await electronPage.evaluate(() => {
      (
        window as Window & {
          backendTokenWatchSocket?: WebSocket;
        }
      ).backendTokenWatchSocket?.close();
    });
  });
});
