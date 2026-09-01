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

const OIDC_CLUSTER_NAME = 'test-oidc-cluster';
const TOKEN_CLUSTER_NAME = 'test-token-cluster';

test.describe('OIDC autologin configuration and flow', () => {
  test('backend /config endpoint includes oidcAutoLogin setting', async ({ request }) => {
    const response = await request.get('/config');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('oidcAutoLogin');
  });

  test('does not auto-redirect when oidcAutoLogin is false or visiting a non-OIDC cluster', async ({
    page,
  }) => {
    await page.route('**/config', route =>
      route.fulfill({
        json: {
          oidcAutoLogin: false,
          clusters: [
            { name: OIDC_CLUSTER_NAME, auth_type: 'oidc' },
            { name: TOKEN_CLUSTER_NAME, auth_type: 'token' },
          ],
        },
      })
    );
    await page.route('**/plugins', route => route.fulfill({ json: [] }));

    await page.goto('/');
    await page.evaluate(clusterName => {
      window.history.pushState({}, '', `/c/${clusterName}/login`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, TOKEN_CLUSTER_NAME);

    await expect(page).toHaveURL(new RegExp(`/c/${TOKEN_CLUSTER_NAME}/login$`));

    await page.evaluate(clusterName => {
      window.history.pushState({}, '', `/c/${clusterName}/login`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, OIDC_CLUSTER_NAME);

    await expect(page).toHaveURL(new RegExp(`/c/${OIDC_CLUSTER_NAME}/login$`));
  });

  test('automatically redirects to /oidc when visiting an OIDC cluster with auto-login enabled and saves return URL', async ({
    page,
  }) => {
    let oidcRedirectUrl = '';

    await page.route('**/config', route =>
      route.fulfill({
        json: {
          oidcAutoLogin: true,
          clusters: [{ name: OIDC_CLUSTER_NAME, auth_type: 'oidc' }],
        },
      })
    );
    await page.route('**/plugins', route => route.fulfill({ json: [] }));
    await page.route(`**/clusters/${OIDC_CLUSTER_NAME}/**`, route =>
      route.fulfill({ status: 401, json: { message: 'Unauthorized' } })
    );
    await page.route(/\/oidc\?.*/, route => {
      oidcRedirectUrl = route.request().url();
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>OIDC Login</title>',
      });
    });

    await page.goto('/');
    const targetPath = `/c/${OIDC_CLUSTER_NAME}/pods`;
    await page.evaluate(path => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, targetPath);

    await expect
      .poll(() => oidcRedirectUrl)
      .toContain(`cluster=${encodeURIComponent(OIDC_CLUSTER_NAME)}`);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('oidc_return_url')))
      .toBe(targetPath);
  });

  test('full-page callback at /auth restores return URL and clears it from sessionStorage', async ({
    page,
  }) => {
    const returnPath = `/c/${OIDC_CLUSTER_NAME}/workloads`;

    await page.route('**/config', route =>
      route.fulfill({
        json: {
          oidcAutoLogin: true,
          clusters: [{ name: OIDC_CLUSTER_NAME, auth_type: 'oidc' }],
        },
      })
    );
    await page.route('**/plugins', route => route.fulfill({ json: [] }));
    await page.route(new RegExp(`/clusters/${OIDC_CLUSTER_NAME}`), route =>
      route.fulfill({ json: {} })
    );

    await page.goto(`/c/${OIDC_CLUSTER_NAME}/login?logout=true`);
    await page.evaluate(returnUrl => {
      sessionStorage.setItem('oidc_return_url', returnUrl);
    }, returnPath);

    await page.goto(`/auth?cluster=${OIDC_CLUSTER_NAME}`);

    await expect(page).toHaveURL(new RegExp(`${returnPath}$`));
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('oidc_return_url')))
      .toBeNull();
  });

  test('does not trigger auto-login redirect when logout parameter is present', async ({
    page,
  }) => {
    let oidcRedirectUrl = '';

    await page.route('**/config', route =>
      route.fulfill({
        json: {
          oidcAutoLogin: true,
          clusters: [{ name: OIDC_CLUSTER_NAME, auth_type: 'oidc' }],
        },
      })
    );
    await page.route('**/plugins', route => route.fulfill({ json: [] }));
    await page.route(/\/oidc\?.*/, route => {
      oidcRedirectUrl = route.request().url();
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>OIDC Login</title>',
      });
    });

    await page.goto('/');
    await page.evaluate(clusterName => {
      window.history.pushState({}, '', `/c/${clusterName}/login?logout=true`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, OIDC_CLUSTER_NAME);

    await page.waitForTimeout(500);
    expect(oidcRedirectUrl).toBe('');
    await expect(page).toHaveURL(new RegExp(`/c/${OIDC_CLUSTER_NAME}/login\\?logout=true$`));
  });

  test('does not auto-login and displays rejected status when token is rejected', async ({
    page,
  }) => {
    let oidcRedirectUrl = '';

    await page.route('**/config', route =>
      route.fulfill({
        json: {
          oidcAutoLogin: true,
          clusters: [{ name: OIDC_CLUSTER_NAME, auth_type: 'oidc' }],
        },
      })
    );
    await page.route('**/plugins', route => route.fulfill({ json: [] }));
    await page.route(`**/clusters/${OIDC_CLUSTER_NAME}/**`, route =>
      route.fulfill({ status: 401, json: { message: 'Unauthorized' } })
    );
    await page.route(/\/oidc\?.*/, route => {
      oidcRedirectUrl = route.request().url();
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>OIDC Login</title>',
      });
    });

    await page.addInitScript(
      ({ clusterName }) => {
        sessionStorage.setItem(`oidc-login-attempted.${clusterName}`, 'true');
      },
      { clusterName: OIDC_CLUSTER_NAME }
    );

    await page.goto(`/c/${OIDC_CLUSTER_NAME}/login`);

    await page.waitForTimeout(500);
    expect(oidcRedirectUrl).toBe('');
    await expect(page).toHaveURL(new RegExp(`/c/${OIDC_CLUSTER_NAME}/login$`));
  });
});
