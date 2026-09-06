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
