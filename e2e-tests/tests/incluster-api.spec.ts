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

/*
 * In-cluster API integration tests.
 *
 * These tests assume:
 * - Headlamp is running in-cluster mode and exposed locally via port-forward
 *   at HEADLAMP_TEST_URL (e.g. http://localhost:8080)
 * - A service account token with cluster-admin permissions is available in
 *   HEADLAMP_SA_TOKEN
 */

import { expect, test } from '@playwright/test';

const baseURL = process.env.HEADLAMP_TEST_URL || 'http://localhost:8080';
const saToken = process.env.HEADLAMP_SA_TOKEN || '';

// Only run these tests when explicitly configured (e.g. from CI in in-cluster job).
// In all other environments, they are skipped so they don't interfere with normal e2e runs.
const shouldRun = !!saToken;

test.describe('Headlamp in-cluster API', () => {
  test.skip(!shouldRun, 'HEADLAMP_SA_TOKEN is not set; skipping in-cluster API tests');

  test('can list namespaces via /clusters/main/api/v1/namespaces', async ({ request }) => {
    const response = await request.get('/clusters/main/api/v1/namespaces', {
      headers: {
        Authorization: `Bearer ${saToken}`,
      },
      baseURL,
    });

    expect(response.status(), 'expected 200 from namespaces API').toBe(200);

    const body = await response.json();

    // Basic sanity checks – structure may vary between clusters, so keep it loose
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('can list nodes via /clusters/main/api/v1/nodes', async ({ request }) => {
    const response = await request.get('/clusters/main/api/v1/nodes', {
      headers: {
        Authorization: `Bearer ${saToken}`,
      },
      baseURL,
    });

    expect(response.status(), 'expected 200 from nodes API').toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('can list Helm releases with service account token', async ({ request }) => {
    const response = await request.get('/clusters/main/helm/releases/list', {
      headers: {
        Authorization: `Bearer ${saToken}`,
      },
      baseURL,
    });

    expect(response.status(), 'expected 200 from Helm releases API with token').toBe(200);

    const body = await response.json();
    // Response structure may vary depending on installed charts; just assert we get a list back.
    expect(body).toHaveProperty('releases');
    expect(Array.isArray(body.releases)).toBe(true);

    // do a follow up request to /clusters/main/helm/releases/list?all=true without a token
    // and expect a non-200 status
    const response2 = await request.get('/clusters/main/helm/releases/list?all=true', {
      baseURL,
    });
    expect(
      response2.status(),
      'expected a non-200 status from Helm releases API without token'
    ).not.toBe(200);
  });

  test('cannot list Helm releases without service account token', async ({ request }) => {
    const response = await request.get('/clusters/main/helm/releases/list', {
      baseURL,
    });

    // Without token, the request should fail with an error status
    expect(response.status(), 'expected error from Helm releases API without token').not.toBe(200);
  });
});
