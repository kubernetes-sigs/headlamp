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
import * as storybookMocks from '../../.storybook/baseMocks';
import {
  APPS_WORKLOAD_COLLECTIONS,
  appsWorkloadCollectionUrl,
  BATCH_WORKLOAD_COLLECTION_URLS,
  CLUSTER_WIDE_PODS_URL,
  NAMESPACED_PODS_URL,
  podCollectionUrls,
  workloadCollectionUrls,
} from './storybookBaseMocks.testHelper';

const server = setupServer();
const batchWorkloadKinds: Record<string, string> = {
  cronjobs: 'CronJob',
  jobs: 'Job',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('returns empty PodList responses for exported Pod collections', async () => {
  const handlers = Object.values(storybookMocks).flat();
  server.use(...handlers);
  const podUrls = podCollectionUrls(handlers);
  const expectedPodUrls = [NAMESPACED_PODS_URL];

  if ('fallbackMocks' in storybookMocks) {
    expectedPodUrls.push(CLUSTER_WIDE_PODS_URL);
  }

  expect(podUrls).toEqual(expectedPodUrls.sort());

  for (const url of podUrls) {
    const response = await fetch(url);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'PodList',
      apiVersion: 'v1',
      metadata: {},
      items: [],
    });
  }
});

/**
 * Verifies that one Storybook mock module serves workload defaults as fallbacks.
 *
 * @param apiGroup - Kubernetes API group served by the expected handlers.
 * @param expectedUrls - Exact fallback collection URLs expected for the group.
 * @param workloadKinds - Kubernetes resource kinds keyed by collection name.
 * @returns A promise that resolves after every fallback response is verified.
 */
async function expectWorkloadFallbacks(
  apiGroup: string,
  expectedUrls: string[],
  workloadKinds: Record<string, string>
): Promise<void> {
  expect(workloadCollectionUrls(storybookMocks.baseMocks, apiGroup)).toEqual([]);

  const workloadUrls = workloadCollectionUrls(storybookMocks.fallbackMocks, apiGroup);
  expect(workloadUrls).toEqual(expectedUrls);
  server.use(...storybookMocks.fallbackMocks);

  for (const url of workloadUrls) {
    const resource = new URL(url).pathname.split('/').at(-1)!;
    const response = await fetch(url);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: `${workloadKinds[resource]}List`,
      apiVersion: `${apiGroup}/v1`,
      metadata: {},
      items: [],
    });
  }
}

test('returns apps workload lists from the frontend fallbacks', async () => {
  server.use(...storybookMocks.fallbackMocks);
  const requestOptions = [
    {},
    { namespace: 'default' },
    { cluster: 'cluster0' },
    { cluster: 'cluster0', namespace: 'default' },
  ];

  for (const { resource, kind } of APPS_WORKLOAD_COLLECTIONS) {
    for (const options of requestOptions) {
      const collectionUrl = appsWorkloadCollectionUrl(resource, options);

      for (const url of [collectionUrl, `${collectionUrl}?limit=500`]) {
        const response = await fetch(url);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
          kind: `${kind}List`,
          apiVersion: 'apps/v1',
          metadata: {},
          items: [],
        });
      }
    }
  }
});

test('returns batch workload lists from the frontend fallbacks', async () => {
  await expectWorkloadFallbacks('batch', BATCH_WORKLOAD_COLLECTION_URLS, batchWorkloadKinds);
});
