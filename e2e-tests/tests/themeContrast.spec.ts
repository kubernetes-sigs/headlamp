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

test.use({ locale: 'en-US' });

test('registered default theme is selected on first use', async ({ page }) => {
  let markPluginRequested!: () => void;
  const pluginRequested = new Promise<void>(resolve => {
    markPluginRequested = resolve;
  });
  let releasePlugin!: () => void;
  const pluginCanLoad = new Promise<void>(resolve => {
    releasePlugin = resolve;
  });

  await page.addInitScript(() => localStorage.removeItem('headlampThemePreference'));
  await page.route('**/plugins', route =>
    route.fulfill({
      json: [
        {
          path: 'plugins/e2e-default-theme',
          type: 'development',
          source: 'development',
          name: 'e2e-default-theme',
        },
      ],
    })
  );
  await page.route('**/plugins/e2e-default-theme/package.json', route =>
    route.fulfill({
      json: {
        name: 'e2e-default-theme',
        version: '1.0.0',
        description: 'Default theme startup test plugin',
        devDependencies: { '@kinvolk/headlamp-plugin': '^0.10.0' },
      },
    })
  );
  await page.route('**/plugins/e2e-default-theme/main.js', async route => {
    markPluginRequested();
    await pluginCanLoad;
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.pluginLib.registerAppTheme(
        {
          name: 'E2E Default Theme',
          base: 'light',
          primary: '#414141',
          secondary: '#eff2f5',
        },
        { default: true }
      );`,
    });
  });

  await page.goto('/settings/general');
  await pluginRequested;
  await expect(page.getByRole('button', { name: 'Light', exact: true })).not.toBeVisible();
  releasePlugin();

  const defaultTheme = page.getByRole('button', { name: 'E2E Default Theme' });
  await expect(defaultTheme).toHaveCSS('border-top-width', '2px');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('headlampThemePreference')))
    .toBe('E2E Default Theme');
});

test('secondary button uses contrasting theme colors', async ({ page }) => {
  await page.goto('/settings/general');
  await page.evaluate(() => {
    (window as any).pluginLib.registerAppTheme({
      name: 'E2E Secondary Contrast',
      base: 'light',
      primary: '#414141',
      secondary: '#eff2f5',
      secondaryContrastText: '#44444f',
    });
  });

  await page.getByRole('button', { name: 'E2E Secondary Contrast' }).click();
  await page.evaluate(() => {
    history.pushState({}, '', '/settings/cluster?c=test');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.locator('#color-picker-button').click();

  const cancelButton = page.getByRole('button', { name: 'Cancel' });
  await expect(cancelButton).toHaveCSS('background-color', 'rgb(239, 242, 245)');
  await expect(cancelButton).toHaveCSS('color', 'rgb(68, 68, 79)');
});
