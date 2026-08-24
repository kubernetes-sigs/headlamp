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
  CLUSTER_WIDE_PODS_URL,
  NAMESPACED_PODS_URL,
  podCollectionUrls,
} from './storybookBaseMocks.testHelper';

const server = setupServer();

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
