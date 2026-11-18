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
import { HeadlampPage } from './headlampPage';

// By default this checks that the Devices section is hidden, since the CI cluster does not
// serve the resource.k8s.io/v1 API. To test the Devices pages instead, run it against a
// cluster with a DRA driver, such as the dra-example-driver kind cluster with its example
// workloads applied, and set HEADLAMP_TEST_DRA=true. Set HEADLAMP_TEST_DRA_CLUSTER to the
// cluster's name in Headlamp if it is not "test".
const clusterName = process.env.HEADLAMP_TEST_DRA_CLUSTER || 'test';
const draEnabled = process.env.HEADLAMP_TEST_DRA === 'true';

let headlampPage: HeadlampPage;

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster(clusterName, process.env.HEADLAMP_TEST_TOKEN);
});

test.describe('Devices section without the DRA API', () => {
  test.skip(draEnabled, 'HEADLAMP_TEST_DRA=true means the cluster serves the DRA API');

  test('is hidden from the sidebar', async ({ page }) => {
    // The section shows once Headlamp has asked the cluster for the DRA API, so wait for
    // that answer before checking, or the section could still be on its way.
    const probe = page.waitForResponse(response =>
      response.url().endsWith(`/clusters/${clusterName}/apis/resource.k8s.io/v1`)
    );
    await page.reload();
    await (await probe).finished();
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );

    await headlampPage.hasNetworkTab();
    await expect(page.getByRole('button', { name: 'Devices (alpha)' })).toHaveCount(0);
  });
});

test.describe('Devices section with the DRA API', () => {
  test.skip(!draEnabled, 'Set HEADLAMP_TEST_DRA=true to run against a cluster with a DRA driver');

  const pages = [
    {
      link: 'Device Classes',
      path: 'deviceclasses',
      headers: ['Name', 'Selectors', 'Drivers', 'Extended Resource', 'Age'],
    },
    {
      link: 'Resource Claims',
      path: 'resourceclaims',
      headers: ['Name', 'Namespace', 'Status', 'Device Classes', 'Devices', 'Node', 'Age'],
    },
    {
      link: 'Resource Claim Templates',
      path: 'resourceclaimtemplates',
      headers: ['Name', 'Namespace', 'Requests', 'Device Classes', 'Age'],
    },
    {
      link: 'Resource Slices',
      path: 'resourceslices',
      headers: ['Name', 'Driver', 'Pool', 'Node', 'Devices', 'Age'],
    },
  ];

  test('shows the section and its pages in the sidebar', async ({ page }) => {
    const devices = page.getByRole('button', { name: 'Devices (alpha)' });
    await expect(devices).toBeVisible();
    await devices.click();

    for (const { link } of pages) {
      await expect(page.getByRole('button', { name: link, exact: true })).toBeVisible();
    }
  });

  for (const { link, path, headers } of pages) {
    test(`lists the ${link}`, async ({ page }) => {
      await headlampPage.navigateTopage(`/c/${clusterName}/${path}`);

      await expect(page.getByRole('heading', { name: link, exact: true })).toBeVisible();
      await expect(page.locator('table')).toBeVisible();
      await headlampPage.tableHasHeaders('table', headers);
    });
  }

  test('opens a device class from the list', async ({ page }) => {
    await headlampPage.navigateTopage(`/c/${clusterName}/deviceclasses`);

    const firstClass = page.locator('table tbody tr').first().getByRole('link').first();
    const name = (await firstClass.textContent())?.trim() ?? '';
    await page.getByRole('link', { name, exact: true }).click();

    await expect(page.getByRole('heading', { name: `DeviceClass: ${name}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Selectors', level: 2 })).toBeVisible();
  });

  test('shows the device a claim got', async ({ page }) => {
    await headlampPage.navigateTopage(`/c/${clusterName}/resourceclaims`);

    const allocatedRow = page
      .locator('table tbody tr')
      .filter({ hasText: /In use by|Allocated/ })
      .first();
    await allocatedRow.getByRole('link').first().click();

    await expect(page.getByRole('heading', { name: 'Allocated Devices', level: 2 })).toBeVisible();
  });
});
