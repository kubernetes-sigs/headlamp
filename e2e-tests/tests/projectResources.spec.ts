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

import { expect, Page, test } from '@playwright/test';
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
const configMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: { name: 'project-config', namespace: namespaceName, uid: 'project-config' },
};
const persistentVolumeClaim = {
  apiVersion: 'v1',
  kind: 'PersistentVolumeClaim',
  metadata: { name: 'project-storage', namespace: namespaceName, uid: 'project-storage' },
  spec: {},
  status: {},
};
const service = {
  apiVersion: 'v1',
  kind: 'Service',
  metadata: { name: 'project-service', namespace: namespaceName, uid: 'project-service' },
  spec: {},
  status: {},
};
const role = {
  apiVersion: 'rbac.authorization.k8s.io/v1',
  kind: 'Role',
  metadata: { name: 'project-role', namespace: namespaceName, uid: 'project-role' },
  rules: [],
};

const baseCollectionResponses: Record<
  string,
  { apiVersion: string; kind: string; items: object[] }
> = {
  namespaces: { apiVersion: 'v1', kind: 'NamespaceList', items: [namespace] },
  configmaps: { apiVersion: 'v1', kind: 'ConfigMapList', items: [] },
  endpoints: { apiVersion: 'v1', kind: 'EndpointsList', items: [] },
  endpointslices: { apiVersion: 'discovery.k8s.io/v1', kind: 'EndpointSliceList', items: [] },
  persistentvolumeclaims: {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaimList',
    items: [],
  },
  secrets: { apiVersion: 'v1', kind: 'SecretList', items: [] },
  services: { apiVersion: 'v1', kind: 'ServiceList', items: [] },
  statefulsets: { apiVersion: 'apps/v1', kind: 'StatefulSetList', items: [] },
  replicasets: { apiVersion: 'apps/v1', kind: 'ReplicaSetList', items: [] },
  deployments: { apiVersion: 'apps/v1', kind: 'DeploymentList', items: [deployment] },
  daemonsets: { apiVersion: 'apps/v1', kind: 'DaemonSetList', items: [] },
  jobs: { apiVersion: 'batch/v1', kind: 'JobList', items: [] },
  cronjobs: { apiVersion: 'batch/v1', kind: 'CronJobList', items: [] },
  ingresses: { apiVersion: 'networking.k8s.io/v1', kind: 'IngressList', items: [] },
  networkpolicies: {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicyList',
    items: [],
  },
  horizontalpodautoscalers: {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscalerList',
    items: [],
  },
  roles: { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleList', items: [] },
  rolebindings: {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBindingList',
    items: [],
  },
  resourcequotas: { apiVersion: 'v1', kind: 'ResourceQuotaList', items: [] },
  limitranges: { apiVersion: 'v1', kind: 'LimitRangeList', items: [] },
  applications: { apiVersion: 'argoproj.io/v1alpha1', kind: 'ApplicationList', items: [] },
};
const requiredCollections = new Set([
  'namespaces',
  'configmaps',
  'endpoints',
  'endpointslices',
  'persistentvolumeclaims',
  'secrets',
  'services',
  'statefulsets',
  'replicasets',
  'deployments',
  'daemonsets',
  'jobs',
  'cronjobs',
  'ingresses',
  'networkpolicies',
  'horizontalpodautoscalers',
  'roles',
  'rolebindings',
  'resourcequotas',
  'limitranges',
]);

/**
 * Creates deterministic Kubernetes collection responses for the project page.
 *
 * @param includeMultipleCategories Whether to populate resources across all category groups.
 * @returns Collection responses keyed by Kubernetes plural resource name.
 */
function projectCollectionResponses(includeMultipleCategories: boolean) {
  if (!includeMultipleCategories) {
    return baseCollectionResponses;
  }

  return {
    ...baseCollectionResponses,
    configmaps: { ...baseCollectionResponses.configmaps, items: [configMap] },
    persistentvolumeclaims: {
      ...baseCollectionResponses.persistentvolumeclaims,
      items: [persistentVolumeClaim],
    },
    services: { ...baseCollectionResponses.services, items: [service] },
    roles: { ...baseCollectionResponses.roles, items: [role] },
  };
}

/**
 * Mocks project collection requests and records unexpected API traffic.
 *
 * @param page Playwright page whose Kubernetes requests should be intercepted.
 * @param cluster Cluster name used in Headlamp API paths.
 * @param includeMultipleCategories Whether to populate every resource category.
 * @returns Request tracking used to wait for all project collections.
 */
async function mockProjectCollections(
  page: Page,
  cluster: string,
  includeMultipleCategories: boolean
) {
  const collectionResponses = projectCollectionResponses(includeMultipleCategories);
  const requestedCollections = new Set<string>();
  const unexpectedRequests: string[] = [];

  await page.route(new RegExp(`/clusters/${cluster}/apis?/`), async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== 'GET' || url.searchParams.get('watch') === '1') {
      await route.continue();
      return;
    }

    const resource = url.pathname.split('/').at(-1);
    const isProjectNamespaceList =
      resource === 'namespaces' &&
      url.searchParams.get('labelSelector') === `headlamp.dev/project-id=${projectName}`;
    const isProjectResourceCollection = url.pathname.includes(`/namespaces/${namespaceName}/`);
    if (!isProjectNamespaceList && !isProjectResourceCollection) {
      await route.continue();
      return;
    }

    const list = resource && collectionResponses[resource];
    if (!list) {
      const requestDescription = `${request.method()} ${url.pathname}${url.search}`;
      unexpectedRequests.push(requestDescription);
      await route.fulfill({
        status: 501,
        json: { message: `Unexpected project resource request: ${requestDescription}` },
      });
      return;
    }
    requestedCollections.add(resource);
    await route.fulfill({
      json: {
        ...list,
        metadata: { resourceVersion: '1' },
      },
    });
  });

  return { requestedCollections, unexpectedRequests };
}

test('keeps the project resources grid visible at 200% text zoom', async ({ page }) => {
  const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
  const token = process.env.HEADLAMP_TEST_TOKEN;
  if (!token) {
    test.skip(true, 'HEADLAMP_TEST_TOKEN is not set; cannot authenticate to Headlamp.');
  }
  const { requestedCollections, unexpectedRequests } = await mockProjectCollections(
    page,
    cluster,
    false
  );

  const shortViewport = { width: 640, height: 384 };
  await page.setViewportSize(shortViewport);
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster(cluster, token);
  await headlampPage.navigateTopage(`/project/${projectName}`);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  await page.getByRole('tab', { name: 'Resources' }).click();

  await expect
    .poll(() => [...requiredCollections].filter(item => !requestedCollections.has(item)))
    .toEqual([]);
  expect(unexpectedRequests, 'Project Resources made unexpected API requests').toEqual([]);

  const resourceGrid = page.getByTestId('project-resource-grid');
  const categoryList = resourceGrid.getByTestId('project-resource-categories');
  const categoryButton = categoryList.getByRole('button', { name: /^Workloads\b/ });

  await expect(resourceGrid).toBeVisible();
  await expect(categoryButton).toBeVisible();
  await expect(categoryList.getByRole('button')).toHaveCount(1);
  await expect
    .poll(() => resourceGrid.evaluate(element => element.getBoundingClientRect().height))
    .toBeGreaterThan(shortViewport.height);

  await categoryButton.click();
  const workload = resourceGrid.getByText('project-workload', { exact: true });
  await workload.scrollIntoViewIfNeeded();
  await expect(workload).toBeInViewport();
});

test('only scrolls project categories in short stacked layouts', async ({ page }) => {
  const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
  const token = process.env.HEADLAMP_TEST_TOKEN;
  if (!token) {
    test.skip(true, 'HEADLAMP_TEST_TOKEN is not set; cannot authenticate to Headlamp.');
  }
  const { requestedCollections, unexpectedRequests } = await mockProjectCollections(
    page,
    cluster,
    true
  );

  await page.setViewportSize({ width: 640, height: 384 });
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster(cluster, token);
  await headlampPage.navigateTopage(`/project/${projectName}`);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  await page.getByRole('tab', { name: 'Resources' }).click();

  await expect
    .poll(() => [...requiredCollections].filter(item => !requestedCollections.has(item)))
    .toEqual([]);
  expect(unexpectedRequests, 'Project Resources made unexpected API requests').toEqual([]);

  const categoryList = page
    .getByTestId('project-resource-grid')
    .getByTestId('project-resource-categories');
  await expect(categoryList.getByRole('button')).toHaveCount(5);
  await expect
    .poll(() => categoryList.evaluate(element => element.scrollHeight > element.clientHeight))
    .toBe(true);

  await page.setViewportSize({ width: 640, height: 900 });
  await expect
    .poll(() => categoryList.evaluate(element => element.scrollHeight > element.clientHeight))
    .toBe(false);
});
