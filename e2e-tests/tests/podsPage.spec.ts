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
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { HeadlampPage } from './headlampPage';
import { podsPage } from './podsPage';

const execFileAsync = promisify(execFile);

async function kubectl(kubeconfig: string, ...args: string[]) {
  await execFileAsync('kubectl', ['--kubeconfig', kubeconfig, '--context=kind-test', ...args]);
}

function makePod(name: string, resourceVersion: string) {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace: 'default',
      uid: `${name}-uid`,
      resourceVersion,
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    spec: {
      containers: [{ name: 'main', image: 'busybox' }],
    },
    status: {
      phase: 'Running',
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  };
}

test('loads the next page of pods', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  await page.route('**/clusters/test/apis/metrics.k8s.io/v1beta1/pods?*', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        apiVersion: 'metrics.k8s.io/v1beta1',
        kind: 'PodMetricsList',
        metadata: { resourceVersion: '1' },
        items: [],
      }),
    });
  });

  const listRequests: URL[] = [];
  await page.route('**/clusters/test/api/v1/pods?*', async route => {
    const url = new URL(route.request().url());
    listRequests.push(url);

    const continueToken = url.searchParams.get('continue');
    const isNextPage = continueToken === 'next-page';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        apiVersion: 'v1',
        kind: 'PodList',
        metadata: {
          resourceVersion: isNextPage ? '2' : '1',
          continue: isNextPage ? '' : 'next-page',
          remainingItemCount: isNextPage ? 0 : 1,
        },
        items: isNextPage
          ? [makePod('pod-second-page', '2')]
          : Array.from({ length: 501 }, (_, index) => makePod(`pod-${index}`, `${index + 1}`)),
      }),
    });
  });

  await headlampPage.navigateTopage('/c/test/pods', /Pods/);

  await expect(page.getByRole('link', { name: 'pod-0', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'pod-second-page' })).toHaveCount(0);
  await expect(page.getByText('501 of ~502')).toBeVisible();

  expect(listRequests).toHaveLength(1);
  expect(listRequests[0].searchParams.get('limit')).toBe('1000');
  expect(listRequests[0].searchParams.has('continue')).toBe(false);

  await page.getByRole('button', { name: 'Load more' }).click();

  await expect.poll(() => listRequests.length).toBe(2);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Show/Hide search' }).click();
  await page.locator('#table-search-field').fill('pod-second-page');
  await expect(page.getByRole('link', { name: 'pod-second-page' })).toBeVisible();

  expect(listRequests).toHaveLength(2);
  expect(listRequests[1].searchParams.get('limit')).toBe('1000');
  expect(listRequests[1].searchParams.get('continue')).toBe('next-page');
});

test('changes column visibility with the keyboard', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
  await headlampPage.navigateTopage('/c/test/pods', /Pods/);

  const columnSelector = page.getByRole('button', { name: 'Show/Hide columns' });
  await columnSelector.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('menuitem', { name: 'Hide all' })).toBeFocused();

  const columnItem = page.locator('[role="menuitemcheckbox"]:not([aria-disabled="true"])').first();
  const initialChecked = await columnItem.getAttribute('aria-checked');
  expect(initialChecked).toMatch(/^(true|false)$/);

  const menuItemCount = await page.locator('[role="menuitem"], [role="menuitemcheckbox"]').count();
  for (let index = 0; index < menuItemCount; index++) {
    await page.keyboard.press('ArrowDown');
    if (await columnItem.evaluate(element => element === document.activeElement)) {
      break;
    }
  }
  await expect(columnItem).toBeFocused();

  await page.keyboard.press('Space');
  await expect(columnItem).toHaveAttribute(
    'aria-checked',
    initialChecked === 'true' ? 'false' : 'true'
  );
});

test('multi tab create delete pod', async ({ browser }) => {
  // This test may be slow to create and delete a pod
  test.setTimeout(60000);
  const name = 'examplepodlol';

  const instance1 = await browser.newContext();
  const page1 = await instance1.newPage();
  const window1 = new HeadlampPage(page1);
  await window1.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const page2 = await instance1.newPage();
  const window2 = new HeadlampPage(page2);
  await window2.navigateTopage('/c/test/pods', /Pods/);
  await window1.navigateTopage('/c/test/pods', /Pods/);

  // if no pod permission, return
  const content1 = await page1.content();
  const content2 = await page2.content();
  if (
    !content1.includes('Pods') ||
    !content1.includes('href="/c/test/pods') ||
    !content2.includes('Pods') ||
    !content2.includes('href="/c/test/pods')
  ) {
    return;
  }

  const realtimeUpdate1 = new podsPage(page1);
  const realtimeUpdate2 = new podsPage(page2);

  await realtimeUpdate1.createPod(name);
  await realtimeUpdate2.confirmPodCreation(name);
});

test('removes a pod from the list when it is deleted with kubectl', async ({ page }) => {
  test.setTimeout(90000);
  const name = `headlamp-watch-${Date.now()}`;
  const tempDirectory = await mkdtemp(join(tmpdir(), 'headlamp-e2e-'));
  const kubeconfig = join(tempDirectory, 'kubeconfig');

  try {
    const { stdout } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
    await writeFile(kubeconfig, stdout);
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'run',
      name,
      '--image=registry.k8s.io/pause:3.10',
      '--restart=Never'
    );

    const headlampPage = new HeadlampPage(page);
    await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
    await headlampPage.navigateTopage('/c/test/pods', /Pods/);

    const podLink = page.getByRole('link', { name, exact: true });
    await expect(podLink).toBeVisible({ timeout: 15000 });

    await kubectl(kubeconfig, '--namespace=default', 'delete', 'pod', name, '--wait=false');

    await expect(podLink).toHaveCount(0, { timeout: 45000 });
  } finally {
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'delete',
      'pod',
      name,
      '--ignore-not-found=true'
    )
      .catch(() => undefined)
      .finally(() => rm(tempDirectory, { recursive: true, force: true }));
  }
});

test('warns and preserves edits when a pod is modified externally', async ({ page }) => {
  test.setTimeout(90000);
  const name = `headlamp-edit-conflict-${Date.now()}`;
  const tempDirectory = await mkdtemp(join(tmpdir(), 'headlamp-e2e-'));
  const kubeconfig = join(tempDirectory, 'kubeconfig');

  await page.addInitScript(() => {
    window.localStorage.setItem('headlampThemePreference', 'Dark');
  });

  try {
    const { stdout } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
    await writeFile(kubeconfig, stdout);
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'run',
      name,
      '--image=registry.k8s.io/pause:3.10',
      '--restart=Never'
    );

    const headlampPage = new HeadlampPage(page);
    await page.goto('/c/test', { waitUntil: 'domcontentloaded' });
    const needsAuthentication = await Promise.race([
      page
        .getByRole('button', { name: 'Authenticate' })
        .waitFor({ state: 'visible' })
        .then(() => true),
      page
        .getByRole('heading', { name: 'Overview' })
        .waitFor({ state: 'visible' })
        .then(() => false),
    ]);
    if (needsAuthentication) {
      await headlampPage.authenticate(process.env.HEADLAMP_TEST_TOKEN);
    }
    await page.goto('/c/test/pods', { waitUntil: 'domcontentloaded' });

    const podLink = page.getByRole('link', { name, exact: true });
    await expect(podLink).toBeVisible({ timeout: 15000 });
    await podLink.click();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByText('Use minimal editor').click();

    const editor = page.locator('textarea[aria-label="yaml Code"]');
    await expect(editor).toBeVisible();
    const originalYaml = await editor.inputValue();
    const editedYaml = originalYaml.replace(
      'metadata:\n',
      'metadata:\n  annotations:\n    e2e.headlamp.dev/unsaved: "true"\n'
    );
    expect(editedYaml).not.toBe(originalYaml);
    await editor.fill(editedYaml);

    await kubectl(
      kubeconfig,
      '--namespace=default',
      'label',
      'pod',
      name,
      `e2e.headlamp.dev/external=${Date.now()}`,
      '--overwrite'
    );

    const warningAlert = page.getByRole('alert').filter({
      hasText:
        'This resource was modified while you were editing. Your changes may conflict with the latest version.',
    });
    await expect(warningAlert).toBeVisible({ timeout: 15000 });
    await expect(warningAlert).toHaveClass(/MuiAlert-standardWarning/);
    await expect(editor).toHaveValue(editedYaml);
  } finally {
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'delete',
      'pod',
      name,
      '--ignore-not-found=true'
    )
      .catch(() => undefined)
      .finally(() => rm(tempDirectory, { recursive: true, force: true }));
  }
});

test('positions the resource YAML viewer for each viewport size', async ({ page }) => {
  test.setTimeout(90000);
  const name = `headlamp-view-yaml-${Date.now()}`;
  const hundredColumnValue = '1234567890'.repeat(9) + '123456';
  const tempDirectory = await mkdtemp(join(tmpdir(), 'headlamp-e2e-'));
  const kubeconfig = join(tempDirectory, 'kubeconfig');

  expect(`    ${hundredColumnValue}`).toHaveLength(100);

  try {
    const { stdout } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
    await writeFile(kubeconfig, stdout);
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'create',
      'configmap',
      name,
      '--from-literal=example=value',
      `--from-literal=line100=${hundredColumnValue}`
    );

    await page.goto('/c/test', { waitUntil: 'domcontentloaded' });
    const needsAuthentication = await Promise.race([
      page
        .getByRole('heading', { level: 1, name: 'Authentication' })
        .waitFor({ state: 'visible' })
        .then(() => true),
      page
        .getByRole('heading', { name: 'Overview' })
        .waitFor({ state: 'visible' })
        .then(() => false),
    ]);
    if (needsAuthentication) {
      const useTokenButton = page.getByRole('button', { name: 'Use A Token' });
      if (await useTokenButton.isVisible()) {
        await useTokenButton.click();
      }
      const token = process.env.HEADLAMP_TEST_TOKEN;
      expect(token).toBeTruthy();
      await page.getByRole('textbox', { name: 'ID token' }).fill(token!);
      await page.getByRole('button', { name: 'Authenticate' }).click();
      await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    }
    await page.route(`**/clusters/test/api/v1/namespaces/default/configmaps/${name}`, route =>
      route.abort('failed')
    );

    for (const viewport of [
      { name: 'phone', width: 390, height: 844 },
      { name: 'medium', width: 1024, height: 900 },
      { name: 'large', width: 1440, height: 900 },
      { name: 'extra-large', width: 2560, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/c/test/configmaps', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/c\/test\/configmaps$/);
      await expect(page.getByRole('heading', { name: 'Config Maps' })).toBeVisible();
      const resourceRow = page.getByRole('row').filter({ has: page.getByRole('link', { name }) });
      await expect(resourceRow).toBeVisible();
      await resourceRow.locator('td').last().getByRole('button').click();
      await page.getByRole('menuitem', { name: 'View YAML' }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);

      const activity = page.locator(`[role="complementary"][aria-label="${name}"]`);
      const viewer = activity.locator(':scope > div');
      const main = page.locator('#main');
      await expect(activity, `${viewport.name} activity`).toBeVisible({ timeout: 15000 });
      await expect
        .poll(
          async () => {
            const [mainBox, viewerBox] = await Promise.all([
              main.boundingBox(),
              viewer.boundingBox(),
            ]);
            if (!mainBox || !viewerBox) {
              return false;
            }

            if (viewport.name === 'phone') {
              return (
                Math.abs(viewerBox.x - mainBox.x) < 2 &&
                Math.abs(viewerBox.y - mainBox.y) < 2 &&
                Math.abs(viewerBox.width - mainBox.width) < 2 &&
                Math.abs(viewerBox.height - mainBox.height) < 2
              );
            }

            if (viewport.name === 'medium') {
              return (
                Math.abs(viewerBox.x - 8) < 2 &&
                Math.abs(viewerBox.y - 72) < 2 &&
                Math.abs(viewerBox.width - (viewport.width - 16)) < 2 &&
                Math.abs(viewerBox.height - (viewport.height - 80)) < 2
              );
            }

            const expectedWidth = Math.min(mainBox.width, Math.max(mainBox.width / 2, 1024));
            return (
              Math.abs(viewerBox.width - expectedWidth) < 2 &&
              Math.abs(viewerBox.height - mainBox.height) < 2 &&
              Math.abs(viewerBox.x + viewerBox.width - (mainBox.x + mainBox.width)) < 2
            );
          },
          { message: `${viewport.name} viewer placement` }
        )
        .toBe(true);

      if (viewport.name === 'large' || viewport.name === 'extra-large') {
        await expect(activity.locator('.monaco-editor')).toContainText(hundredColumnValue);
      }

      await activity.locator('button[title="Close"]').evaluate(button => button.click());
      await expect(activity).toHaveCount(0);
    }
  } finally {
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'delete',
      'configmap',
      name,
      '--ignore-not-found=true'
    )
      .catch(() => undefined)
      .finally(() => rm(tempDirectory, { recursive: true, force: true }));
  }
});

test('react-hotkey for logs search', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  await headlampPage.navigateTopage('/c/test/pods', /Pods/);

  const podsTable = page.getByRole('table');
  await expect(podsTable).toBeVisible();

  const podLink = podsTable
    .locator('tbody')
    .nth(0)
    .locator('tr')
    .nth(0)
    .locator('td')
    .nth(1)
    .locator('a');
  const podName = await podLink.textContent();

  await podLink.click();

  const podHeading = page.getByRole('heading', { level: 1, name: new RegExp(`^Pod: ${podName}$`) });
  await expect(podHeading).toBeVisible();

  const showLogsButton = page.getByRole('button', { name: /^Show Logs$/ });
  await showLogsButton.click();

  const terminal = page.locator('#xterm-container');
  await expect(terminal).toBeVisible();

  await page.keyboard.press('Control+Shift+F');

  const searchInput = page.getByPlaceholder(/^Find$/);
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toBeFocused();
});

test('opens aggregated logs for a workload', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
  await headlampPage.navigateTopage('/c/test/deployments/kube-system/headlamp');
  await expect(page.getByRole('heading', { level: 1, name: 'Deployment: headlamp' })).toBeVisible();

  await page.getByRole('button', { name: /^Show logs$/i }).click();

  await expect(page.locator('#xterm-container')).toBeVisible();
  await expect(page.getByLabel('Select Pod')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Container/ })).toBeVisible();
});

test('checks pod accessibility with a visible status tooltip', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  await page.route('**/clusters/test/apis/metrics.k8s.io/v1beta1/pods?*', async route => {
    await route.fulfill({ json: { apiVersion: 'v1', kind: 'PodMetricsList', items: [] } });
  });
  await page.route('**/clusters/test/api/v1/pods?*', async route => {
    const pod = {
      ...makePod('tooltip-test-pod', '1'),
      status: {
        phase: 'Pending',
        conditions: [{ type: 'Ready', status: 'False' }],
        containerStatuses: [
          {
            name: 'main',
            ready: false,
            restartCount: 0,
            state: {
              waiting: {
                reason: 'ImagePullBackOff',
                message: 'Waiting to pull the container image',
              },
            },
          },
        ],
      },
    };
    await route.fulfill({
      json: { apiVersion: 'v1', kind: 'PodList', metadata: {}, items: [pod] },
    });
  });
  await headlampPage.navigateTopage('/c/test/pods', /Pods/);

  const podsTable = page.getByRole('table');
  await podsTable.getByText('ImagePullBackOff', { exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Waiting to pull the container image');

  await new podsPage(page).a11y();
});
