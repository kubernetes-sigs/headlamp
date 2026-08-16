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
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { _electron, Page } from 'playwright';
import { HeadlampPage } from './headlampPage';
import { dismissReleaseNotes } from './releaseNotesTestUtils';

// Electron setup
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

// Renaming a cluster persists a headlamp_info customName extension into the
// kubeconfig. Run against a throwaway copy so the developer's real kubeconfig
// is never modified and the suite stays repeatable.
const ISOLATED_KUBECONFIG = path.join(os.tmpdir(), `headlamp-e2e-rename-${process.pid}.kubeconfig`);

// Electron's default userData directory persists across launches. Reusing it
// (by omitting --user-data-dir) accumulates real browser state — cache,
// IndexedDB, etc. — across every Electron launch that came before this one,
// including from other spec files in the same run. That leftover state
// reproducibly caused a phantom element to intercept clicks aimed at the
// cluster link below (confirmed by bisecting: identical launch args except
// for --user-data-dir turned a 100%-reproducible failure into a 100% pass).
// A throwaway profile per run sidesteps it entirely. Created in beforeAll,
// not here at module scope, so collecting this file (e.g. `--list`) never
// creates a directory that beforeAll/afterAll won't run to clean up.
let PROFILE_DIR: string;

function writeIsolatedKubeconfig(context: string, target: string): void {
  fs.writeFileSync(
    target,
    execSync(`kubectl --context ${context} config view --minify --raw --flatten`, {
      encoding: 'utf8',
    }),
    { mode: 0o600 }
  );
}
let electronApp;
let electronPage: Page;

// Test configuration
const TEST_CONFIG = {
  originalName: 'minikube',
  newName: 'test-cluster',
  cancelledName: 'cancelled-cluster',
  invalidName: 'Invalid Cluster!',
};

// Helper functions
async function navigateToSettings(page: Page) {
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForLoadState('load');
}

async function verifyClusterName(page: Page, expectedName: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('a[href="#/settings/cluster"]').click();
  // Check the cluster name in the cluster selector combobox
  await expect(page.locator(`input[placeholder="${expectedName}"]`)).toBeVisible();
}

async function renameCluster(
  page: Page,
  fromName: string,
  toName: string,
  confirm: boolean = true
) {
  await page.fill(`input[placeholder="${fromName}"]`, toName);
  await page.getByRole('button', { name: 'Apply' }).click();
  // ConfirmDialog (frontend/src/components/common/ConfirmDialog.tsx) only
  // sets data-testid="confirm-button"/"cancel-button", not aria-label —
  // data-testid never affects the accessible name, so this previously
  // waited on a role+name pair that could never match, and only worked at
  // all because of a since-fixed profile flake masking the real failure.
  // The "Change name" confirm dialog (ClusterNameEditor.tsx) doesn't
  // override confirmLabel/cancelLabel, so the accessible names are the
  // ConfirmDialog defaults: "Yes" and "No".
  await page.getByRole('button', { name: confirm ? 'Yes' : 'No' }).click();
  await page.waitForLoadState('load');
  await page.locator(`a[href="#/c/${toName}/"]`).click();
}

// Setup
test.beforeAll(async () => {
  writeIsolatedKubeconfig(TEST_CONFIG.originalName, ISOLATED_KUBECONFIG);
  PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-e2e-rename-profile-'));

  electronApp = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: ['.', `--user-data-dir=${PROFILE_DIR}`],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_DEV: 'true',
      KUBECONFIG: ISOLATED_KUBECONFIG,
    },
  });

  // Otherwise the Release Notes modal can open (see #6966) and its backdrop
  // blocks clicks on the page underneath.
  electronPage = await dismissReleaseNotes(electronApp);
});

// The app holds a single-instance lock, so it must be closed or the next spec
// file's launch is denied the lock and quits immediately.
test.afterAll(async () => {
  await electronApp?.close();
  fs.rmSync(ISOLATED_KUBECONFIG, { force: true });
  if (PROFILE_DIR) {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  }
});

// Tests
test.describe('Cluster rename functionality', () => {
  test('should rename cluster and verify changes', async () => {
    const page = electronPage;
    const headlampPage = new HeadlampPage(page);
    await headlampPage.authenticate();

    await headlampPage.a11y();

    await navigateToSettings(page);
    await expect(page.locator('h2')).toContainText('Cluster Settings');

    // Test invalid inputs
    await page.fill('input[placeholder="minikube"]', TEST_CONFIG.invalidName);
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await page.fill('input[placeholder="minikube"]', '');
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

    // Test successful rename
    await renameCluster(page, TEST_CONFIG.originalName, TEST_CONFIG.newName);
    await verifyClusterName(page, TEST_CONFIG.newName);
    // No need to rename back: the rename is written to ISOLATED_KUBECONFIG,
    // which is discarded in afterAll.
  });
});
