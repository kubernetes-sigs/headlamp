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
import { NamespacesPage } from './namespacesPage';

test('lists allowed namespaces without cluster-wide namespace access', async ({ page }) => {
  const allowedNamespaces = ['team-a', 'team-b'];
  const namespaceRequests: string[] = [];
  const namespaceWebSockets: string[] = [];

  await page.addInitScript(namespaces => {
    window.localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespaces: namespaces })
    );
  }, allowedNamespaces);
  page.on('websocket', socket => {
    if (socket.url().includes('/api/v1/namespaces')) {
      namespaceWebSockets.push(socket.url());
    }
  });
  await page.route('**/clusters/test/api/v1/namespaces**', async route => {
    const url = new URL(route.request().url());
    namespaceRequests.push(`${url.pathname}${url.search}`);
    const name = allowedNamespaces.find(namespace =>
      url.pathname.endsWith(`/namespaces/${namespace}`)
    );

    if (!name) {
      await route.fulfill({ status: 403, json: { message: 'namespace list is forbidden' } });
      return;
    }

    await route.fulfill({
      json: {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name,
          resourceVersion: '1',
          creationTimestamp: '2026-01-01T00:00:00Z',
        },
        status: { phase: 'Active' },
      },
    });
  });

  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  for (const namespace of allowedNamespaces) {
    await expect
      .poll(() => namespaceRequests.some(request => request.endsWith(`/namespaces/${namespace}`)))
      .toBe(true);
  }
  expect(namespaceRequests.some(request => /\/namespaces(?:\?|$)/.test(request))).toBe(false);
  expect(namespaceWebSockets).toEqual([]);
});

test('create a namespace with the minimal editor then delete it', async ({ page }) => {
  const name = 'testing-e2e';
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const content = await page.content();
  test.skip(
    !content.includes('Namespaces') || !content.includes('href="/c/test/namespaces'),
    'Namespace permissions are required for this test'
  );

  const namespacesPage = new NamespacesPage(page);
  await namespacesPage.navigateToNamespaces();
  await namespacesPage.a11y();

  const setupStatus = await namespacesPage.createNamespace(name);
  try {
    await namespacesPage.a11y();
  } finally {
    if (setupStatus === 'created') {
      await namespacesPage.deleteNamespace(name);
      await namespacesPage.a11y();
    }
  }
});
