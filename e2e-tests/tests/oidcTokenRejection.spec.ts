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

const CLUSTER_NAME = 'test';
const AUTH_PROBE_URL = `**/clusters/${CLUSTER_NAME}/apis/authorization.k8s.io/v1/selfsubjectrulesreviews`;

/**
 * Model the point where the identity provider accepted the sign-in, but the
 * Kubernetes API rejects the returned token. Headlamp should remember that the
 * OIDC callback completed, return to the login dialog after the 403 auth probe,
 * and explain the cluster-side rejection instead of starting another login loop.
 */
test('shows an error when the API server rejects an OIDC token', async ({ page }) => {
  let authProbeCount = 0;

  await page.route('**/config', route =>
    route.fulfill({
      json: {
        clusters: [{ name: CLUSTER_NAME, auth_type: 'oidc' }],
      },
    })
  );
  await page.route('**/plugins', route => route.fulfill({ json: [] }));

  await page.route(AUTH_PROBE_URL, async route => {
    authProbeCount++;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      json: {
        apiVersion: 'v1',
        kind: 'Status',
        status: 'Failure',
        message: 'The API server rejected the OIDC token',
        reason: 'Forbidden',
        code: 403,
      },
    });
  });

  // The popup is a separate same-origin page because the parent OauthPopup
  // listens for the browser storage event emitted by the callback window.
  await page.context().route(/\/oidc\?.*/, route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>OIDC callback</title>',
    })
  );

  await page.goto('/');
  await page.evaluate(clusterName => {
    window.history.pushState({}, '', `/c/${clusterName}/login`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, CLUSTER_NAME);
  await expect(page.getByRole('heading', { level: 1, name: 'Authentication' })).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ]);
  await popup.waitForLoadState();
  await expect(popup).toHaveTitle('OIDC callback');
  await popup.evaluate(() => localStorage.setItem('auth_status', 'success'));

  await expect
    .poll(() =>
      page.evaluate(
        clusterName => sessionStorage.getItem(`oidc-login-attempted.${clusterName}`),
        CLUSTER_NAME
      )
    )
    .toBe('true');
  await expect(page).toHaveURL(new RegExp(`/c/${CLUSTER_NAME}/login$`));
  await expect(
    page.getByText(
      /The cluster did not accept your sign-in\. Its API server may not trust this OIDC provider/
    )
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use A Token' })).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(true);
  // A single probe confirms the 403 was handled without retrying auth in a loop.
  expect(authProbeCount).toBe(1);
});
