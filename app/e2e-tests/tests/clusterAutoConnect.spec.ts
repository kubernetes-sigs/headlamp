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
 * Tests for the CONNECT_ON_CLUSTER_LINK feature.
 *
 * Run with: PLAYWRIGHT_TEST_MODE=app npx playwright test clusterAutoConnect.spec.ts
 *
 * Requires: PLAYWRIGHT_TEST_MODE=app, minikube, and kubectl on PATH.
 *
 * beforeAll starts a dedicated minikube profile and exports its cert-based
 * kubeconfig to a standalone file, then launches Electron with KUBECONFIG
 * pointing at it. afterAll deletes the profile.
 *
 * Because the cluster starts with no recent-clusters history, it is not
 * auto-connected on load. The tests verify:
 *
 *   before click  → cluster not in connectedClusters → not polled → not Active
 *   after click   → CONNECT_ON_CLUSTER_LINK calls connect() → polling starts
 *                   → backend fetches version → Active shown
 */

import { expect, test } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { _electron, Page } from 'playwright';

const CLUSTER_NAME = 'headlamp-e2e-connect';
const EXEC_KUBECONFIG = path.join(os.tmpdir(), `${CLUSTER_NAME}.kubeconfig`);
const MERGED_KUBECONFIG = path.join(os.tmpdir(), `${CLUSTER_NAME}-merged.kubeconfig`);

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let electronPage: Page;
let appBaseUrl = ''; // set after Electron launch

function shell(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

function setupExecCluster(): void {
  // Start (or reconnect to) the dedicated minikube profile.
  // minikube automatically adds the context to the kubeconfig in ORIGINAL_KUBECONFIG.
  shell(`minikube start --profile ${CLUSTER_NAME}`);

  // Create a service account with cluster-admin (idempotent).
  shell(
    `kubectl --context ${CLUSTER_NAME} create serviceaccount headlamp-e2e -n default --dry-run=client -o yaml | kubectl --context ${CLUSTER_NAME} apply -f -`
  );
  shell(
    `kubectl --context ${CLUSTER_NAME} create clusterrolebinding headlamp-e2e --clusterrole=cluster-admin --serviceaccount=default:headlamp-e2e --dry-run=client -o yaml | kubectl --context ${CLUSTER_NAME} apply -f -`
  );

  // Use the kubeconfig that minikube already wrote (cert-based auth, proven to work).
  // Export it to a standalone file so the test doesn't inherit unrelated contexts.
  const exported = shell(`kubectl --context ${CLUSTER_NAME} config view --minify --raw --flatten`);
  fs.writeFileSync(MERGED_KUBECONFIG, exported);
}
function teardownExecCluster(): void {
  // Stop and delete the minikube profile (also removes its kubeconfig entries).
  try {
    shell(`minikube delete --profile ${CLUSTER_NAME}`);
  } catch {
    /* ignore */
  }
  for (const f of [EXEC_KUBECONFIG, MERGED_KUBECONFIG]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

if (process.env.PLAYWRIGHT_TEST_MODE === 'app') {
  test.beforeAll(async () => {
    test.setTimeout(3 * 60 * 1000); // cluster creation takes ~60s
    setupExecCluster();

    // Launch Electron with the merged kubeconfig so it sees the new cluster.
    electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
        KUBECONFIG: MERGED_KUBECONFIG,
      },
    });
    electronPage = await electronApp.firstWindow();
    await electronPage.waitForLoadState('load');
    // The app uses file:// with hash routing: file:///...index.html#/
    // Capture the base file URL (without hash) for navigation.
    const rawUrl = electronPage.url();
    if (rawUrl.startsWith('file://')) {
      appBaseUrl = rawUrl.split('#')[0]; // e.g., file:///path/to/index.html
    } else if (rawUrl.startsWith('http')) {
      const u = new URL(rawUrl);
      appBaseUrl = `${u.protocol}//${u.host}`;
    }
  });

  test.afterAll(async () => {
    await electronApp?.close();
    teardownExecCluster();
  });
}

function getPage(browserPage: Page): Page {
  return process.env.PLAYWRIGHT_TEST_MODE === 'app' ? electronPage : browserPage;
}

async function goToHomeClean(page: Page) {
  // Clear storage first while the page is still in its current state.
  await page.evaluate(() => {
    localStorage.removeItem('recent_clusters');
    sessionStorage.removeItem('session_connected_clusters');
  });

  // Navigate to the home route. The app uses hash routing so
  // the home URL is baseUrl + '#/'.
  const homeUrl = appBaseUrl
    ? appBaseUrl.startsWith('file://')
      ? `${appBaseUrl}#/`
      : `${appBaseUrl}/`
    : undefined;

  if (homeUrl) {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  } else {
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.waitForLoadState('domcontentloaded');
  }

  await expect(page.locator('h1:has-text("Home")')).toBeVisible({ timeout: 15_000 });
}

test.describe('cluster auto-connect via link click (app)', () => {
  test.beforeEach(() => {
    // These tests require the Electron app mode and the minikube cluster above.
    test.skip(
      process.env.PLAYWRIGHT_TEST_MODE !== 'app',
      'Requires PLAYWRIGHT_TEST_MODE=app and minikube on PATH'
    );
  });
  test('clicking a cluster link writes it to sessionStorage', async ({ page: browserPage }) => {
    const page = getPage(browserPage);
    await goToHomeClean(page);

    // No session connects before the click.
    expect(
      await page.evaluate(() => sessionStorage.getItem('session_connected_clusters'))
    ).toBeNull();

    const clusterLink = page.locator('table tbody tr td a', {
      hasText: new RegExp(`^${CLUSTER_NAME}$`),
    });
    await expect(clusterLink).toBeVisible();

    // Click the link — CONNECT_ON_CLUSTER_LINK calls connect() → sessionStorage written.
    await clusterLink.click();
    await page.waitForURL(new RegExp(`/c/${CLUSTER_NAME}`));

    const after = await page.evaluate(() => sessionStorage.getItem('session_connected_clusters'));
    expect(after).not.toBeNull();
    expect(JSON.parse(after!)).toContain(CLUSTER_NAME);
  });

  test('cluster is not Active before click, becomes Active after click (exec plugin runs)', async ({
    page: browserPage,
  }) => {
    const page = getPage(browserPage);
    await goToHomeClean(page);

    const clusterRow = () =>
      page.locator('table tbody tr').filter({
        has: page.locator('td a', { hasText: new RegExp(`^${CLUSTER_NAME}$`) }),
      });

    // Without clicking, the cluster is not polled → exec plugin never runs → not Active.
    await expect(clusterRow()).not.toContainText(/Active/, { timeout: 3_000 });

    // Click the link — connect() starts polling → exec plugin runs → token fetched.
    await page.locator('table tbody tr td a', { hasText: new RegExp(`^${CLUSTER_NAME}$`) }).click();
    await page.waitForURL(new RegExp(`/c/${CLUSTER_NAME}`));

    // Return to Home and verify Active.
    const homeUrl = appBaseUrl
      ? appBaseUrl.startsWith('file://')
        ? `${appBaseUrl}#/`
        : `${appBaseUrl}/`
      : undefined;
    if (homeUrl) {
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await page.evaluate(() => {
        window.location.hash = '#/';
      });
      await page.waitForLoadState('domcontentloaded');
    }
    await expect(page.locator('h1:has-text("Home")')).toBeVisible();
    // Give the backend time to poll the minikube API.
    await expect(clusterRow()).toContainText(/Active/, { timeout: 45_000 });
  });
});
