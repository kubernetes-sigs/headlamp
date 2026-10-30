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

const backendToken = process.env.HEADLAMP_TEST_BACKEND_TOKEN || 'headlamp';
const shouldRun = process.env.HEADLAMP_CLUSTER_INVENTORY_E2E === 'true';
const requestOptions = { headers: { 'X-HEADLAMP_BACKEND-TOKEN': backendToken } };

test.describe('Cluster Inventory', () => {
  test.skip(!shouldRun, 'Set HEADLAMP_CLUSTER_INVENTORY_E2E=true to run Cluster Inventory E2E');

  async function inventoryCluster(request: import('@playwright/test').APIRequestContext) {
    const response = await request.get('/config', requestOptions);
    expect(response.status()).toBe(200);
    const config = await response.json();
    const clusters = config.clusters.filter(
      (cluster: any) => cluster.meta_data?.source === 'cluster_inventory'
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].auth_type).toBe('oidc');
    expect(clusters[0].meta_data.clusterInventory.profile).toMatchObject({
      namespace: 'kube-system',
      name: 'inventory-test2',
    });
    return encodeURIComponent(clusters[0].name);
  }

  async function signIn(page: import('@playwright/test').Page, cluster: string, email: string) {
    await page.goto(`/oidc?cluster=${cluster}`);
    await page.locator('input[name="login"]').fill(email);
    await page.locator('input[name="password"]').fill('headlamp-e2e-password');
    await page.getByRole('button', { name: /login/i }).click();
    await page.waitForURL(url => url.pathname === '/auth' || url.pathname.startsWith('/c/'));
    await page.goto('/');
  }

  test('discovers OIDC clusters and rejects requests without a user credential', async ({
    request,
  }) => {
    const cluster = await inventoryCluster(request);
    const response = await request.get(
      `/clusters/${cluster}/api/v1/namespaces/inventory-demo/pods`,
      requestOptions
    );
    expect(response.status()).toBe(401);
  });

  test('uses the signed-in users RBAC for HTTP and WebSocket access', async ({ page }) => {
    const cluster = await inventoryCluster(page.request);
    await signIn(page, cluster, 'headlamp-e2e@example.com');
    const path = `/clusters/${cluster}/api/v1/namespaces/inventory-demo/pods`;
    const response = await page.request.get(path, requestOptions);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].metadata.name).toMatch(/^inventory-demo-/);
    expect(body.items[0].status.phase).toBe('Running');

    const forbiddenWrite = await page.request.post(path, { ...requestOptions, data: {} });
    expect(forbiddenWrite.status()).toBe(403);

    const event = await page.evaluate(async watchPath => {
      return new Promise<string>((resolve, reject) => {
        const url = new URL(watchPath, window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(url);
        const timer = window.setTimeout(() => {
          socket.close();
          reject(new Error('watch timed out'));
        }, 10000);
        socket.onmessage = message => {
          window.clearTimeout(timer);
          socket.close();
          resolve(String(message.data));
        };
        socket.onerror = () => {
          window.clearTimeout(timer);
          socket.close();
          reject(new Error('watch failed'));
        };
      });
    }, `${path}?watch=true`);
    expect(JSON.parse(event).type).toBe('ADDED');
  });

  test('denies a different OIDC user without the reader role', async ({ page }) => {
    const cluster = await inventoryCluster(page.request);
    await signIn(page, cluster, 'forbidden-e2e@example.com');
    const response = await page.request.get(
      `/clusters/${cluster}/api/v1/namespaces/inventory-demo/pods`,
      requestOptions
    );
    expect(response.status()).toBe(403);
  });
});
