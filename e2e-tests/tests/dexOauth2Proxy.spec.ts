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

/// <reference types="node" />
/**
 * End-to-end test for the Headlamp + OAuth2-Proxy + Dex tutorial.
 *
 * This whole spec file is opt-in: it is skipped unless the environment
 * variable `HEADLAMP_TEST_DEX_OAUTH2_PROXY` is set to a truthy value
 * (`1`, `true`, `yes`). It is opt-in because it depends on a real local
 * stack (Minikube + Dex + Headlamp + OAuth2-Proxy) that takes minutes
 * to bring up, not something we want to run as part of the regular
 * e2e suite.
 *
 * Two modes are supported:
 *
 *  1. **Bring-up + tear-down by this test (recommended):**
 *     set `HEADLAMP_TEST_DEX_OAUTH2_PROXY_MANAGE=1`. The test will
 *     invoke `docs/installation/in-cluster/dex/test-scripts/run.sh`
 *     in `beforeAll` and `cleanup.sh` in `afterAll`. This is the
 *     mode the user asked for: "use these scripts to setup Dex and
 *     oauth2-proxy, and then run some e2e tests with playwright."
 *
 *  2. **Stack already running:** if `HEADLAMP_TEST_DEX_OAUTH2_PROXY_MANAGE`
 *     is not set, the test assumes the user has already run `run.sh`
 *     by hand (or in CI) and just exercises the resulting endpoint.
 *
 * The base URL of the OAuth2-Proxy front door (default
 * `http://localhost:8080`, matching what `run.sh` port-forwards) and
 * the Dex test credentials (default `admin@example.com` / `password`,
 * matching `dex-config.yaml`) can be overridden with the
 * `HEADLAMP_TEST_DEX_OAUTH2_PROXY_URL`, `HEADLAMP_TEST_DEX_USER` and
 * `HEADLAMP_TEST_DEX_PASSWORD` env vars.
 */

import { expect, Page, test } from '@playwright/test';
import { spawnSync } from 'child_process';
import * as path from 'path';

const ENABLED = ['1', 'true', 'yes'].includes(
  (process.env.HEADLAMP_TEST_DEX_OAUTH2_PROXY || '').toLowerCase()
);
const MANAGE_STACK = ['1', 'true', 'yes'].includes(
  (process.env.HEADLAMP_TEST_DEX_OAUTH2_PROXY_MANAGE || '').toLowerCase()
);

const BASE_URL = process.env.HEADLAMP_TEST_DEX_OAUTH2_PROXY_URL || 'http://localhost:8080';
const DEX_USER = process.env.HEADLAMP_TEST_DEX_USER || 'admin@example.com';
const DEX_PASSWORD = process.env.HEADLAMP_TEST_DEX_PASSWORD || 'password';

const SCRIPTS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'installation',
  'in-cluster',
  'dex',
  'test-scripts'
);

function runScript(script: string, timeoutMs: number) {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  // eslint-disable-next-line no-console
  console.log(`[dex-oauth2-proxy] running ${scriptPath}`);
  const result = spawnSync('bash', [scriptPath], {
    cwd: SCRIPTS_DIR,
    stdio: 'inherit',
    timeout: timeoutMs,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${script} exited with status ${result.status}` +
        (result.signal ? ` (signal ${result.signal})` : '')
    );
  }
}

/**
 * Drive the full OAuth2-Proxy → Dex → Headlamp sign-in flow:
 * click the OAuth2-Proxy sign-in splash, fill the Dex local-user form,
 * click through Dex's "Grant Access" consent page if shown, and wait
 * for the redirect back to OAuth2-Proxy / Headlamp. Used by every
 * test that needs an authenticated session.
 *
 * `user` / `password` default to the standard Dex test creds; tests
 * that exercise multi-user behavior pass an alternate user.
 */
async function signIn(page: Page, user: string = DEX_USER, password: string = DEX_PASSWORD) {
  // 1. Hit the OAuth2-Proxy front door.
  await page.goto(`${BASE_URL}/`);

  // 2. Click "Sign in with OpenID Connect" → redirected to Dex.
  await page.getByRole('button', { name: /sign in/i }).click();

  // 3. Dex local-login form.
  await page.waitForURL(/\/auth(\?|\/)/, { timeout: 30 * 1000 });
  await page.locator('input[name="login"], input[type="email"]').first().fill(user);
  await page.locator('input[name="password"], input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();

  // 3a. Dex may show a "Grant Access" consent page even with
  //     `oauth2.skipApprovalScreen: true` (e.g. on first login for a
  //     given client). Click through it if present; otherwise fall
  //     through to the OAuth2-Proxy callback.
  const grantAccess = page.getByRole('button', { name: /grant access/i });
  try {
    await grantAccess.waitFor({ state: 'visible', timeout: 10 * 1000 });
    await grantAccess.click();
  } catch {
    // No consent screen; Dex skipped it.
  }

  // 4. After the OIDC callback, OAuth2-Proxy forwards us back to Headlamp.
  await page.waitForURL(new RegExp(`^${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), {
    timeout: 60 * 1000,
  });
}

test.describe('Headlamp + OAuth2-Proxy + Dex (opt-in)', () => {
  test.skip(
    !ENABLED,
    'Set HEADLAMP_TEST_DEX_OAUTH2_PROXY=1 to enable the OAuth2-Proxy + Dex e2e test'
  );

  // The login flow has shared state (cookies, redirects through 3 services), so
  // the tests in this file run serially against a single stack.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (MANAGE_STACK) {
      // run.sh starts Minikube, applies RBAC, installs Helm charts, and
      // brings up the port-forward. It can take several minutes on a
      // cold machine.
      test.setTimeout(15 * 60 * 1000);
      runScript('run.sh', 15 * 60 * 1000);
    }
  });

  test.afterAll(async () => {
    test.setTimeout(5 * 60 * 1000);
    if (MANAGE_STACK) {
      try {
        runScript('cleanup.sh', 5 * 60 * 1000);
      } catch (err) {
        // Cleanup failures shouldn't fail the test run; just log them.
        // eslint-disable-next-line no-console
        console.warn(`[dex-oauth2-proxy] cleanup.sh failed:`, err);
      }
    }
  });

  test('unauthenticated visit redirects to OAuth2-Proxy sign-in page', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/`);
    expect(response, 'expected a response from oauth2-proxy').not.toBeNull();
    // OAuth2-Proxy serves its "Sign in with OpenID Connect" splash page
    // for unauthenticated requests.
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('unauthenticated deep-link to a Headlamp resource is gated by OAuth2-Proxy', async ({
    page,
  }) => {
    // Verifies the auth gate also covers sub-routes, not just `/`.
    // OAuth2-Proxy is configured with `pass_authorization_header = true`,
    // and `headlamp-values.yaml` mounts no static auth, so any route
    // under the proxy must redirect to `/oauth2/sign_in` when the
    // session cookie is missing.
    await page.goto(`${BASE_URL}/c/main/pods`);
    // OAuth2-Proxy renders the sign-in splash in-place (HTTP 403 + HTML body)
    // rather than issuing a redirect, so the URL bar may still read
    // `/c/main/pods`. The presence of the "Sign in" button is the gate proof
    // (Headlamp's authenticated UI does not render that button).
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('OAuth2-Proxy /ping is reachable without authentication', async ({ request }) => {
    // /ping is OAuth2-Proxy's built-in liveness endpoint and must not
    // require auth. Catches regressions where the auth gate is
    // accidentally widened to cover health endpoints.
    const response = await request.get(`${BASE_URL}/ping`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
  });

  test('invalid Dex credentials are rejected and keep us on Dex', async ({ page }) => {
    test.setTimeout(60 * 1000);
    await page.goto(`${BASE_URL}/`);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/auth(\?|\/)/, { timeout: 30 * 1000 });
    await page.locator('input[name="login"], input[type="email"]').first().fill(DEX_USER);
    await page
      .locator('input[name="password"], input[type="password"]')
      .first()
      .fill('definitely-not-the-password');
    await page.locator('button[type="submit"], input[type="submit"]').first().click();

    // Dex re-renders the local-login page with an inline error and
    // does *not* redirect back to OAuth2-Proxy / Headlamp. Assert both:
    // we're still on a Dex URL, and an "invalid …" error message is shown.
    // (Dex's exact wording is "Invalid Email Address and password".)
    await expect(page.getByText(/invalid.*password/i).first()).toBeVisible({
      timeout: 15 * 1000,
    });
    expect(page.url()).toMatch(/\/(auth|login)(\?|\/)/);
  });

  test('full sign-in flow lands on Headlamp Overview', async ({ page }) => {
    // Logging in via Dex (XHR redirects + cluster fetch on Headlamp) can
    // be slow under CI; give this test a generous timeout.
    test.setTimeout(2 * 60 * 1000);

    await signIn(page);

    // After the OIDC callback, OAuth2-Proxy forwards us to Headlamp.
    //    Headlamp's Overview shows the "Cluster" sidebar section.
    await expect(page.getByText(/cluster/i).first()).toBeVisible({ timeout: 60 * 1000 });
  });

  test('OAuth2-Proxy /oauth2/userinfo exposes the signed-in user after login', async ({ page }) => {
    test.setTimeout(2 * 60 * 1000);
    await signIn(page);

    // Reuse the browser context's cookies (set by sign-in) to call
    // OAuth2-Proxy's userinfo endpoint. Confirms the OIDC session is
    // really established (not just that some HTML rendered).
    const response = await page.request.get(`${BASE_URL}/oauth2/userinfo`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    // OAuth2-Proxy's userinfo includes at least `email` for the signed-in user.
    expect(body.email).toBe(DEX_USER);
  });

  test('session cookie persists across reload: no second Dex round-trip', async ({ page }) => {
    test.setTimeout(2 * 60 * 1000);
    await signIn(page);

    // Reload: the OAuth2-Proxy session cookie should be sufficient,
    // so we should *not* be bounced back to Dex's `/auth?...` page.
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(page.url()).not.toMatch(/\/auth(\?|\/)/);
    expect(page.url()).not.toMatch(/\/oauth2\/sign_in/);
    // And we should still see authenticated Headlamp UI.
    await expect(page.getByText(/cluster/i).first()).toBeVisible({ timeout: 60 * 1000 });
  });

  test('signing out invalidates the session and re-gates the app', async ({ page }) => {
    test.setTimeout(2 * 60 * 1000);
    await signIn(page);

    // Visit OAuth2-Proxy's sign-out endpoint. In older versions a GET
    // to `/oauth2/sign_out` immediately clears the session cookie and
    // redirects to `/oauth2/sign_in`. In OAuth2-Proxy v7.6+ a GET shows
    // a confirmation form with a "Sign out" button; the cookie
    // is only cleared once that button is clicked. Handle both shapes.
    await page.goto(`${BASE_URL}/oauth2/sign_out`);
    const signOutConfirm = page
      .locator('form[action*="sign_out"], form[action="/oauth2/sign_out"]')
      .locator('button[type="submit"], input[type="submit"]')
      .first();
    try {
      await signOutConfirm.waitFor({ state: 'visible', timeout: 5 * 1000 });
      await signOutConfirm.click();
    } catch {
      // Older OAuth2-Proxy: GET cleared the cookie directly.
    }

    // After sign-out, going back to `/` must hit the OAuth2-Proxy
    // splash again, *not* fall through to Headlamp. OAuth2-Proxy serves
    // the splash in-place (no redirect), so we assert on the button.
    await page.goto(`${BASE_URL}/`);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({
      timeout: 15 * 1000,
    });
  });

  test('post-sign-in redirect preserves the originally-requested deep link', async ({ page }) => {
    // Hit a deep link unauthenticated, then sign in, and assert OAuth2-Proxy
    // sends us back to the originally-requested path (not `/`).
    // Catches regressions in OAuth2-Proxy's `rd`/state round-trip.
    test.setTimeout(2 * 60 * 1000);
    const deepLink = `${BASE_URL}/c/main/pods`;

    await page.goto(deepLink);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await page.getByRole('button', { name: /sign in/i }).click();

    // Dex local-login.
    await page.waitForURL(/\/auth(\?|\/)/, { timeout: 30 * 1000 });
    await page.locator('input[name="login"], input[type="email"]').first().fill(DEX_USER);
    await page.locator('input[name="password"], input[type="password"]').first().fill(DEX_PASSWORD);
    await page.locator('button[type="submit"], input[type="submit"]').first().click();

    // Optional "Grant Access" consent screen.
    const grantAccess = page.getByRole('button', { name: /grant access/i });
    try {
      await grantAccess.waitFor({ state: 'visible', timeout: 10 * 1000 });
      await grantAccess.click();
    } catch {
      // Dex skipped consent.
    }

    // After OIDC callback, OAuth2-Proxy redirects us back to /c/main/pods,
    // not `/`. Wait specifically for that path.
    await page.waitForURL(/\/c\/main\/pods/, { timeout: 60 * 1000 });
    expect(page.url()).toMatch(/\/c\/main\/pods/);
  });

  test('OAuth2-Proxy session cookie is HttpOnly and SameSite=Lax', async ({ page, context }) => {
    // Regression guard against accidentally loosening session-cookie flags.
    // OAuth2-Proxy's default cookie name is `_oauth2_proxy`; with default
    // settings it is HttpOnly and SameSite=Lax. (cookie_secure is false
    // for this HTTP-only local stack; the prose tutorial calls that out.)
    test.setTimeout(2 * 60 * 1000);
    await signIn(page);

    const cookies = await context.cookies(BASE_URL);
    const session = cookies.find(c => c.name === '_oauth2_proxy');
    expect(session, 'expected an _oauth2_proxy session cookie after sign-in').toBeDefined();
    expect(session!.httpOnly).toBe(true);
    // Playwright normalizes SameSite to 'Strict' | 'Lax' | 'None'.
    expect(session!.sameSite).toBe('Lax');
  });

  test('a fresh browser context with no session is gated', async ({ browser, page }) => {
    // Sign in in the default context, then open a *separate* context and
    // confirm it is still gated by OAuth2-Proxy. Verifies the session is
    // not leaking across browser contexts (first-party cookie scoping).
    test.setTimeout(2 * 60 * 1000);
    await signIn(page);

    const freshContext = await browser.newContext();
    try {
      const freshPage = await freshContext.newPage();
      await freshPage.goto(`${BASE_URL}/`);
      await expect(freshPage.getByRole('button', { name: /sign in/i })).toBeVisible();
    } finally {
      await freshContext.close();
    }
  });

  test('a forged Authorization header without a session cookie does not bypass the gate', async ({
    request,
  }) => {
    // OAuth2-Proxy must not accept an attacker-supplied `Authorization:
    // Bearer token in place of a valid session cookie; that would defeat
    // the gate entirely. The request should land on /oauth2/sign_in
    // (302) or be rejected (401/403); in no case should it reach the
    // Headlamp upstream with a 200.
    const response = await request.get(`${BASE_URL}/c/main/pods`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    // OAuth2-Proxy returns 302 to /oauth2/sign_in or 401/403 for gated
    // resources; the upstream Headlamp UI (which would return 200) must
    // not be reached.
    expect([302, 401, 403]).toContain(response.status());
  });

  test('a different Dex static user signs in and is identified by /oauth2/userinfo', async ({
    browser,
  }) => {
    // Verifies the OIDC plumbing does not hard-code a single user:
    // sign in as alice@example.com (the second static user in
    // dex-config.yaml) and confirm /oauth2/userinfo reports that
    // identity, not the suite-wide DEX_USER. Catches regressions where
    // a hard-coded subject/email is forwarded regardless of who
    // actually authenticated. Uses its own browser context so it does
    // not collide with the suite's signed-in cookies.
    test.setTimeout(2 * 60 * 1000);
    const otherUser = 'alice@example.com';
    const otherPassword = 'password';

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signIn(page, otherUser, otherPassword);

      const response = await page.request.get(`${BASE_URL}/oauth2/userinfo`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.email).toBe(otherUser);
    } finally {
      await ctx.close();
    }
  });

  test('OAuth2-Proxy /oauth2/callback rejects a forged state parameter', async ({ request }) => {
    // OAuth2-Proxy stores the CSRF state in a short-lived cookie when
    // it initiates the OIDC flow (`/oauth2/start`). A direct hit on
    // `/oauth2/callback` with no matching state cookie must be refused
    // accepting it would let an attacker initiate a flow on a victim
    // (CSRF) or skip the state-mismatch check entirely.
    //
    // We do *not* pass any cookies (Playwright's `request` fixture is
    // a fresh client) and we supply a bogus `code` + arbitrary `state`.
    // OAuth2-Proxy should return a 4xx (Forbidden / Unauthorized /
    // Internal Server Error variants) and must not set an
    // `_oauth2_proxy` session cookie.
    const response = await request.get(
      `${BASE_URL}/oauth2/callback?code=not-a-real-code&state=forged-by-attacker`,
      {
        maxRedirects: 0,
        failOnStatusCode: false,
      }
    );

    // OAuth2-Proxy returns 403 ("Permission Denied") for missing /
    // invalid CSRF state. Accept any 4xx (or 500-level handler error)
    // so the test isn't pinned to a specific status code, but a 200
    // or 302 (redirect to the upstream) would indicate a real bypass.
    expect(response.status(), 'callback with forged state must not succeed').not.toBe(200);
    expect(response.status()).toBeGreaterThanOrEqual(400);

    // Crucially: no session cookie must have been set.
    const setCookie = response.headers()['set-cookie'] || '';
    expect(setCookie).not.toMatch(/_oauth2_proxy=[^;]/);
  });
});
