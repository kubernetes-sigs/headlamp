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

test('opens a project created from a labelled namespace', async ({ page }, testInfo) => {
  const token = process.env.HEADLAMP_TEST_TOKEN;
  test.skip(!token, 'HEADLAMP_TEST_TOKEN is required to create the project fixture.');

  // The namespace is created through the API because the sidebar example plugin removes the
  // Namespaces page from the CI deployment.
  const projectName = `labelled-project-${testInfo.workerIndex}-${Date.now()}`;
  const namespaceName = `${projectName}-namespace`;
  const namespacePath = `/clusters/test/api/v1/namespaces/${namespaceName}`;
  const headers = { Authorization: `Bearer ${token}` };
  const headlampPage = new HeadlampPage(page);

  await headlampPage.navigateToCluster('test', token);

  const createResponse = await page.request.post('/clusters/test/api/v1/namespaces', {
    headers,
    data: {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: namespaceName, labels: { [PROJECT_ID_LABEL]: projectName } },
    },
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);

  try {
    await headlampPage.navigateTopage('/');
    await page.getByRole('tab', { name: 'Projects' }).click();

    const projectLink = page.getByRole('link', { name: projectName, exact: true });
    await expect(projectLink).toBeVisible();
    // The projects example plugin adds a per-cluster projectKey query to project links.
    const projectPath = new RegExp(`/project/${projectName}(\\?|$)`);
    await expect(projectLink).toHaveAttribute('href', projectPath);
    await projectLink.click();

    await expect(page).toHaveURL(projectPath);
    // Opening a project from the home list takes several seconds to load its resources.
    await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    const deleteResponse = await page.request.delete(namespacePath, { headers });
    expect(deleteResponse.ok()).toBe(true);
  }
});
