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
import { _electron } from 'playwright';

// Electron setup
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

test.describe('App startup performance', () => {
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'These tests only run in app mode');
  });

  test('app should load within 30 seconds', async () => {
    const startTime = Date.now();
    let electronApp;

    try {
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

      const page = await electronApp.firstWindow();

      // Wait for the page to finish loading
      await page.waitForLoadState('load');

      // Wait until meaningful content is rendered:
      // Either the cluster select page, a cluster view, or the authentication page.
      // Use a 28s locator timeout so that scheduling/expect overhead after the
      // await doesn't push loadTime past the 30s assertion threshold.
      await expect(
        page.locator('h1, a[href*="/c/"], button:has-text("Authenticate")').first()
      ).toBeVisible({ timeout: 28000 });

      const loadTime = Date.now() - startTime;
      console.log(`App loaded in ${loadTime}ms`);

      // Assert startup was within 30 seconds
      expect(loadTime).toBeLessThan(30000);
    } finally {
      if (electronApp) {
        await electronApp.close();
      }
    }
  });
});
