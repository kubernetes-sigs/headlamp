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

type DrainRequest = {
  method: string;
  path: string;
  cookieNames: string[];
};

test('node drain uses cluster-scoped routes with the cluster auth cookie', async ({ page }) => {
  const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
  const token = process.env.HEADLAMP_TEST_TOKEN;
  if (!token) {
    throw new Error('HEADLAMP_TEST_TOKEN is required for the node drain e2e test');
  }
  const testURL = new URL(process.env.HEADLAMP_TEST_URL || 'http://localhost:3000');
  const basePath =
    testURL.pathname === '/' ? '' : `/${testURL.pathname.split('/').filter(Boolean).join('/')}`;
  const clusterPath = `${basePath}/clusters/${cluster}`;
  await page.context().addCookies([
    {
      name: `headlamp-auth-${cluster}.0`,
      value: token,
      domain: testURL.hostname,
      path: clusterPath,
      httpOnly: true,
      secure: testURL.protocol === 'https:',
      sameSite: 'Strict',
    },
  ]);

  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateTopage(`/c/${cluster}/nodes`);
  await expect(page).toHaveTitle(/Nodes/);

  const nodesTable = page.getByRole('table');
  await expect(nodesTable).toBeVisible();
  const nodeRows = nodesTable.locator('tbody > tr');
  expect(await nodeRows.count(), 'expected at least one node in the test cluster').toBeGreaterThan(
    0
  );
  const nodeLink = nodeRows.first().getByRole('link').first();
  await expect(nodeLink).toBeVisible();
  const nodeName = (await nodeLink.textContent())?.trim();
  expect(nodeName).toBeTruthy();

  const authCookie = (await page.context().cookies()).find(
    cookie => cookie.name === `headlamp-auth-${cluster}.0`
  );
  expect(authCookie, 'expected cluster authentication to set its scoped cookie').toMatchObject({
    httpOnly: true,
    path: clusterPath,
    sameSite: 'Strict',
  });

  const drainRequests: DrainRequest[] = [];
  // Match both forms so the assertions below expose a regression to the old unscoped URLs.
  await page.route('**/*drain-node*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    drainRequests.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      cookieNames: (request.headers().cookie ?? '')
        .split(';')
        .map(cookie => cookie.trim().split('=', 1)[0])
        .filter(Boolean),
    });

    if (url.pathname.endsWith('/drain-node-status')) {
      await route.fulfill({ json: { id: 'success', cluster } });
      return;
    }

    await route.fulfill({ json: { message: 'Drain node request submitted successfully' } });
  });

  await nodeLink.click();
  const assistantDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Configure AI Assistant' }),
  });
  if (await assistantDialog.isVisible()) {
    await assistantDialog.getByRole('button', { name: 'Dismiss configuration prompt' }).click();
    await expect(assistantDialog).toBeHidden();
  }

  const drainButton = page.getByRole('button', { name: 'Drain' });
  await expect(drainButton).toBeVisible();
  await drainButton.click();
  await expect(page.getByRole('dialog', { name: 'Drain Node' })).toBeVisible();
  await page.getByTestId('confirm-button').click();

  await expect.poll(() => drainRequests.length, { timeout: 10_000 }).toBe(2);
  expect(drainRequests).toEqual([
    {
      method: 'POST',
      path: `${clusterPath}/drain-node`,
      cookieNames: expect.arrayContaining([authCookie!.name]),
    },
    {
      method: 'GET',
      path: `${clusterPath}/drain-node-status?nodeName=${nodeName}`,
      cookieNames: expect.arrayContaining([authCookie!.name]),
    },
  ]);
});
