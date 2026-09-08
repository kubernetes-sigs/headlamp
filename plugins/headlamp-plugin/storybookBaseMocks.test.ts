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

import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { baseMocks, fallbackMocks } from './config/.storybook/baseMocks';

const server = setupServer();
const appsWorkloads = [
  { resource: 'daemonsets', kind: 'DaemonSet' },
  { resource: 'deployments', kind: 'Deployment' },
  { resource: 'replicasets', kind: 'ReplicaSet' },
  { resource: 'statefulsets', kind: 'StatefulSet' },
];
const batchWorkloads = [
  { url: 'http://localhost:4466/apis/batch/v1/cronjobs', kind: 'CronJobList' },
  { url: 'http://localhost:4466/apis/batch/v1/jobs', kind: 'JobList' },
];

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test.each(appsWorkloads)('returns $kind lists for every apps request form', async workload => {
  const requestPaths = [
    `/apis/apps/v1/${workload.resource}`,
    `/apis/apps/v1/namespaces/default/${workload.resource}`,
    `/clusters/cluster0/apis/apps/v1/${workload.resource}`,
    `/clusters/cluster0/apis/apps/v1/namespaces/default/${workload.resource}`,
  ];
  server.use(...fallbackMocks);

  for (const requestPath of requestPaths) {
    const collectionUrl = `http://localhost:4466${requestPath}`;

    for (const url of [collectionUrl, `${collectionUrl}?limit=500`]) {
      const response = await fetch(url);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        kind: `${workload.kind}List`,
        apiVersion: 'apps/v1',
        metadata: {},
        items: [],
      });
    }
  }
});

// Keep this executable contract in the plugin package, where its MSW and Vite
// dependencies are installed. It catches fallback handlers accidentally moving
// into baseMocks and verifies that each URL returns its matching Kubernetes kind.
test('returns batch workload lists from plugin-template fallbacks', async () => {
  const basePaths = baseMocks.map(handler => String(handler.info.path));
  const fallbackPaths = fallbackMocks.map(handler => String(handler.info.path));
  server.use(...fallbackMocks);

  for (const workload of batchWorkloads) {
    expect(basePaths).not.toContain(workload.url);
    expect(fallbackPaths).toContain(workload.url);

    const response = await fetch(workload.url);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: workload.kind,
      apiVersion: 'batch/v1',
      metadata: {},
      items: [],
    });
  }
});
