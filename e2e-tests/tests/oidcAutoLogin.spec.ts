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

test.describe('OIDC autologin configuration', () => {
  test('backend /config endpoint includes oidcAutoLogin setting', async ({ request }) => {
    const response = await request.get('/config');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('oidcAutoLogin');
  });

  test('does not auto-redirect when visiting non-OIDC cluster', async ({ page }) => {
    await page.goto('/c/main');
    await expect(page).toHaveURL(/.*\/c\/main/);
  });
});
