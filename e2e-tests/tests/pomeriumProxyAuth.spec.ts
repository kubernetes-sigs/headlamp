/*
 * Copyright 2026 The Kubernetes Authors.
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

const enabled = process.env.HEADLAMP_POMERIUM_E2E === 'true';
const baseURL = process.env.HEADLAMP_TEST_URL || '';
const expectedEmail = 'headlamp-e2e@example.com';

test.describe('Pomerium proxy authentication', () => {
  test.skip(!enabled, 'HEADLAMP_POMERIUM_E2E is not set');

  test('authenticates the user and protects the identity header', async ({
    page,
    request,
  }, testInfo) => {
    const unauthenticated = await request.get(`${baseURL}/c/main`, {
      headers: {
        'X-Pomerium-Claim-Email': 'attacker@example.com',
      },
      maxRedirects: 0,
    });

    expect([302, 303]).toContain(unauthenticated.status());
    expect(unauthenticated.headers().location).toContain('authenticate.localhost.pomerium.io');

    await page.goto('/c/main');
    await expect(page).toHaveURL(/dex\.headlamp-pomerium-e2e\.svc\.cluster\.local/);
    await page.locator('input[name="login"]').fill(expectedEmail);
    await page.locator('input[name="password"]').fill('headlamp-e2e-password');
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/headlamp\.localhost\.pomerium\.io:8443\/c\/main/);
    await expect(page.getByPlaceholder(/^Search$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Authentication' })).toHaveCount(0);

    const me = await page.context().request.get(`${baseURL}/clusters/main/me`, {
      headers: {
        'X-Pomerium-Claim-Email': 'attacker@example.com',
      },
    });
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      username: expectedEmail,
      email: expectedEmail,
    });

    const namespaces = await page
      .context()
      .request.get(`${baseURL}/clusters/main/api/v1/namespaces`);
    expect(namespaces.status()).toBe(200);
    expect((await namespaces.json()).items).toEqual(expect.any(Array));

    const createNamespace = await page
      .context()
      .request.post(`${baseURL}/clusters/main/api/v1/namespaces?dryRun=All`, {
        data: {
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: {
            name: 'pomerium-e2e-write-check',
          },
        },
      });
    expect(createNamespace.status()).toBe(403);

    await page.goto('/c/main/namespaces');
    await expect(page.getByRole('link', { name: 'kube-system' })).toBeVisible();

    await page.locator('button[aria-controls="primary-user-menu"]').click();
    await expect(page.getByText(expectedEmail)).toBeVisible();

    const screenshot =
      process.env.HEADLAMP_POMERIUM_SCREENSHOT || testInfo.outputPath('pomerium-headlamp.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach('Pomerium-authenticated Headlamp', {
      path: screenshot,
      contentType: 'image/png',
    });
  });
});
