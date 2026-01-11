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

// Helper functions
async function navigateToSettings(page: Page) {
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForLoadState('load');
}

async function scrollToPRBuildsSection(page: Page) {
  // Scroll to the bottom of settings page where PR Builds section is located
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500); // Wait for scroll to complete
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
      HEADLAMP_ENABLE_APP_DEV_BUILDS: 'true', // Enable PR builds feature
    },
  });

  electronPage = await electronApp.firstWindow();
});

test.beforeEach(async ({ page }) => {
  page.close();
});

test.afterAll(async () => {
  await electronApp.close();
});

// Tests
test.describe('PR Builds functionality', () => {
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'These tests only run in app mode');
  });

  test('should display PR Builds section in settings when feature is enabled', async ({
    page: browserPage,
  }) => {
    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await navigateToSettings(page);
    await expect(page.locator('h2')).toContainText('General');

    // Scroll to PR Builds section
    await scrollToPRBuildsSection(page);

    // Check that PR Builds section is visible
    await expect(page.getByText('Development Builds from PRs')).toBeVisible();

    // Check accessibility
    const accessibilityScanResults = await page.accessibility.snapshot();
    expect(accessibilityScanResults).toBeTruthy();
  });

  test('should be able to refresh PR list', async ({ page: browserPage }) => {
    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await navigateToSettings(page);
    await scrollToPRBuildsSection(page);

    // Wait for PR Builds section to be visible
    await expect(page.getByText('Development Builds from PRs')).toBeVisible();

    // Find and click the Refresh PR List button
    const refreshButton = page.getByRole('button', { name: 'Refresh PR List' });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();

    // Wait for the request to complete (should show either PRs or an error message)
    await page.waitForTimeout(2000);

    // Check if either the list loaded or an error message is shown
    // The API might be rate-limited or fail in test environment, so we just verify the button worked
    const hasContent =
      (await page.locator('text=No PRs with available builds found').isVisible()) ||
      (await page.locator('text=PR #').isVisible()) ||
      (await page.locator('text=Error loading PRs').isVisible()) ||
      (await page.locator('text=Failed to fetch PRs').isVisible());

    expect(hasContent).toBeTruthy();
  });

  test('should display warning message about PR builds', async ({ page: browserPage }) => {
    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await navigateToSettings(page);
    await scrollToPRBuildsSection(page);

    // Check for warning message
    await expect(page.getByText('Development Builds from PRs')).toBeVisible();
    await expect(
      page.getByText(/Development builds are for testing purposes only/i)
    ).toBeVisible();
  });

  test('should show active PR build status if one is activated', async ({
    page: browserPage,
  }) => {
    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await navigateToSettings(page);
    await scrollToPRBuildsSection(page);

    // Check for either "No PR build currently active" or active PR details
    const hasStatus =
      (await page.getByText('No PR build currently active').isVisible()) ||
      (await page.getByText('Currently using PR build').isVisible());

    expect(hasStatus).toBeTruthy();
  });

  test('should have Clear PR Build button when PR build is active', async ({
    page: browserPage,
  }) => {
    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await navigateToSettings(page);
    await scrollToPRBuildsSection(page);

    // Check if there's an active PR build
    const hasActivePR = await page.getByText('Currently using PR build').isVisible();

    if (hasActivePR) {
      // If there's an active PR, the Clear button should be visible
      const clearButton = page.getByRole('button', { name: 'Clear PR Build' });
      await expect(clearButton).toBeVisible();
    } else {
      // If no active PR, the message should be visible
      await expect(page.getByText('No PR build currently active')).toBeVisible();
    }
  });
});

test.describe('PR Builds feature disabled', () => {
  let disabledElectronApp;
  let disabledElectronPage: Page;

  test.beforeAll(async () => {
    disabledElectronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
        HEADLAMP_ENABLE_APP_DEV_BUILDS: 'false', // Disable PR builds feature
      },
    });

    disabledElectronPage = await disabledElectronApp.firstWindow();
  });

  test.beforeEach(({ page }) => {
    page.close();
  });

  test.afterAll(async () => {
    await disabledElectronApp.close();
  });

  test('should not display PR Builds section when feature is disabled', async ({
    page: browserPage,
  }) => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'These tests only run in app mode');

    const page = process.env.PLAYWRIGHT_TEST_MODE === 'app' ? disabledElectronPage : browserPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await navigateToSettings(page);
    await scrollToPRBuildsSection(page);

    // PR Builds section should NOT be visible when disabled
    await expect(page.getByText('Development Builds from PRs')).not.toBeVisible();
  });
});
