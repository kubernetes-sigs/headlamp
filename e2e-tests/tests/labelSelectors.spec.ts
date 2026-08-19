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

const execFileAsync = promisify(execFile);
const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
const selector = 'environment in (production),tier in (frontend)';
const runID = `${process.pid}-${Date.now()}`;
const matchingPod = `selector-match-${runID}`;
const nonMatchingPod = `selector-miss-${runID}`;
const selectorService = `selector-service-${runID}`;
const serviceSelector = 'environment=production,tier=frontend';
let tempDirectory: string;
let kubeconfig: string;

async function kubectl(...args: string[]) {
  await execFileAsync('kubectl', ['--kubeconfig', kubeconfig, '--context=kind-test', ...args]);
}

async function openCluster(page: import('@playwright/test').Page) {
  const token = process.env.HEADLAMP_TEST_TOKEN;
  expect(token).toBeTruthy();

  const baseURL = process.env.HEADLAMP_TEST_URL || 'http://localhost:3000';
  const response = await page.request.post(`${baseURL}/clusters/${cluster}/set-token`, {
    data: { token },
  });
  expect(response.ok()).toBe(true);

  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateTopage(`/c/${cluster}`);
  return headlampPage;
}

function isPodListRequest(requestURL: string, expectedLimit: string) {
  const url = new URL(requestURL);
  return (
    url.pathname.startsWith(`/clusters/${cluster}/api/v1/`) &&
    url.pathname.endsWith('/pods') &&
    url.searchParams.get('labelSelector') === selector &&
    url.searchParams.get('limit') === expectedLimit
  );
}

test.describe.serial('label selectors', () => {
  test.beforeAll(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'headlamp-label-selector-e2e-'));
    kubeconfig = join(tempDirectory, 'kubeconfig');
    const { stdout } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
    await writeFile(kubeconfig, stdout);

    await kubectl(
      '--namespace=default',
      'run',
      matchingPod,
      '--image=registry.k8s.io/pause:3.10',
      '--restart=Never',
      '--labels=environment=production,tier=frontend'
    );
    await kubectl(
      '--namespace=default',
      'run',
      nonMatchingPod,
      '--image=registry.k8s.io/pause:3.10',
      '--restart=Never',
      '--labels=environment=staging,tier=frontend'
    );
    await kubectl(
      '--namespace=default',
      'create',
      'service',
      'clusterip',
      selectorService,
      '--tcp=80:80'
    );
    await kubectl(
      '--namespace=default',
      'patch',
      'service',
      selectorService,
      '--type=json',
      '-p',
      '[{"op":"replace","path":"/spec/selector","value":{"environment":"production","tier":"frontend"}}]'
    );
  });

  test.afterAll(async () => {
    if (!kubeconfig) return;

    await kubectl(
      '--namespace=default',
      'delete',
      'pod',
      matchingPod,
      nonMatchingPod,
      '--ignore-not-found=true',
      '--wait=false'
    )
      .catch(() => undefined)
      .then(() =>
        kubectl(
          '--namespace=default',
          'delete',
          'service',
          selectorService,
          '--ignore-not-found=true',
          '--wait=false'
        ).catch(() => undefined)
      )
      .finally(() => rm(tempDirectory, { recursive: true, force: true }));
  });

  test('validates and applies a set-based selector to the Pods list', async ({ page }) => {
    const headlampPage = await openCluster(page);
    await headlampPage.navigateTopage(`/c/${cluster}/pods`, /Pods/);

    await page.getByRole('button', { name: 'Filter resources' }).click();
    const selectorInput = page.getByRole('combobox', { name: 'Label Selector' });

    await selectorInput.fill('environment in (');
    await selectorInput.press('Enter');
    await expect(selectorInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page).not.toHaveURL(/labelSelector=/);

    const filteredRequest = page.waitForRequest(request => isPodListRequest(request.url(), '1000'));
    await selectorInput.fill(selector);
    await selectorInput.press('Enter');
    await filteredRequest;

    await expect(page).toHaveURL(url => url.searchParams.get('labelSelector') === selector);
    await expect(page.getByRole('button', { name: 'Edit Label Selector' })).toContainText(selector);
    await expect(page.getByRole('link', { name: matchingPod, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: nonMatchingPod, exact: true })).toHaveCount(0);
  });

  test('opens a filtered Pods list from a Pod label', async ({ page }) => {
    const headlampPage = await openCluster(page);
    await headlampPage.navigateTopage(`/c/${cluster}/pods/default/${matchingPod}`, /Pods/);

    const filteredRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return (
        url.pathname.startsWith(`/clusters/${cluster}/api/v1/`) &&
        url.pathname.endsWith('/pods') &&
        url.searchParams.get('labelSelector') === 'environment=production'
      );
    });
    await page.getByRole('link', { name: 'environment: production' }).click();
    await filteredRequest;

    await expect(page).toHaveURL(url => {
      return (
        url.pathname === `/c/${cluster}/pods` &&
        url.searchParams.get('labelSelector') === 'environment=production'
      );
    });
    await expect(page.getByRole('button', { name: 'Edit Label Selector' })).toContainText(
      'environment=production'
    );
    await expect(page.getByRole('link', { name: matchingPod, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: nonMatchingPod, exact: true })).toHaveCount(0);
  });

  test('opens matching Pods from a complete multi-key Service selector', async ({ page }) => {
    const headlampPage = await openCluster(page);
    await headlampPage.navigateTopage(`/c/${cluster}/services`, /Services/);
    await page.getByRole('link', { name: selectorService, exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `Service: ${selectorService}` })
    ).toBeVisible();

    await page.getByRole('link', { name: 'environment: production' }).click();

    await expect(page).toHaveURL(url => {
      return (
        url.pathname === `/c/${cluster}/pods` &&
        url.searchParams.get('labelSelector') === serviceSelector
      );
    });
    await expect(page.getByRole('button', { name: 'Edit Label Selector' })).toContainText(
      serviceSelector
    );
    await expect(page.getByRole('link', { name: matchingPod, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: nonMatchingPod, exact: true })).toHaveCount(0);
  });

  test('searches selectors server-side and opens the filtered Pods list', async ({ page }) => {
    const headlampPage = await openCluster(page);
    await headlampPage.navigateTopage(`/c/${cluster}/pods`, /Pods/);

    await page.keyboard.press('/');
    const searchInput = page.getByPlaceholder(
      'Search resources, pages, clusters, or label selectors'
    );
    await expect(searchInput).toBeVisible();

    const selectorProbe = page.waitForRequest(request => isPodListRequest(request.url(), '1'));
    await searchInput.fill(selector);
    await selectorProbe;

    const result = page.getByText(`Pods ${selector}`, { exact: true });
    await expect(result).toBeVisible();

    const podRequests: string[] = [];
    const recordPodRequest = (request: import('@playwright/test').Request) => {
      if (new URL(request.url()).pathname.endsWith('/pods')) {
        podRequests.push(request.url());
      }
    };
    page.on('request', recordPodRequest);
    await result.click();

    await expect(page).toHaveURL(url => {
      return (
        url.pathname === `/c/${cluster}/pods` && url.searchParams.get('labelSelector') === selector
      );
    });
    await expect(page.getByRole('link', { name: matchingPod, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: nonMatchingPod, exact: true })).toHaveCount(0);
    await expect
      .poll(() => podRequests.some(requestURL => isPodListRequest(requestURL, '1000')), {
        message: `Expected a filtered Pod list request. Saw: ${podRequests.join(', ')}`,
        timeout: 5000,
      })
      .toBe(true);
    page.off('request', recordPodRequest);
  });
});
