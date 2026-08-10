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

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
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

test('warns and preserves edits when a resource is modified externally', async ({ page }) => {
  test.setTimeout(90000);
  const name = `headlamp-edit-conflict-${Date.now()}`;
  const tempDirectory = await mkdtemp(join(tmpdir(), 'headlamp-e2e-'));
  const kubeconfig = join(tempDirectory, 'kubeconfig');

  try {
    const { stdout } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
    await writeFile(kubeconfig, stdout);
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'create',
      'configmap',
      name,
      '--from-literal=initial=value'
    );
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'label',
      'configmap',
      name,
      'e2e.headlamp.dev/initial=true'
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
    await page.goto('/c/test/configmaps', { waitUntil: 'domcontentloaded' });

    const configMapLink = page.getByRole('link', { name, exact: true });
    await expect(configMapLink).toBeVisible({ timeout: 15000 });
    await configMapLink.click();

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
      'configmap',
      name,
      'e2e.headlamp.dev/external=true'
    );

    await expect(
      page.getByText(
        'This resource was modified while you were editing. Your changes may conflict with the latest version.'
      )
    ).toBeVisible({ timeout: 15000 });
    await expect(editor).toHaveValue(editedYaml);

    await page.getByRole('button', { name: /undo/i }).click();
    await page.getByTestId('confirm-button').click();
    await expect(editor).toHaveValue(/e2e\.headlamp\.dev\/external: 'true'/);
    await expect(editor).not.toHaveValue(/e2e\.headlamp\.dev\/unsaved/);

    const latestYaml = await editor.inputValue();
    const postUndoEdit = latestYaml.replace(
      'metadata:\n',
      'metadata:\n  annotations:\n    e2e.headlamp.dev/after-undo: "true"\n'
    );
    expect(postUndoEdit).not.toBe(latestYaml);
    await editor.fill(postUndoEdit);

    const saveButton = page.getByRole('button', { name: /save & apply/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText(`Applied changes to ${name}.`)).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => {
        const { stdout } = await execFileAsync('kubectl', [
          '--kubeconfig',
          kubeconfig,
          '--context=kind-test',
          '--namespace=default',
          'get',
          'configmap',
          name,
          '-o=json',
        ]);
        return JSON.parse(stdout).metadata.labels['e2e.headlamp.dev/external'];
      })
      .toBe('true');
  } finally {
    await kubectl(
      kubeconfig,
      '--namespace=default',
      'delete',
      'configmap',
      name,
      '--wait=false',
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
