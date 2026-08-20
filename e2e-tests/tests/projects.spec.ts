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

const PROJECT_ID_LABEL = 'headlamp.dev/project-id';

test.describe('project header actions', () => {
  let projectName: string;
  let namespaceCreated = false;

  test.beforeEach(async ({ page }, testInfo) => {
    const headlampPage = new HeadlampPage(page);
    const token = process.env.HEADLAMP_TEST_TOKEN;
    projectName = `header-action-e2e-${testInfo.workerIndex}-${Date.now()}`;
    namespaceCreated = false;

    await page.route('**/apis/argoproj.io/v1alpha1/namespaces/*/applications*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'ApplicationList',
          metadata: {},
          items: [],
        }),
      })
    );

    await headlampPage.navigateToCluster('test', token);
    await headlampPage.navigateToCluster('test2', process.env.HEADLAMP_TEST2_TOKEN);

    const response = await page.request.post('/clusters/test/api/v1/namespaces', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: projectName,
          labels: { [PROJECT_ID_LABEL]: projectName },
        },
      },
    });

    namespaceCreated = response.status() === 201;
    expect([201, 409]).toContain(response.status());
  });

  test.afterEach(async ({ page }) => {
    if (!namespaceCreated) {
      return;
    }

    const response = await page.request.delete(`/clusters/test/api/v1/namespaces/${projectName}`, {
      headers: { Authorization: `Bearer ${process.env.HEADLAMP_TEST_TOKEN}` },
    });

    expect([200, 202, 404]).toContain(response.status());
  });

  test('project header action selects a registered tab', async ({ page }) => {
    const headlampPage = new HeadlampPage(page);
    await headlampPage.navigateTopage(`/project/${projectName}`, /Project Details/);

    const metricsTab = page.getByRole('tab', { name: 'Metrics' });
    await expect(metricsTab).toHaveAttribute('aria-selected', 'false');

    await page.getByRole('button', { name: 'Custom Action' }).click();

    await expect(metricsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(`Metrics for project ${projectName}`)).toBeVisible();
  });
});

test('opens a project created from a labelled namespace', async ({ page }) => {
  const namespaceName = 'testing-e2e-project';
  const projectName = 'testing-e2e';
  const headlampPage = new HeadlampPage(page);
  const namespacesPage = new NamespacesPage(page);

  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const content = await page.content();
  test.skip(
    !content.includes('Namespaces') || !content.includes('href="/c/test/namespaces'),
    'Namespace permissions are required for this test'
  );

  await namespacesPage.navigateToNamespaces();
  const setupStatus = await namespacesPage.createNamespace(namespaceName, {
    [PROJECT_ID_LABEL]: projectName,
  });

  try {
    await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
    await page.getByRole('tab', { name: 'Projects' }).click();

    const projectLink = page.getByRole('link', { name: projectName, exact: true });
    await expect(projectLink).toBeVisible();
    await expect(projectLink).toHaveAttribute('href', `/project/${projectName}`);
    await projectLink.click();

    await expect(page).toHaveURL(new RegExp(`/project/${projectName}$`));
    await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible();
  } finally {
    if (setupStatus === 'created') {
      await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
      await namespacesPage.navigateToNamespaces();
      await namespacesPage.deleteNamespace(namespaceName);
    }
  }
});
