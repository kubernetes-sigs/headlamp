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

const projectName = 'high-zoom-project';
const namespaceName = 'high-zoom-namespace';
const namespace = {
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: namespaceName,
    uid: namespaceName,
    resourceVersion: '1',
    labels: { 'headlamp.dev/project-id': projectName },
  },
  status: { phase: 'Active' },
};
const deployment = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: {
    name: 'project-workload',
    namespace: namespaceName,
    uid: 'project-workload',
    resourceVersion: '1',
  },
  spec: { replicas: 1, template: { spec: { containers: [] } } },
  status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
};

test('keeps the project resources grid visible at high zoom', async ({ page }) => {
  const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';

  await page.route(new RegExp(`/clusters/${cluster}/apis?/`), async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }

    const resource = url.pathname.split('/').at(-1);
    const list =
      resource === 'namespaces'
        ? { apiVersion: 'v1', kind: 'NamespaceList', items: [namespace] }
        : resource === 'deployments'
        ? { apiVersion: 'apps/v1', kind: 'DeploymentList', items: [deployment] }
        : { apiVersion: 'v1', kind: 'List', items: [] };
    await route.fulfill({
      json: {
        ...list,
        metadata: { resourceVersion: '1' },
      },
    });
  });

  await page.setViewportSize({ width: 640, height: 450 });
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster(cluster, process.env.HEADLAMP_TEST_TOKEN);
  await headlampPage.navigateTopage(`/project/${projectName}`);
  await page.getByRole('tab', { name: 'Resources' }).click();

  const categoryButton = page.getByRole('button', { name: /Workloads/ });
  const categoryList = categoryButton.locator('xpath=../../..');
  const resourceGrid = categoryButton.locator('xpath=../../../..');

  await expect(categoryButton).toBeVisible();
  await categoryButton.click();
  await expect(page.getByText('project-workload')).toBeVisible();
  await expect(resourceGrid).toHaveCSS('min-height', '300px');
  await expect(categoryList).toHaveCSS('max-height', '200px');
  await expect(categoryList).toHaveCSS('overflow-y', 'auto');
});
