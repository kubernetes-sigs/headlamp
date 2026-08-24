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
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron, ElectronApplication, Page } from 'playwright';

/** Result recorded by the cluster provider package plugin. */
interface ClusterProviderTestResult {
  /** Whether the package plugin source started executing. */
  loaded?: boolean;
  /** Type of the cluster provider wrapper injected for the plugin. */
  invokeType?: string;
  /** Result returned by the declared provider. */
  allowed?: unknown;
  /** Unexpected error returned for the declared provider. */
  allowedError?: string;
  /** Error returned for an undeclared provider. */
  denied?: string;
}

/** Renderer fields recorded by the cluster provider package plugin. */
type ClusterProviderTestWindow = Window & {
  /** Results from the provider authorization checks. */
  clusterProviderTestResult?: ClusterProviderTestResult;
};

const appPath = path.resolve(__dirname, '../../');
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const electronDistPath = path.join(appPath, 'node_modules', 'electron', 'dist');
const electronResourcesPath =
  process.platform === 'darwin'
    ? path.join(electronDistPath, 'Electron.app', 'Contents', 'Resources')
    : path.join(electronDistPath, 'resources');
const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;
const pluginName = 'cluster-provider-capabilities-e2e';
const providerName = 'e2e.cluster';

let electronApp: ElectronApplication;
let electronPage: Page;
let pluginPath: string;
let userDataPath: string;

test.describe('package cluster provider capabilities', () => {
  test.setTimeout(2 * 60 * 1000);

  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'This test only runs in app mode');
  });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(2 * 60 * 1000);

    if (process.env.PLAYWRIGHT_TEST_MODE !== 'app') {
      return;
    }

    pluginPath = path.join(electronResourcesPath, '.plugins', pluginName);
    fs.mkdirSync(pluginPath, { recursive: true });
    fs.writeFileSync(
      path.join(pluginPath, 'main.js'),
      `window.clusterProviderTestResult = {
        loaded: true,
        invokeType: typeof clusterProviderInvoke,
      };
      const record = result => Object.assign(window.clusterProviderTestResult, result);
      clusterProviderInvoke('${providerName}', { cluster: 'demo' }).then(
        allowed => record({ allowed }),
        error => record({ allowedError: error.message })
      );
      clusterProviderInvoke('undeclared.cluster', {}).then(
        () => record({ denied: 'unexpected success' }),
        error => record({ denied: error.message })
      );`
    );
    fs.writeFileSync(
      path.join(pluginPath, 'package.json'),
      JSON.stringify({
        name: pluginName,
        version: '1.0.0',
        description: 'Cluster provider capability e2e fixture',
        homepage: 'https://example.com/cluster-provider-capabilities-e2e',
        isManagedByHeadlampPlugin: true,
        artifacthub: {
          title: 'Cluster provider capability e2e fixture',
          url: 'https://example.com/cluster-provider-capabilities-e2e',
          repoName: 'e2e',
          author: 'Headlamp',
          version: '1.0.0',
        },
        devDependencies: {
          '@kinvolk/headlamp-plugin': '^0.8.0',
        },
        headlamp: {
          clusterProviders: [providerName],
        },
      })
    );

    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-cluster-provider-e2e-'));
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--user-data-dir=${userDataPath}`],
      env: {
        ...electronEnv,
        ELECTRON_DEV: 'true',
        NODE_ENV: 'development',
      },
    });
    await electronApp.evaluate(
      ({ app }, { mainPath, provider }) => {
        const requireFromApp = process.getBuiltinModule('module').createRequire(app.getAppPath());
        const main = requireFromApp(mainPath) as {
          registerClusterProvider: (
            providerName: string,
            handler: (request: Record<string, unknown>) => unknown
          ) => () => void;
        };
        main.registerClusterProvider(provider, request => ({ provider, request }));
      },
      {
        mainPath: path.join(appPath, 'build', 'main.js'),
        provider: providerName,
      }
    );
    electronPage = await electronApp.firstWindow();
    await electronPage.reload();
  });

  test.afterAll(async () => {
    await electronApp?.close();
    if (pluginPath) {
      fs.rmSync(pluginPath, { force: true, recursive: true });
    }
    if (userDataPath) {
      fs.rmSync(userDataPath, { force: true, recursive: true });
    }
  });

  test('invokes only providers declared by the package plugin', async () => {
    await electronPage.waitForLoadState('load');
    const baseUrl = electronPage.url().split('#')[0];
    await electronPage.goto(`${baseUrl}#/settings/plugins`);

    const pluginRow = electronPage.getByRole('row').filter({ hasText: pluginName });
    await expect(pluginRow.getByRole('checkbox')).toBeChecked();
    await expect
      .poll(() =>
        electronPage.evaluate(
          () => (window as unknown as ClusterProviderTestWindow).clusterProviderTestResult
        )
      )
      .toEqual({
        loaded: true,
        invokeType: 'function',
        allowed: {
          provider: providerName,
          request: { cluster: 'demo' },
        },
        denied: "Cluster provider is outside the plugin's declared scope: undeclared.cluster",
      });
  });
});
