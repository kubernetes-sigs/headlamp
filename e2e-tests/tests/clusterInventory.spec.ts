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

const baseURL = process.env.HEADLAMP_TEST_URL || 'http://localhost:3000';
const backendToken = process.env.HEADLAMP_TEST_BACKEND_TOKEN || 'headlamp';
const shouldRun = process.env.HEADLAMP_CLUSTER_INVENTORY_E2E === 'true';

test.describe('Cluster Inventory', () => {
  test.skip(!shouldRun, 'Set HEADLAMP_CLUSTER_INVENTORY_E2E=true to run Cluster Inventory E2E');

  test('discovers clusters and proxies to them', async ({ request }) => {
    const configResponse = await request.get('/config', {
      baseURL,
      headers: {
        'X-HEADLAMP_BACKEND-TOKEN': backendToken,
      },
    });
    expect(configResponse.status()).toBe(200);

    const config = await configResponse.json();
    const inventoryClusters = config.clusters.filter(
      (cluster: any) => cluster.meta_data?.source === 'cluster_inventory'
    );
    expect(inventoryClusters.length).toBeGreaterThanOrEqual(1);

    for (const cluster of inventoryClusters) {
      const clusterName = encodeURIComponent(cluster.name);
      const response = await request.get(`/clusters/${clusterName}/api/v1/namespaces`, {
        baseURL,
        headers: {
          'X-HEADLAMP_BACKEND-TOKEN': backendToken,
        },
      });

      expect(response.status(), `expected namespace proxy to work for ${cluster.name}`).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
    }
  });
});
