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
import path from 'path';
import { _electron, Page } from 'playwright';
import { HeadlampPage } from './headlampPage';
import { NamespacesPage } from './namespacesPage';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);

const electron = _electron;
const appPath = path.resolve(__dirname, '../../');
let electronApp;
let electronPage: Page;

if (process.env.PLAYWRIGHT_TEST_MODE === 'app') {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
      },
    });

    electronPage = await electronApp.firstWindow();
  });

  test.beforeEach(async ({ page }) => {
    if (process.env.PLAYWRIGHT_TEST_MODE === 'app') {
      page.close();
    }
  });
}

// note: this test is for local app development testing and will require:
// - a running minikube cluster named 'minikube'
// - an ENV variable of PLAYWRIGHT_TEST_MODE=app
test.describe('create a namespace with the minimal editor', async () => {
  test.setTimeout(0);
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
