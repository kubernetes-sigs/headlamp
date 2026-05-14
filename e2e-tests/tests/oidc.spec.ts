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

/**
 * E2E coverage for the PR-1 OIDC consolidation work (#5401).
 *
 * These tests run against the OIDC reproduction harness in
 * tools/oidc-repro/. Bring the stack up first:
 *
 *   tools/oidc-repro/scripts/up.sh
 *
 * Then point the test runner at the harness:
 *
 *   HEADLAMP_TEST_URL=http://<NODE_IP>:30080 \
 *   HEADLAMP_OIDC_E2E=1 \
 *   HEADLAMP_OIDC_USER=alice@example.com \
 *   HEADLAMP_OIDC_PASSWORD=password \
 *   HEADLAMP_OIDC_CLUSTER=main \
 *   npx playwright test tests/oidc.spec.ts
 *
 * When HEADLAMP_OIDC_E2E is unset, the entire describe block is skipped,
 * so this file is safe to ship without breaking unconfigured CI.
 *
 * Multi-replica scenario: the up.sh harness already runs two replicas
 * behind an nginx round-robin, so the deep-link happy path implicitly
 * exercises the #4019 fix (the IdP redirect lands on whichever replica
 * the round-robin picks). For an explicit assertion, set
 * HEADLAMP_OIDC_MULTI_REPLICA=1; otherwise that subtest is skipped.
 */

import { expect, test } from '@playwright/test';

const oidcEnabled = !!process.env.HEADLAMP_OIDC_E2E;

const cluster = process.env.HEADLAMP_OIDC_CLUSTER || 'main';
const username = process.env.HEADLAMP_OIDC_USER || 'alice@example.com';
const password = process.env.HEADLAMP_OIDC_PASSWORD || 'password';

test.describe('OIDC login (PR-1 stages 1-7)', () => {
  test.skip(!oidcEnabled, 'set HEADLAMP_OIDC_E2E=1 with the tools/oidc-repro/ harness running');

  // Drive the Dex login form. Adjust selectors here only if Dex's stock
  // login page changes shape; everything else in this file is harness-
  // independent.
  async function loginViaDex(page: import('@playwright/test').Page) {
    // Dex's local-credentials connector page.
    await page.fill('input[name="login"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Some Dex deployments add an explicit consent step. Wait briefly
    // for the button to render and become interactive; if it never
    // appears, assume this Dex deployment doesn't have it and continue.
    const approve = page.getByRole('button', { name: /grant access/i });
    try {
      await approve.waitFor({ state: 'visible', timeout: 2000 });
      await approve.click();
    } catch {
      // No consent step on this Dex install. Proceed.
    }
  }

  test('deep-link → IdP → original URL (popup mode happy path)', async ({ page }) => {
    const target = `/c/${cluster}/pods?ns=default`;

    // Hitting the protected URL bounces the user through AuthChooser →
    // /oidc → IdP → /oidc-callback → /auth?returnTo=… → target.
    await page.goto(target);

    // Wait for the AuthChooser dialog and click "Sign In" (popup mode).
    await page.click('button:has-text("Sign In")');

    // Playwright lets us drive a popup window when the click opens one.
    // Some flows do a same-tab redirect instead of a popup; handle both.
    const popupPromise = page.waitForEvent('popup').catch(() => null);
    const popup = await popupPromise;

    const oidcPage = popup ?? page;

    // Drive Dex.
    await loginViaDex(oidcPage);

    // We end up back on the original deep-link.
    await expect(page).toHaveURL(new RegExp(`${cluster}/pods`), { timeout: 30_000 });
  });

  test('deep-link with reload between AuthChooser and IdP return → original URL', async ({
    page,
  }) => {
    const target = `/c/${cluster}/deployments`;

    await page.goto(target);

    // Reload before clicking Sign In. The returnTo encoded into the
    // /oidc URL must come from window.location now, not from the
    // (lost) location.state.from.
    await page.reload();

    await page.click('button:has-text("Sign In")');

    const popup = await page.waitForEvent('popup').catch(() => null);
    await loginViaDex(popup ?? page);

    await expect(page).toHaveURL(new RegExp(`${cluster}/deployments`), { timeout: 30_000 });
  });

  test('direct /oidc?…&mode=fullPage entry → original URL', async ({ page }) => {
    const returnTo = `/c/${cluster}/services`;
    const oidcUrl = `/oidc?cluster=${cluster}&mode=fullPage&returnTo=${encodeURIComponent(
      returnTo
    )}`;

    await page.goto(oidcUrl);

    // mode=fullPage means the server redirects directly to the IdP
    // without going through AuthChooser; we land on the Dex login page.
    await loginViaDex(page);

    // /oidc-callback in fullPage mode redirects directly to returnTo
    // (no /auth bounce).
    await expect(page).toHaveURL(new RegExp(`${cluster}/services`), { timeout: 30_000 });
  });

  test('stale state on /oidc-callback → HTML error page', async ({ page }) => {
    // Hit /oidc-callback with garbage state. Browser Accept: text/html
    // triggers the stage-5 HTML error page rather than the JSON 400.
    const resp = await page.goto('/oidc-callback?state=bogus&code=fake');

    expect(resp?.status()).toBe(400);

    // The page should contain the friendly message and a link back to
    // Headlamp, NOT a raw JSON or plain-text error.
    await expect(page.locator('text=sign-in', { hasText: /sign-in/i })).toBeVisible();
    await expect(page.locator('a:has-text("Return to Headlamp")')).toBeVisible();
  });

  test('multi-replica deep-link → original URL (round-robin proxy)', async ({ page }) => {
    test.skip(
      !process.env.HEADLAMP_OIDC_MULTI_REPLICA,
      'set HEADLAMP_OIDC_MULTI_REPLICA=1 to exercise the #4019 fix end-to-end via the harness'
    );

    // The harness already runs two replicas behind an nginx round-robin;
    // success here proves /oidc on replica A and /oidc-callback on
    // replica B with a shared signing key works end-to-end. The
    // expected outcome is identical to the popup happy path; the value
    // of asserting it as its own test is documenting the #4019 fix.
    const target = `/c/${cluster}/pods?ns=kube-system`;

    await page.goto(target);
    await page.click('button:has-text("Sign In")');

    const popup = await page.waitForEvent('popup').catch(() => null);
    await loginViaDex(popup ?? page);

    await expect(page).toHaveURL(new RegExp(`${cluster}/pods`), { timeout: 30_000 });
  });
});
