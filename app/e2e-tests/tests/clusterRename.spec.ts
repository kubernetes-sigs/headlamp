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
import path from 'path';
import { _electron, Page } from 'playwright';
import { HeadlampPage } from './headlampPage';

// Electron setup
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');
let electronApp;
let electronPage: Page;

// Test configuration
const TEST_CONFIG = {
  originalName: 'minikube',
  newName: 'test-cluster',
  cancelledName: 'cancelled-cluster',
  invalidName: 'Invalid Cluster!',
};

// Helper functions
async function navigateToSettings(page: Page) {
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForLoadState('load');
}

async function verifyClusterName(page: Page, expectedName: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('a[href="#/settings/cluster"]').click();
  // Check the cluster name in the cluster selector combobox
  await expect(page.locator(`input[placeholder="${expectedName}"]`)).toBeVisible();
}

async function renameCluster(
  page: Page,
  fromName: string,
  toName: string,
  confirm: boolean = true
) {
  await page.fill(`input[placeholder="${fromName}"]`, toName);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: confirm ? 'Yes' : 'No' }).click();
  await page.waitForLoadState('load');
  await page.locator(`a[href="#/c/${toName}/"]`).click();
}

// Setup
test.beforeAll(async () => {
  electronApp = await _electron.launch({
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
  page.close();
});

// Tests
test.describe('Cluster rename functionality', () => {
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'These tests only run in app mode');
  });

  test('should rename cluster and verify changes', async ({ page: browserPage }) => {
    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await navigateToSettings(page);
    await expect(page.locator('h2')).toContainText('Cluster Settings');

    // Test invalid inputs
    await page.fill('input[placeholder="minikube"]', TEST_CONFIG.invalidName);
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await page.fill('input[placeholder="minikube"]', '');
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

    // Test successful rename
    await renameCluster(page, TEST_CONFIG.originalName, TEST_CONFIG.newName);
    await verifyClusterName(page, TEST_CONFIG.newName);
  });
});
