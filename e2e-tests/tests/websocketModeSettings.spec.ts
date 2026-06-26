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

import { expect, Page, test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';

let headlampPage: HeadlampPage;

/** MUI Select is a combobox, not a native <select>. Open it and click the option. */
async function selectWebsocketMode(page: Page, optionText: string) {
  await page.getByRole('combobox', { name: 'WebSocket mode' }).click();
  await page.getByRole('option', { name: optionText }).click();
}

/** Returns the visible text of the WebSocket mode combobox. */
async function getWebsocketModeText(page: Page): Promise<string> {
  return (await page.getByRole('combobox', { name: 'WebSocket mode' }).textContent()) ?? '';
}

/** Returns the websocketModeUserOverride stored in localStorage. */
async function getStoredMode(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('settings') || '{}');
    return settings.websocketModeUserOverride as string | undefined;
  });
}

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
});

test.afterEach(async ({ page }) => {
  // Reset the override so tests are independent
  await page.evaluate(() => {
    const stored = localStorage.getItem('settings');
    if (stored) {
      const settings = JSON.parse(stored);
      delete settings.websocketModeUserOverride;
      localStorage.setItem('settings', JSON.stringify(settings));
    }
  });
});

test('general settings page shows WebSocket mode selector', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await expect(page.getByRole('combobox', { name: 'WebSocket mode' })).toBeVisible();
});

test('WebSocket mode selector defaults to "Default" option', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  const text = await getWebsocketModeText(page);
  expect(text).toContain('Default');
});

test('WebSocket mode selection is saved to localStorage', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await selectWebsocketMode(page, 'Off (disable real-time updates)');
  expect(await getStoredMode(page)).toBe('off');
});

test('WebSocket mode selection persists after page reload', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await selectWebsocketMode(page, 'Multiplexer (experimental, improved performance)');

  await page.reload({ waitUntil: 'networkidle' });
  await headlampPage.navigateTopage('/settings/general', /Settings/);

  const text = await getWebsocketModeText(page);
  expect(text).toContain('Multiplexer');
});

test('WebSocket mode can be reset to default', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);

  await selectWebsocketMode(page, 'Off (disable real-time updates)');
  await selectWebsocketMode(page, 'Default (use environment / server setting)');

  const text = await getWebsocketModeText(page);
  expect(text).toContain('Default');
  expect(await getStoredMode(page)).toBe('auto');
});
