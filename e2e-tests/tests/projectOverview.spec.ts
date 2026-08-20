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

test('project overview displays only enabled plugin sections', async ({ page }) => {
  const token = process.env.HEADLAMP_TEST_TOKEN;
  test.skip(!token, 'HEADLAMP_TEST_TOKEN is required to create the project fixture.');

  const projectName = `conditional-overview-${Date.now()}`;
  const namespacePath = `/clusters/test/api/v1/namespaces/${projectName}`;
  const headers = { Authorization: `Bearer ${token}` };
  const headlampPage = new HeadlampPage(page);

  await page.route(
    `**/clusters/test/apis/argoproj.io/v1alpha1/namespaces/${projectName}/applications*`,
    async route => {
      await route.fulfill({
        json: {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'ApplicationList',
          metadata: { resourceVersion: '1' },
          items: [],
        },
      });
    }
  );

  await headlampPage.navigateToCluster('test', token);

  const createResponse = await page.request.post('/clusters/test/api/v1/namespaces', {
    headers,
    data: {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: projectName,
        labels: { 'headlamp.dev/project-id': projectName },
      },
    },
  });
  expect(createResponse.status()).toBe(201);

  try {
    await headlampPage.navigateTopage(`/project/${projectName}`, /Project Details/);

    await expect(page.getByRole('progressbar', { name: 'Loading' })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByText(`Custom resource usage for project ${projectName}`)).toBeVisible();
    await expect(page.getByText(`Multi-cluster project: ${projectName}`)).toHaveCount(0);
  } finally {
    const deleteResponse = await page.request.delete(namespacePath, { headers });
    expect(deleteResponse.ok()).toBe(true);
  }
});

test('project overview renders plugin section cards', async ({ page }) => {
  const token = process.env.HEADLAMP_TEST_TOKEN;
  test.skip(!token, 'HEADLAMP_TEST_TOKEN is required to create the project fixture.');

  const projectName = `project-overview-${Date.now()}`;
  const namespacePath = `/clusters/test/api/v1/namespaces/${projectName}`;
  const headers = { Authorization: `Bearer ${token}` };
  const headlampPage = new HeadlampPage(page);

  await page.route(
    `**/clusters/test/apis/argoproj.io/v1alpha1/namespaces/${projectName}/applications*`,
    async route => {
      await route.fulfill({
        json: {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'ApplicationList',
          metadata: { resourceVersion: '1' },
          items: [],
        },
      });
    }
  );

  await headlampPage.navigateToCluster('test', token);

  const createResponse = await page.request.post('/clusters/test/api/v1/namespaces', {
    headers,
    data: {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: projectName,
        labels: { 'headlamp.dev/project-id': projectName },
      },
    },
  });
  expect(createResponse.status()).toBe(201);

  try {
    await headlampPage.navigateTopage(`/project/${projectName}`, /Project Details/);

    await expect(page.getByRole('progressbar', { name: 'Loading' })).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByText(`Custom resource usage for project ${projectName}`)).toBeVisible();

    const emptySection = page.locator(
      '.MuiGrid-item:has(> .MuiCard-root > .MuiCardContent-root:empty)'
    );
    await expect(emptySection).toHaveCount(1);
    await expect(emptySection).toBeHidden();
  } finally {
    const deleteResponse = await page.request.delete(namespacePath, { headers });
    expect(deleteResponse.ok()).toBe(true);
  }
});