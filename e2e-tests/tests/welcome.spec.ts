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

// The shared config dismisses the Welcome dialog; start from a fresh profile instead.
test.use({ storageState: { cookies: [], origins: [] } });

test('shows the Welcome dialog on first use and remembers "Don\'t show again"', async ({
  page,
}) => {
  await page.goto('/');

  const welcome = page.getByRole('dialog', { name: 'Welcome to Headlamp' });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('heading', { name: 'Quick start' })).toBeVisible();

  await welcome.getByRole('checkbox', { name: "Don't show again" }).check();
  await welcome.getByRole('button', { name: 'Close' }).click();

  await expect(welcome).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('headlamp.welcome.dismissed'))).toBe(
    'true'
  );
});
