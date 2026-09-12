/*
 * Copyright 2026 The Kubernetes Authors
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

const appsWorkloads = [
  {
    resource: 'daemonsets',
    kind: 'DaemonSet',
    name: 'logging-agent',
    title: / - DaemonSets - .+$/,
    spec: {
      selector: { matchLabels: { app: 'logging-agent' } },
      template: {
        metadata: { labels: { app: 'logging-agent' } },
        spec: {
          containers: [{ name: 'log-collector', image: 'fluent-bit:3.2' }],
          nodeSelector: { 'kubernetes.io/os': 'linux' },
        },
      },
    },
    status: {
      currentNumberScheduled: 1,
      desiredNumberScheduled: 1,
      numberAvailable: 1,
      numberReady: 1,
    },
    expectedText: 'kubernetes.io/os: linux',
  },
  {
    resource: 'deployments',
    kind: 'Deployment',
    name: 'web-server',
    title: / - Deployments - .+$/,
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'web-server' } },
      template: {
        metadata: { labels: { app: 'web-server' } },
        spec: { containers: [{ name: 'server', image: 'nginx:1.27' }] },
      },
    },
    status: {
      availableReplicas: 1,
      conditions: [{ type: 'Available', status: 'True', message: 'Deployment is available' }],
      readyReplicas: 1,
      replicas: 1,
      updatedReplicas: 1,
    },
    expectedText: 'Available',
  },
  {
    resource: 'replicasets',
    kind: 'ReplicaSet',
    name: 'web-server-replica',
    title: / - ReplicaSets - .+$/,
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'web-server-replica' } },
      template: {
        metadata: { labels: { app: 'web-server-replica' } },
        spec: { containers: [{ name: 'replica-server', image: 'nginx:1.27-alpine' }] },
      },
    },
    status: {
      availableReplicas: 1,
      fullyLabeledReplicas: 1,
      readyReplicas: 1,
      replicas: 1,
    },
    expectedText: 'replica-server',
  },
  {
    resource: 'statefulsets',
    kind: 'StatefulSet',
    name: 'database',
    title: / - StatefulSets - .+$/,
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'database' } },
      serviceName: 'database',
      template: {
        metadata: { labels: { app: 'database' } },
        spec: { containers: [{ name: 'postgres', image: 'postgres:17' }] },
      },
    },
    status: {
      currentReplicas: 1,
      currentRevision: 'database-1',
      readyReplicas: 1,
      replicas: 1,
      updateRevision: 'database-1',
      updatedReplicas: 1,
    },
    expectedText: '1/1',
  },
];

const batchWorkloads = [
  {
    resource: 'jobs',
    kind: 'Job',
    name: 'data-import',
    title: / - Jobs - .+$/,
    spec: {
      completions: 1,
      parallelism: 1,
      template: {
        metadata: { labels: { job: 'data-import' } },
        spec: {
          containers: [{ name: 'importer', image: 'busybox:1.37' }],
          restartPolicy: 'Never',
        },
      },
    },
    status: {
      active: 1,
      startTime: '2026-01-01T00:00:00Z',
    },
  },
  {
    resource: 'cronjobs',
    kind: 'CronJob',
    name: 'nightly-backup',
    title: / - CronJobs - .+$/,
    spec: {
      concurrencyPolicy: 'Forbid',
      jobTemplate: {
        spec: {
          template: {
            metadata: { labels: { job: 'nightly-backup' } },
            spec: {
              containers: [{ name: 'backup', image: 'postgres:17' }],
              restartPolicy: 'Never',
            },
          },
        },
      },
      schedule: '0 0 * * *',
      suspend: false,
    },
    status: {
      active: [],
      lastScheduleTime: '2026-01-01T00:00:00Z',
      lastSuccessfulTime: '2026-01-01T00:00:00Z',
    },
  },
];

for (const workload of appsWorkloads) {
  test(`loads the ${workload.kind} list page`, async ({ page }) => {
    let requestSeen = false;
    const collectionUrl = new RegExp(
      `/clusters/test/apis/apps/v1/(?:namespaces/[^/]+/)?${workload.resource}(?:\\?.*)?$`
    );
    await page.route(collectionUrl, async route => {
      requestSeen = true;
      const namespaceMatch = new URL(route.request().url()).pathname.match(
        /\/namespaces\/([^/]+)\//
      );
      const namespace = namespaceMatch ? decodeURIComponent(namespaceMatch[1]) : 'default';

      await route.fulfill({
        json: {
          apiVersion: 'apps/v1',
          kind: `${workload.kind}List`,
          metadata: { resourceVersion: '1' },
          items: [
            {
              apiVersion: 'apps/v1',
              kind: workload.kind,
              metadata: {
                name: workload.name,
                namespace,
                resourceVersion: '1',
                creationTimestamp: '2026-01-01T00:00:00Z',
                uid: `${workload.resource}-uid`,
              },
              spec: workload.spec,
              status: workload.status,
            },
          ],
        },
      });
    });

    const headlampPage = new HeadlampPage(page);
    await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
    await headlampPage.navigateTopage(`/c/test/${workload.resource}`, workload.title);

    await expect.poll(() => requestSeen).toBe(true);
    const workloadRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: workload.name, exact: true }) });
    await expect(workloadRow).toBeVisible();
    await expect(workloadRow.getByText(workload.expectedText, { exact: true })).toBeVisible();
  });
}

test('loads batch workload list pages', async ({ page }) => {
  const requestedResources = new Set<string>();

  for (const workload of batchWorkloads) {
    const collectionUrl = new RegExp(
      `/clusters/test/apis/batch/v1/${workload.resource}(?:\\?.*)?$`
    );
    await page.route(collectionUrl, async route => {
      requestedResources.add(workload.resource);
      await route.fulfill({
        json: {
          apiVersion: 'batch/v1',
          kind: `${workload.kind}List`,
          metadata: { resourceVersion: '1' },
          items: [
            {
              apiVersion: 'batch/v1',
              kind: workload.kind,
              metadata: {
                name: workload.name,
                namespace: 'default',
                resourceVersion: '1',
                creationTimestamp: '2026-01-01T00:00:00Z',
                uid: `${workload.resource}-uid`,
              },
              spec: workload.spec,
              status: workload.status,
            },
          ],
        },
      });
    });
  }

  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  for (const workload of batchWorkloads) {
    await headlampPage.navigateTopage(`/c/test/${workload.resource}`, workload.title);
    await expect.poll(() => requestedResources.has(workload.resource)).toBe(true);
    const workloadLink = page.getByRole('link', { name: workload.name, exact: true });

    await expect(workloadLink).toBeVisible();
  }
});
