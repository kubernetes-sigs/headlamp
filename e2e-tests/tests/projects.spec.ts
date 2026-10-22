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

test.describe('global Projects navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sidebar', JSON.stringify({ shrink: false }));
    });
    await page.route('**/config', route =>
      route.fulfill({
        json: {
          clusters: ['cluster-a', 'cluster-b'].map(name => ({
            name,
            auth_type: '',
            useToken: false,
          })),
        },
      })
    );
    await page.route('**/plugins', route => route.fulfill({ json: [] }));
    await page.route('**/clusters/**', async route => {
      const url = new URL(route.request().url());
      const [cluster, ...parts] = url.pathname.split('/clusters/')[1].split('/');
      const path = '/' + parts.join('/');

      if (path === '/api') {
        await route.fulfill({
          json: {
            items: [
              {
                metadata: {},
                versions: [
                  {
                    version: 'v1',
                    resources: [
                      {
                        resource: 'namespaces',
                        verbs: ['get', 'list'],
                        responseKind: { kind: 'Namespace' },
                        scope: 'Cluster',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });
        return;
      }

      if (path === '/version') {
        await route.fulfill({ json: { major: '1', minor: '35', gitVersion: 'v1.35.0' } });
        return;
      }

      if (path === '/api/v1/namespaces') {
        const project = cluster === 'cluster-a' ? 'project-a' : 'project-b';
        const selector = url.searchParams.get('labelSelector');
        const matches =
          !selector ||
          selector === PROJECT_ID_LABEL ||
          selector === `${PROJECT_ID_LABEL}=${project}`;
        await route.fulfill({
          json: {
            apiVersion: 'v1',
            kind: 'NamespaceList',
            metadata: { resourceVersion: '1' },
            items: matches
              ? [
                  {
                    apiVersion: 'v1',
                    kind: 'Namespace',
                    metadata: {
                      name: `${project}-namespace`,
                      labels: { [PROJECT_ID_LABEL]: project },
                      resourceVersion: '1',
                    },
                    status: { phase: 'Active' },
                  },
                ]
              : [],
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          apiVersion: 'v1',
          kind: 'List',
          metadata: { resourceVersion: '1' },
          items: [],
        },
      });
    });
  });

  test('opens cross-cluster projects from the sidebar and keeps details selected', async ({
    page,
  }) => {
    await page.goto('/c/cluster-a/namespaces');
    const navigation = page.getByRole('navigation', { name: 'Navigation', exact: true });
    const entries = navigation.locator('ul').first().locator(':scope > li > a');
    await expect(entries.nth(0)).toHaveText('Home');
    await expect(entries.nth(1)).toHaveText('Projects');
    await expect(entries.nth(2)).toContainText('Clusters');

    await navigation.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(navigation.getByRole('button', { name: 'Projects', exact: true })).toHaveClass(
      /Mui-selected/
    );
    await expect(page.getByRole('link', { name: 'project-a', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'project-b', exact: true }).click();
    await expect(page).toHaveURL(/\/project\/project-b(?:\?|$)/);
    await expect(navigation.getByRole('button', { name: 'Projects', exact: true })).toHaveClass(
      /Mui-selected/
    );

    await page.reload();
    await expect(navigation.getByRole('button', { name: 'Projects', exact: true })).toHaveClass(
      /Mui-selected/
    );
    await navigation.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('tab', { name: 'Projects', exact: true }).click();
    await expect(page.getByRole('link', { name: 'project-b', exact: true })).toBeVisible();
  });

  test('opens global projects even when another cluster rejects authentication', async ({
    page,
  }) => {
    await page.route('**/clusters/cluster-a/**', route =>
      route.fulfill({
        status: 401,
        json: {
          apiVersion: 'v1',
          kind: 'Status',
          status: 'Failure',
          reason: 'Unauthorized',
          code: 401,
        },
      })
    );
    await page.goto('/projects');
    await expect(page.getByRole('link', { name: 'project-b', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(
      page
        .getByRole('navigation', { name: 'Navigation', exact: true })
        .getByRole('button', { name: 'Projects', exact: true })
    ).toHaveClass(/Mui-selected/);
  });
});

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

test('replaces a built-in project creation choice', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
  await headlampPage.navigateTopage('/');
  await page.getByRole('tab', { name: 'Projects' }).click();

  await page.getByRole('button', { name: 'Create Project' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create a Project' })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: /Deploy Custom project Custom way to create resources/ })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: /New Project Create a new project/ })
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('button', {
      name: /New Project from YAML Deploy a new application from YAML/,
    })
  ).toBeVisible();

  await dialog
    .getByRole('button', { name: /Deploy Custom project Custom way to create resources/ })
    .click();
  await expect(dialog.getByRole('heading', { name: 'Your custom creator' })).toBeVisible();
  await dialog.getByRole('textbox').press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Create Project' }).click();

  await dialog
    .getByRole('button', {
      name: /New Project from YAML Deploy a new application from YAML/,
    })
    .click();
  await expect(page).toHaveURL(/\/project\/create-yaml$/);
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
