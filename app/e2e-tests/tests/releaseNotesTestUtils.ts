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
 * Shared storage-state helpers for the Release Notes modal
 * (frontend/src/components/common/ReleaseNotes/ReleaseNotes.tsx), which
 * every app-mode spec needs to keep dismissed by default so its backdrop
 * doesn't intercept clicks (see #6966).
 *
 * `_electron.launch()` has no `storageState` option — Playwright's
 * project-level storageState/setup-project pattern only applies to
 * `browser.newContext()`-backed contexts, not Electron. The supported
 * primitive for Electron is `browserContext.addInitScript()`, registered on
 * `electronApp.context()`. Electron's main process can already be loading
 * the window by the time `_electron.launch()` resolves, so an init script
 * registered afterwards can miss that first navigation — reloading once
 * guarantees it has taken effect before anything else in a test runs.
 */

import { ElectronApplication, Page } from 'playwright';

const DISABLE_UPDATE_CHECK_KEY = 'disable_update_check';

/**
 * Seeds localStorage so the app looks like it already dismissed the update
 * check, then reloads so that state is guaranteed to be in place. Call this
 * from an app-mode spec's setup instead of `electronApp.firstWindow()`
 * directly.
 */
export async function dismissReleaseNotes(electronApp: ElectronApplication): Promise<Page> {
  await electronApp.context().addInitScript((key: string) => {
    window.localStorage.setItem(key, 'true');
  }, DISABLE_UPDATE_CHECK_KEY);

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('load');
  await page.reload();
  await page.waitForLoadState('load');
  return page;
}

/** Older than any real release, so ReleaseNotes.tsx's staleness check is always true. */
export const STALE_APP_VERSION = '0.0.1';

/**
 * Forces the real Release Notes modal open in an Electron e2e test, without
 * a live network dependency.
 *
 * `context.route()` can't mock this: a route.fulfill() response to a
 * cross-origin `https://` fetch from a `file://` page comes back to the page
 * as an opaque `status: 0` / `ok: false` response no matter what headers it
 * carries (confirmed while building this — this is a Playwright/Electron/
 * file:// interaction, not something under this suite's control). Instead,
 * this replaces `window.fetch` itself via an init script before the app's
 * bundle runs, which never touches the browser's real networking/CORS layer
 * at all.
 */
export async function openReleaseNotesWithMockedFetch(
  electronApp: ElectronApplication,
  opts: { latestReleaseVersion?: string; notesBody?: string } = {}
): Promise<Page> {
  const { latestReleaseVersion = null, notesBody = 'Something worth mentioning changed.' } = opts;

  await electronApp.context().addInitScript(
    ({ staleVersion, latestReleaseVersion: latest, notesBody: notes }) => {
      window.localStorage.setItem('app_version', staleVersion);

      const originalFetch = window.fetch.bind(window);
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === 'https://api.github.com/repos/kinvolk/headlamp/releases') {
          return new Response(
            JSON.stringify([
              {
                name: latest ?? 'v9.9.9',
                html_url: 'https://example.com/release',
                body: '',
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.startsWith('https://api.github.com/repos/kinvolk/headlamp/releases/tags/')) {
          return new Response(JSON.stringify({ body: notes }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return originalFetch(input, init);
      }) as typeof window.fetch;
    },
    { staleVersion: STALE_APP_VERSION, latestReleaseVersion, notesBody }
  );

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('load');
  await page.reload();
  await page.waitForLoadState('load');
  return page;
}

/**
 * Forces the real "update available" Snackbar (UpdatePopup.tsx) open,
 * without also opening the Release Notes dialog. The two are mutually
 * exclusive by design — ReleaseNotes.tsx suppresses the Snackbar while the
 * dialog is open — so getting the Snackbar alone means NOT seeding a stale
 * app_version, only a release name newer than the running build.
 */
export async function openUpdateToastWithMockedFetch(
  electronApp: ElectronApplication,
  opts: { latestReleaseVersion?: string } = {}
): Promise<Page> {
  const { latestReleaseVersion = 'v999.0.0' } = opts;

  await electronApp.context().addInitScript((latest: string) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === 'https://api.github.com/repos/kinvolk/headlamp/releases') {
        return new Response(
          JSON.stringify([{ name: latest, html_url: 'https://example.com/release', body: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return originalFetch(input, init);
    }) as typeof window.fetch;
  }, latestReleaseVersion);

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('load');
  await page.reload();
  await page.waitForLoadState('load');
  return page;
}
