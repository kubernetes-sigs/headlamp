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

test('changes the application locale and text direction from general settings', async ({
  page,
}) => {
  await page.route('**/config', route => route.fulfill({ json: { clusters: [] } }));
  await page.route('**/plugins', route => route.fulfill({ json: [] }));
  await page.goto('/settings/general');

  // The select's accessible name is translated, so find it by position once the locale changes.
  const localeSelect = page.getByRole('main').getByRole('combobox').first();
  await expect(localeSelect).toHaveAccessibleName('Select locale');
  await localeSelect.click();
  await page.getByRole('option', { name: 'Čeština' }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await localeSelect.click();
  await page.getByRole('option', { name: 'العربية' }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toHaveAttribute('dir', 'rtl');
});
