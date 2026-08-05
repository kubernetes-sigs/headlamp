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

const projectName = 'header-action-e2e';
const namespacePath = `/clusters/test/api/v1/namespaces/${projectName}`;

test.beforeEach(async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  const token = process.env.HEADLAMP_TEST_TOKEN;
  await headlampPage.navigateToCluster('test', token);

  const response = await page.request.post('/clusters/test/api/v1/namespaces', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: projectName,
        labels: { 'headlamp.dev/project-id': projectName },
      },
    },
  });

  expect([201, 409]).toContain(response.status());
});

test.afterEach(async ({ page }) => {
  const response = await page.request.delete(namespacePath, {
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
