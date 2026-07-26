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

import { test } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron, Page } from 'playwright';
import { HeadlampPage } from './headlampPage';
import { NamespacesPage } from './namespacesPage';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);

// Run against a throwaway copy of the kubeconfig so the developer's real one is
// never modified by anything the app persists, and the suite stays repeatable.
const ISOLATED_KUBECONFIG = path.join(
  os.tmpdir(),
  `headlamp-e2e-namespaces-${process.pid}.kubeconfig`
);

const electron = _electron;
const appPath = path.resolve(__dirname, '../../');
let electronApp;
let electronPage: Page;

if (process.env.PLAYWRIGHT_TEST_MODE === 'app') {
  test.beforeAll(async () => {
    fs.writeFileSync(
      ISOLATED_KUBECONFIG,
      execSync('kubectl --context minikube config view --minify --raw --flatten', {
        encoding: 'utf8',
      }),
      { mode: 0o600 }
    );

    electronApp = await electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
        KUBECONFIG: ISOLATED_KUBECONFIG,
      },
    });

    electronPage = await electronApp.firstWindow();
  });

  // The app holds a single-instance lock, so it must be closed or a later
  // launch in the same run is denied the lock and quits immediately.
  test.afterAll(async () => {
    await electronApp?.close();
    fs.rmSync(ISOLATED_KUBECONFIG, { force: true });
  });

  test.beforeEach(async ({ page }) => {
    if (process.env.PLAYWRIGHT_TEST_MODE === 'app') {
      await page.close();
    }
  });
}

// note: this test is for local app development testing and will require:
// - a running minikube cluster named 'minikube'
// - an ENV variable of PLAYWRIGHT_TEST_MODE=app
test.describe('create a namespace with the minimal editor', async () => {
  // A real timeout, so a failure surfaces as a failure rather than hanging forever.
  test.setTimeout(3 * 60 * 1000);
  test('create a namespace with the minimal editor then delete it', async ({
    page: browserPage,
  }) => {
    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
    const name = 'testing-e2e';
    const headlampPage = new HeadlampPage(page);
    const namespacesPage = new NamespacesPage(page);

    await headlampPage.authenticate();

    await namespacesPage.navigateToNamespaces();
    await namespacesPage.createNamespace(name);
    await namespacesPage.deleteNamespace(name);
  });
});
