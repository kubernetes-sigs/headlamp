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
 * Regression coverage for the Release Notes modal (#6966 and the
 * accessibility audit that followed it):
 *
 * - frontend/src/components/common/ReleaseNotes/ReleaseNotes.tsx only
 *   fetches and shows release notes when it already has an *older*
 *   `app_version` stored in localStorage than the running build. On a
 *   developer's machine that ran an older Headlamp build before pulling a
 *   newer one, the desktop e2e suite's reuse of Electron's default,
 *   persistent userData directory made this trigger for real, and the
 *   modal's backdrop intercepted clicks aimed at the page underneath —
 *   which is what broke clusterRename.spec.ts and namespaces.spec.ts.
 * - Once open, the dialog had no accessible name wiring of its own (it
 *   happens to get one via MUI's DialogContext id propagation — verified
 *   empirically, not something this code did on purpose), never moved
 *   focus anywhere, had no onClose (Escape/backdrop did nothing), and its
 *   scrollable content had no way to receive keyboard focus — meaning a
 *   keyboard-only user reading a link-free release note had no way to
 *   scroll past the first screenful.
 * - The Snackbar in UpdatePopup.tsx and this dialog can both be visible at
 *   once (both set from the same fetch), and MUI's default z-index puts
 *   Snackbars above Dialogs, so the Snackbar rendered on top of — and
 *   remained mouse-clickable through — a dialog that's supposed to be
 *   exclusive.
 *
 * Each test gets its own throwaway --user-data-dir, so none of them depend
 * on or pollute this machine's real Headlamp profile — this stands in for
 * resetting storageState between tests, which isn't an option here:
 * `_electron.launch()` has no `storageState` option, unlike
 * `browser.newContext()`.
 *
 * Forcing the modal open without a live network dependency uses
 * openReleaseNotesWithMockedFetch(), which replaces window.fetch via an
 * init script rather than using context.route(): a route.fulfill() response
 * to a cross-origin https:// request from a file:// page comes back to the
 * page as `status: 0` / `ok: false` regardless of headers (confirmed while
 * building this suite), so mocking at the network layer doesn't work here.
 */

import { expect, test } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron, ElectronApplication } from 'playwright';
import {
  dismissReleaseNotes,
  openReleaseNotesWithMockedFetch,
  openUpdateToastWithMockedFetch,
} from './releaseNotesTestUtils';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

// Older than any real release, so ReleaseNotes.tsx's
// `semver.lt(storedAppVersion, currentBuildAppVersion)` check is always true.
const STALE_APP_VERSION = '0.0.1';

async function launchWithFreshProfile(): Promise<{
  electronApp: ElectronApplication;
  cleanup: () => void;
}> {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-e2e-release-notes-'));
  const cleanup = () => fs.rmSync(profileDir, { recursive: true, force: true });

  try {
    const electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.', `--user-data-dir=${profileDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
      },
    });
    return { electronApp, cleanup };
  } catch (err) {
    // If launch() itself throws, the caller never gets `cleanup` back, so
    // the temp profile would otherwise be orphaned under os.tmpdir().
    cleanup();
    throw err;
  }
}

test.describe('Release Notes modal', () => {
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'These tests only run in app mode');
  });

  test('stays dismissed even with a stale app_version stored', async () => {
    const { electronApp, cleanup } = await launchWithFreshProfile();

    try {
      await electronApp.context().addInitScript((version: string) => {
        window.localStorage.setItem('app_version', version);
      }, STALE_APP_VERSION);

      // The primary assertion is "no GitHub request happened", not "no
      // dialog appeared" — the latter alone is a vacuous pass: this app's
      // build version routinely has no matching published GitHub release
      // tag, so the real API call 404s and ReleaseNotes.tsx's own catch
      // block suppresses the dialog regardless of whether the fix under
      // test (dismissReleaseNotes) actually works. Attached on the context
      // (not the page) so it also covers the reload dismissReleaseNotes()
      // triggers internally, before a `page` reference exists here.
      const githubRequests: string[] = [];
      electronApp.context().on('request', request => {
        if (request.url().startsWith('https://api.github.com/')) {
          githubRequests.push(request.url());
        }
      });

      const page = await dismissReleaseNotes(electronApp);

      await page.waitForTimeout(5000);
      expect(githubRequests).toEqual([]);
      // Secondary/defense-in-depth: the dialog should also never appear.
      await expect(page.getByRole('dialog', { name: /Release Notes/i })).toHaveCount(0);
    } finally {
      await electronApp.close();
      cleanup();
    }
  });

  test('has an accessible name and closes on Escape', async () => {
    const { electronApp, cleanup } = await launchWithFreshProfile();

    try {
      const page = await openReleaseNotesWithMockedFetch(electronApp);

      const dialog = page.getByRole('dialog', { name: /Release Notes/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    } finally {
      await electronApp.close();
      cleanup();
    }
  });

  test('scrolls the release notes content with the keyboard', async () => {
    const { electronApp, cleanup } = await launchWithFreshProfile();

    try {
      // Long, link-free body: nothing inside is otherwise focusable, so this
      // is exactly the condition that used to leave keyboard users stuck —
      // MUI's FocusTrap fell back to focusing the outer dialog container,
      // which isn't an ancestor of the scrollable content, so PageDown did
      // nothing.
      const longNotes = Array.from(
        { length: 60 },
        (_, i) => `Paragraph ${i}: release notes content with no links at all.`
      ).join('\n\n');

      const page = await openReleaseNotesWithMockedFetch(electronApp, { notesBody: longNotes });

      const dialog = page.getByRole('dialog', { name: /Release Notes/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      const content = page.getByLabel('Release notes content');
      // Reach it via real Tab presses (not content.focus(), which only
      // proves the element is *focusable*, not that a keyboard user
      // actually lands on it navigating the dialog normally): focusTitle
      // puts focus on the title on open, so Tab moves to the close button,
      // then to this element.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(content).toBeFocused();

      const before = await content.evaluate(el => el.scrollTop);
      await page.keyboard.press('PageDown');
      await expect(async () => {
        const after = await content.evaluate(el => el.scrollTop);
        expect(after).toBeGreaterThan(before);
      }).toPass({ timeout: 5_000 });
    } finally {
      await electronApp.close();
      cleanup();
    }
  });

  test('does not show the update Snackbar while the dialog is open', async () => {
    const { electronApp, cleanup } = await launchWithFreshProfile();

    try {
      // A newer release name than the mocked app version makes
      // releaseDownloadURL truthy too, so both UpdatePopup and
      // ReleaseNotesModal are set from the same fetch — the exact condition
      // that surfaced the z-index conflict.
      const page = await openReleaseNotesWithMockedFetch(electronApp, {
        latestReleaseVersion: 'v99.0.0',
      });

      const dialog = page.getByRole('dialog', { name: /Release Notes/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      // 'alert' covers the Snackbar's default role; 'status' covers the
      // update-available variant's role="status" override (see the
      // "Update available toast" suite below).
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('status')).toHaveCount(0);
    } finally {
      await electronApp.close();
      cleanup();
    }
  });
});

/**
 * Regression coverage for the "update available" Snackbar
 * (UpdatePopup.tsx), audited separately from the dialog above:
 *
 * - It's announced via role="status" (polite), not SnackbarContent's
 *   default role="alert" (assertive) — "an update is available" isn't
 *   urgent enough to justify interrupting whatever a screen reader is
 *   currently reading.
 * - "Read more" opens a new tab via window.open() from a plain <button>,
 *   which carries none of the conventional new-tab signaling an
 *   <a target="_blank"> would.
 *
 * Its three action buttons were also checked against WCAG 2.2's 24x24 CSS
 * px target size minimum — a real boundingBox() measurement caught them at
 * ~18-22px, which looked like a defect, but that measurement was taken
 * mid-transition (the Snackbar's Grow entrance animation scales it up from
 * 0). Waiting for the transition to settle before measuring showed they're
 * actually 32-36.5px, comfortably over the minimum, with no code change
 * needed. The size check below stays as a sanity guard against a future
 * regression, not because this was ever actually broken.
 */
test.describe('Update available toast', () => {
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'These tests only run in app mode');
  });

  test('is announced politely and warns "Read more" opens a new tab', async () => {
    const { electronApp, cleanup } = await launchWithFreshProfile();

    try {
      const page = await openUpdateToastWithMockedFetch(electronApp);

      // Neither the 'status' nor 'alert' role computes an accessible name
      // from content per the ARIA spec (both are "name from author" only),
      // so this can't filter by { name: ... } — check role and text
      // separately instead.
      const toast = page.getByRole('status');
      await expect(toast).toBeVisible({ timeout: 15_000 });
      await expect(toast).toContainText(/update is available/i);
      await expect(page.getByRole('alert')).toHaveCount(0);

      const readMore = page.getByRole('button', { name: /read more/i });
      const describedBy = await readMore.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).toHaveText(/new tab/i);
    } finally {
      await electronApp.close();
      cleanup();
    }
  });

  test('gives every action button a large enough target size', async () => {
    const { electronApp, cleanup } = await launchWithFreshProfile();

    try {
      const page = await openUpdateToastWithMockedFetch(electronApp);

      await expect(page.getByRole('status')).toBeVisible({ timeout: 15_000 });
      // Let the Grow entrance transition finish — mid-transition the
      // Snackbar is scaled down from 0, so an early measurement reports a
      // smaller size than the button will actually render at.
      await page.waitForTimeout(500);

      for (const name of [/read more/i, /disable update notifications/i, /^dismiss$/i]) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(24);
        expect(box?.width, `${name} width`).toBeGreaterThanOrEqual(24);
      }
    } finally {
      await electronApp.close();
      cleanup();
    }
  });
});
