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

const namespace = {
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: 'resize-test',
    uid: 'resize-test-namespace',
    resourceVersion: '1',
  },
  status: { phase: 'Active' },
};

const longPodName = 'resize-test-pod-with-a-long-name-that-needs-to-wrap';

const pods = Array.from({ length: 1001 }, (_, index) => ({
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: {
    name: index === 0 ? longPodName : `resize-test-pod-${index}`,
    namespace: namespace.metadata.name,
    uid: index === 0 ? longPodName : `resize-test-pod-${index}`,
    resourceVersion: String(index + 1),
  },
  spec: {
    nodeName: 'worker-1',
  },
  status: {
    phase: 'Running',
    conditions: [{ type: 'Ready', status: 'True' }],
  },
}));

const groupingPods = pods.slice(0, 4).map((pod, index) => ({
  ...pod,
  spec: index < 2 ? {} : { nodeName: 'worker-1' },
  status:
    index < 2
      ? {
          phase: 'Pending',
          conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable' }],
        }
      : pod.status,
}));

const emptyCollections: Record<string, string> = {
  cronjobs: 'CronJob',
  daemonsets: 'DaemonSet',
  deployments: 'Deployment',
  endpoints: 'Endpoints',
  endpointslices: 'EndpointSlice',
  ingresses: 'Ingress',
  ingressclasses: 'IngressClass',
  jobs: 'Job',
  jobsets: 'JobSet',
  networkpolicies: 'NetworkPolicy',
  nodes: 'Node',
  persistentvolumeclaims: 'PersistentVolumeClaim',
  replicasets: 'ReplicaSet',
  services: 'Service',
  statefulsets: 'StatefulSet',
};

function list(kind: string, items: unknown[]) {
  return {
    apiVersion: 'v1',
    kind: `${kind}List`,
    metadata: { resourceVersion: '1' },
    items,
  };
}

/**
 * Mocks the Kubernetes collections used by Resource Map scenarios.
 *
 * @param page - Playwright page whose Kubernetes requests should be mocked.
 * @param cluster - Cluster name included in Headlamp API request paths.
 * @param podItems - Pods returned by the mocked collection endpoint.
 * @returns Resource names requested while the scenario runs.
 */
async function mockResourceMapCollections(page: Page, cluster: string, podItems: unknown[] = pods) {
  const mockedResources = new Set<string>();
  await page.route(new RegExp(`/clusters/${cluster}/apis?/`), async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== 'GET' || url.searchParams.get('watch') === '1') {
      await route.continue();
      return;
    }

    const resource = url.pathname.split('/').at(-1);
    if (resource === 'namespaces') {
      mockedResources.add(resource);
      await route.fulfill({ json: list('Namespace', [namespace]) });
      return;
    }
    if (resource === 'pods') {
      mockedResources.add(resource);
      await route.fulfill({ json: list('Pod', podItems) });
      return;
    }
    if (resource === 'customresourcedefinitions') {
      await route.fulfill({ json: list('CustomResourceDefinition', []) });
      return;
    }
    const kind = resource && emptyCollections[resource];
    if (kind) {
      await route.fulfill({ json: list(kind, []) });
      return;
    }

    await route.continue();
  });

  return mockedResources;
}

test('keeps a simplified namespace expanded while resizing', async ({ page }) => {
  test.setTimeout(60_000);
  const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
  const headlampPage = new HeadlampPage(page);
  const mockedResources = await mockResourceMapCollections(page, cluster);
  await headlampPage.navigateToCluster(cluster, process.env.HEADLAMP_TEST_TOKEN);

  await headlampPage.navigateTopage(`/c/${cluster}/map`);

  await expect.poll(() => [...mockedResources].sort()).toEqual(['namespaces', 'pods']);

  const namespaceNode = page.locator(`[data-id="${namespace.metadata.uid}"]`);
  await expect(namespaceNode).toBeVisible({ timeout: 30_000 });
  await namespaceNode.getByRole('button').click();

  const assertExpandedTopology = async () => {
    const parent = page.locator(`.react-flow__node.parent[data-id="${namespace.metadata.uid}"]`);
    const children = page.locator(`.react-flow__node[data-id^="resize-test-pod-"]:not(.parent)`);

    await expect(parent).toHaveCount(1);
    await expect(children).toHaveCount(500);
  };

  await assertExpandedTopology();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1200, height: 800 },
    { width: 600, height: 500 },
    { width: 1200, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await assertExpandedTopology();
  }
});

test('groups scheduled and unscheduled pods by node', async ({ page }) => {
  test.setTimeout(60_000);
  const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
  const headlampPage = new HeadlampPage(page);
  const mockedResources = await mockResourceMapCollections(page, cluster, groupingPods);
  await headlampPage.navigateToCluster(cluster, process.env.HEADLAMP_TEST_TOKEN);

  await headlampPage.navigateTopage(`/c/${cluster}/map`);

  await expect.poll(() => [...mockedResources].sort()).toEqual(['namespaces', 'pods']);
  await page.getByRole('button', { name: 'Node', exact: true }).click();

  await expect(page.locator('[data-id="Node-worker-1"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-id="Node-Unscheduled"]')).toBeVisible();
});

test('reflows long resource labels without clipping', async ({ page }) => {
  test.setTimeout(60_000);
  const cluster = process.env.HEADLAMP_TEST_CLUSTER || 'test';
  const headlampPage = new HeadlampPage(page);
  await mockResourceMapCollections(page, cluster);
  await headlampPage.navigateToCluster(cluster, process.env.HEADLAMP_TEST_TOKEN);

  await headlampPage.navigateTopage(`/c/${cluster}/map`);

  const namespaceNode = page.locator(`[data-id="${namespace.metadata.uid}"]`);
  await expect(namespaceNode).toBeVisible({ timeout: 30_000 });
  await namespaceNode.getByRole('button').click();

  const podNode = page.locator(`[data-id="${longPodName}"]`);
  const button = podNode.getByRole('button');
  const label = button.getByText(longPodName);
  await expect(label).toBeVisible({ timeout: 30_000 });
  await button.focus();

  await expect(label).toHaveCSS('white-space', 'normal');
  await expect(label).toHaveCSS('word-break', 'break-word');
  await expect(label.locator('..')).toHaveCSS('overflow', 'visible');
  await expect(label.locator('../..')).toHaveCSS('min-height', '48px');
});
