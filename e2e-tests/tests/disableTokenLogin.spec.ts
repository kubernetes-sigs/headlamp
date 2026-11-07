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

import { expect, Page, test } from '@playwright/test';

const OIDC_CLUSTER_NAME = 'test-oidc-cluster';

async function mockOidcClusterConfig(page: Page, disableTokenLogin: boolean) {
  await page.route('**/config', route =>
    route.fulfill({
      json: {
        oidcAutoLogin: false,
        disableTokenLogin,
        clusters: [{ name: OIDC_CLUSTER_NAME, auth_type: 'oidc' }],
      },
    })
  );
  await page.route('**/plugins', route => route.fulfill({ json: [] }));
}

test.describe('Disable token login for OIDC clusters', () => {
  test('backend /config endpoint includes disableTokenLogin setting', async ({ request }) => {
    const response = await request.get('/config');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('disableTokenLogin');
  });

  test('hides "Use A Token" on an OIDC cluster when token login is disabled', async ({ page }) => {
    await mockOidcClusterConfig(page, true);

    await page.goto(`/c/${OIDC_CLUSTER_NAME}/login`);

    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use A Token' })).toHaveCount(0);
  });

  test('shows "Use A Token" on an OIDC cluster when token login is not disabled', async ({
    page,
  }) => {
    await mockOidcClusterConfig(page, false);

    await page.goto(`/c/${OIDC_CLUSTER_NAME}/login`);

    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use A Token' })).toBeVisible();
  });
});
