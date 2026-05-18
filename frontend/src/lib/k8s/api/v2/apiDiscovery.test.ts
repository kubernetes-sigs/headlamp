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

import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import { apiDiscovery } from './apiDiscovery'; // Adjust path as needed
// Adjust path as needed
import { clusterFetch } from './fetch'; // Adjust path as needed

// Mock the clusterFetch module
vi.mock('./fetch', () => ({
  clusterFetch: vi.fn(),
}));

// Type the mock for better autocompletion and type safety
const mockClusterFetch = clusterFetch as MockedFunction<typeof clusterFetch>;

// Helper to create a mock Response object
const mockJsonResponse = (data: any) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response);

const mockFetchError = (message: string = 'Fetch failed') =>
  ({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ message }),
  } as Response);

// Aggregated API Discovery Mocks
const mockAggregatedApi = {
  items: [
    {
      metadata: { name: 'v1' },
      versions: [
        {
          version: 'v1',
          resources: [
            {
              resource: 'pods',
              verbs: ['list', 'get'],
              responseKind: { kind: 'Pod' },
              singularResource: 'pod',
              scope: 'Namespaced',
            },
            {
              resource: 'services',
              verbs: ['get'],
              responseKind: { kind: 'Service' },
              scope: 'Namespaced',
            }, // No list verb
            {
              resource: 'configmaps',
              verbs: ['list'],
              responseKind: { kind: 'ConfigMap' },
              scope: 'Namespaced',
            }, // Included
          ],
        },
      ],
    },
  ],
};

const mockAggregatedApis = {
  items: [
    {
      metadata: { name: 'apps' },
      versions: [
        {
          version: 'v1',
          resources: [
            {
              resource: 'deployments',
              verbs: ['list', 'create'],
              responseKind: { kind: 'Deployment' },
              singularResource: 'deployment',
              scope: 'Namespaced',
            },
            {
              resource: 'statefulsets',
              verbs: ['list'],
              responseKind: { kind: 'StatefulSet' },
              scope: 'Namespaced',
            }, // Included
          ],
        },
      ],
    },
    {
      metadata: { name: 'rbac.authorization.k8s.io' },
      versions: [
        {
          version: 'v1',
          resources: [
            {
              resource: 'clusterroles',
              verbs: ['list', 'get'],
              responseKind: { kind: 'ClusterRole' },
              singularResource: 'clusterrole',
              scope: 'Cluster',
            },
          ],
        },
      ],
    },
    {
      metadata: { name: 'batch' },
      versions: [
        {
          version: 'v1',
          resources: [
            {
              resource: 'jobs',
              verbs: ['get'],
              responseKind: { kind: 'Job' },
              scope: 'Namespaced',
            }, // No list verb
          ],
        },
      ],
    },
  ],
};

// Legacy API Discovery Mocks
const mockLegacyCoreApi = { versions: ['v1'] };
const mockLegacyApis = {
  groups: [
    { name: 'apps', preferredVersion: { version: 'v1' }, versions: [{ version: 'v1' }] },
    {
      name: 'rbac.authorization.k8s.io',
      preferredVersion: { version: 'v1' },
      versions: [{ version: 'v1' }],
    },
    { name: 'batch', versions: [{ version: 'v1beta1' }] }, // Test fallback to first version if preferred missing
  ],
};
const mockLegacyCoreV1Resources = {
  resources: [
    { name: 'pods', verbs: ['list', 'get'], kind: 'Pod', singularName: 'pod', namespaced: true },
    { name: 'secrets', verbs: ['get'], kind: 'Secret', namespaced: true }, // No list verb
  ],
};
const mockLegacyAppsV1Resources = {
  resources: [
    {
      name: 'deployments',
      verbs: ['list', 'create'],
      kind: 'Deployment',
      singularName: 'deployment',
      namespaced: true,
    },
  ],
};
const mockLegacyRbacV1Resources = {
  resources: [
    {
      name: 'clusterroles',
      verbs: ['list', 'get'],
      kind: 'ClusterRole',
      singularName: 'clusterrole',
      namespaced: false,
    },
  ],
};
const mockLegacyBatchV1Beta1Resources = {
  resources: [{ name: 'cronjobs', verbs: ['list'], kind: 'CronJob', namespaced: true }],
};

// --- Tests ---

describe('apiDiscovery', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockClusterFetch.mockClear();
  });

  it('should return an empty array if cluster list is empty', async () => {
    const result = await apiDiscovery([]);
    expect(result).toEqual([]);
    expect(mockClusterFetch).not.toHaveBeenCalled();
  });

  it('should use aggregated discovery when available', async () => {
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApi)) // /api aggregated
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)); // /apis aggregated

    const result = await apiDiscovery(['cluster1']);

    expect(mockClusterFetch).toHaveBeenCalledTimes(2);
    expect(mockClusterFetch).toHaveBeenCalledWith(
      '/api',
      expect.objectContaining({
        cluster: 'cluster1',
        headers: expect.objectContaining({
          Accept: expect.stringContaining('apidiscovery.k8s.io'),
        }),
      })
    );
    expect(mockClusterFetch).toHaveBeenCalledWith(
      '/apis',
      expect.objectContaining({
        cluster: 'cluster1',
        headers: expect.objectContaining({
          Accept: expect.stringContaining('apidiscovery.k8s.io'),
        }),
      })
    );

    // Sort results for consistent comparison
    const sortedResult = result.sort((a, b) => a.pluralName.localeCompare(b.pluralName));

    expect(sortedResult).toMatchInlineSnapshot(`
      [
        {
          "apiVersion": "rbac.authorization.k8s.io/v1",
          "groupName": "rbac.authorization.k8s.io",
          "isNamespaced": false,
          "kind": "ClusterRole",
          "pluralName": "clusterroles",
          "singularName": "clusterrole",
          "version": "v1",
        },
        {
          "apiVersion": "v1/v1",
          "groupName": "v1",
          "isNamespaced": true,
          "kind": "ConfigMap",
          "pluralName": "configmaps",
          "singularName": "",
          "version": "v1",
        },
        {
          "apiVersion": "apps/v1",
          "groupName": "apps",
          "isNamespaced": true,
          "kind": "Deployment",
          "pluralName": "deployments",
          "singularName": "deployment",
          "version": "v1",
        },
        {
          "apiVersion": "v1/v1",
          "groupName": "v1",
          "isNamespaced": true,
          "kind": "Pod",
          "pluralName": "pods",
          "singularName": "pod",
          "version": "v1",
        },
        {
          "apiVersion": "apps/v1",
          "groupName": "apps",
          "isNamespaced": true,
          "kind": "StatefulSet",
          "pluralName": "statefulsets",
          "singularName": "",
          "version": "v1",
        },
      ]
    `);
  });

  it('should fall back to legacy discovery if aggregated fails', async () => {
    mockClusterFetch
      // Aggregated discovery fails
      .mockResolvedValueOnce(mockFetchError('Aggregated /api failed')) // /api aggregated fails
      .mockResolvedValueOnce(mockFetchError('Aggregated /apis failed')) // /apis aggregated fails
      // Legacy discovery calls
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreApi)) // /api (legacy versions)
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyApis)) // /apis (legacy groups)
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreV1Resources)) // /api/v1
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyAppsV1Resources)) // /apis/apps/v1
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyRbacV1Resources)) // /apis/rbac.../v1
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyBatchV1Beta1Resources)); // /apis/batch/v1beta1 (fallback version)

    const result = await apiDiscovery(['cluster1']);

    expect(mockClusterFetch).toHaveBeenCalledTimes(8); // 2 aggregated (failed) + 2 legacy lists + 4 legacy resource fetches

    const sortedResult = result.sort((a, b) =>
      (a.apiVersion + a.pluralName).localeCompare(b.apiVersion + b.pluralName)
    );

    expect(sortedResult).toMatchInlineSnapshot(`
      [
        {
          "apiVersion": "apps/v1",
          "groupName": "apps",
          "isNamespaced": true,
          "kind": "Deployment",
          "pluralName": "deployments",
          "singularName": "deployment",
          "version": "v1",
        },
        {
          "apiVersion": "batch/v1beta1",
          "groupName": "batch",
          "isNamespaced": true,
          "kind": "CronJob",
          "pluralName": "cronjobs",
          "singularName": "",
          "version": "v1beta1",
        },
        {
          "apiVersion": "rbac.authorization.k8s.io/v1",
          "groupName": "rbac.authorization.k8s.io",
          "isNamespaced": false,
          "kind": "ClusterRole",
          "pluralName": "clusterroles",
          "singularName": "clusterrole",
          "version": "v1",
        },
        {
          "apiVersion": "v1",
          "groupName": undefined,
          "isNamespaced": true,
          "kind": "Pod",
          "pluralName": "pods",
          "singularName": "pod",
          "version": "v1",
        },
      ]
    `);
  });

  it('should fall back to legacy discovery if only one aggregated call fails', async () => {
    mockClusterFetch
      // Aggregated discovery (one fails)
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApi)) // /api aggregated OK
      .mockResolvedValueOnce(mockFetchError('Aggregated /apis failed')) // /apis aggregated fails
      // Legacy discovery calls (should still be called)
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreApi))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyApis))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreV1Resources))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyAppsV1Resources))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyRbacV1Resources))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyBatchV1Beta1Resources));

    const result = await apiDiscovery(['cluster1']);

    // Should use legacy results because aggregated was incomplete
    const sortedResult = result.sort((a, b) =>
      (a.apiVersion + a.pluralName).localeCompare(b.apiVersion + b.pluralName)
    );
    expect(sortedResult).toMatchInlineSnapshot(`
      [
        {
          "apiVersion": "apps/v1",
          "groupName": "apps",
          "isNamespaced": true,
          "kind": "Deployment",
          "pluralName": "deployments",
          "singularName": "deployment",
          "version": "v1",
        },
        {
          "apiVersion": "batch/v1beta1",
          "groupName": "batch",
          "isNamespaced": true,
          "kind": "CronJob",
          "pluralName": "cronjobs",
          "singularName": "",
          "version": "v1beta1",
        },
        {
          "apiVersion": "rbac.authorization.k8s.io/v1",
          "groupName": "rbac.authorization.k8s.io",
          "isNamespaced": false,
          "kind": "ClusterRole",
          "pluralName": "clusterroles",
          "singularName": "clusterrole",
          "version": "v1",
        },
        {
          "apiVersion": "v1/v1",
          "groupName": "v1",
          "isNamespaced": true,
          "kind": "ConfigMap",
          "pluralName": "configmaps",
          "singularName": "",
          "version": "v1",
        },
        {
          "apiVersion": "v1/v1",
          "groupName": "v1",
          "isNamespaced": true,
          "kind": "Pod",
          "pluralName": "pods",
          "singularName": "pod",
          "version": "v1",
        },
        {
          "apiVersion": "v1",
          "groupName": undefined,
          "isNamespaced": true,
          "kind": "Pod",
          "pluralName": "pods",
          "singularName": "pod",
          "version": "v1",
        },
      ]
    `);
  });

  it('should handle multiple clusters and deduplicate results (using aggregated)', async () => {
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApi)) // c1 /api agg
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)); // c1 /apis agg
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApi)) // c2 /api agg
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)); // c2 /apis agg

    const result = await apiDiscovery(['cluster1', 'cluster2']);

    expect(mockClusterFetch).toHaveBeenCalledTimes(4); // 2 per cluster

    // Results should be deduplicated based on apiVersion + pluralName
    const sortedResult = result.sort((a, b) =>
      (a.apiVersion + a.pluralName).localeCompare(b.apiVersion + b.pluralName)
    );

    expect(sortedResult).toMatchInlineSnapshot(`
      [
        {
          "apiVersion": "apps/v1",
          "groupName": "apps",
          "isNamespaced": true,
          "kind": "Deployment",
          "pluralName": "deployments",
          "singularName": "deployment",
          "version": "v1",
        },
        {
          "apiVersion": "apps/v1",
          "groupName": "apps",
          "isNamespaced": true,
          "kind": "StatefulSet",
          "pluralName": "statefulsets",
          "singularName": "",
          "version": "v1",
        },
        {
          "apiVersion": "rbac.authorization.k8s.io/v1",
          "groupName": "rbac.authorization.k8s.io",
          "isNamespaced": false,
          "kind": "ClusterRole",
          "pluralName": "clusterroles",
          "singularName": "clusterrole",
          "version": "v1",
        },
        {
          "apiVersion": "v1/v1",
          "groupName": "v1",
          "isNamespaced": true,
          "kind": "ConfigMap",
          "pluralName": "configmaps",
          "singularName": "",
          "version": "v1",
        },
        {
          "apiVersion": "v1/v1",
          "groupName": "v1",
          "isNamespaced": true,
          "kind": "Pod",
          "pluralName": "pods",
          "singularName": "pod",
          "version": "v1",
        },
      ]
    `);
    expect(sortedResult).toHaveLength(5); // Ensure deduplication worked
  });

  it('should filter out resources without "list" verb or required fields (aggregated)', async () => {
    // Using the same mock data as the aggregated success test which includes non-listable items
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApi))
      .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis));

    const result = await apiDiscovery(['cluster1']);

    // Check that specific non-listable resources are NOT present
    expect(result.find(r => r.pluralName === 'services')).toBeUndefined(); // No list verb in mockAggregatedApi
    expect(result.find(r => r.pluralName === 'jobs')).toBeUndefined(); // No list verb in mockAggregatedApis

    // Check that expected listable resources ARE present
    expect(result.find(r => r.pluralName === 'pods')).toBeDefined();
    expect(result.find(r => r.pluralName === 'configmaps')).toBeDefined();
    expect(result.find(r => r.pluralName === 'deployments')).toBeDefined();
    expect(result.find(r => r.pluralName === 'statefulsets')).toBeDefined();
    expect(result.find(r => r.pluralName === 'clusterroles')).toBeDefined();
  });

  it('should filter out resources without "list" verb or required fields (legacy)', async () => {
    // Using the same mock data as the legacy success test
    mockClusterFetch
      .mockResolvedValueOnce(mockFetchError('Aggregated /api failed'))
      .mockResolvedValueOnce(mockFetchError('Aggregated /apis failed'))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreApi))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyApis))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreV1Resources)) // Contains 'secrets' without list
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyAppsV1Resources))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyRbacV1Resources))
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyBatchV1Beta1Resources));

    const result = await apiDiscovery(['cluster1']);

    // Check that specific non-listable resources are NOT present
    expect(result.find(r => r.pluralName === 'secrets')).toBeUndefined(); // No list verb in mockLegacyCoreV1Resources

    // Check that expected listable resources ARE present
    expect(result.find(r => r.pluralName === 'pods')).toBeDefined();
    expect(result.find(r => r.pluralName === 'deployments')).toBeDefined();
    expect(result.find(r => r.pluralName === 'clusterroles')).toBeDefined();
    expect(result.find(r => r.pluralName === 'cronjobs')).toBeDefined();
  });

  it('should gracefully handle errors during legacy resource fetching', async () => {
    mockClusterFetch
      // Aggregated discovery fails
      .mockResolvedValueOnce(mockFetchError('Aggregated /api failed'))
      .mockResolvedValueOnce(mockFetchError('Aggregated /apis failed'))
      // Legacy discovery calls
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreApi)) // /api (legacy versions) OK
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyApis)) // /apis (legacy groups) OK
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyCoreV1Resources)) // /api/v1 OK (pods)
      .mockResolvedValueOnce(mockFetchError('Failed to fetch apps/v1')) // /apis/apps/v1 FAILS
      .mockResolvedValueOnce(mockJsonResponse(mockLegacyRbacV1Resources)) // /apis/rbac.../v1 OK (clusterroles)
      .mockResolvedValueOnce(mockFetchError('Failed to fetch batch/v1beta1')); // /apis/batch/v1beta1 FAILS

    const result = await apiDiscovery(['cluster1']);

    // Should contain results from successful fetches only
    const sortedResult = result.sort((a, b) =>
      (a.apiVersion + a.pluralName).localeCompare(b.apiVersion + b.pluralName)
    );

    expect(sortedResult).toMatchInlineSnapshot(`
      [
        {
          "apiVersion": "rbac.authorization.k8s.io/v1",
          "groupName": "rbac.authorization.k8s.io",
          "isNamespaced": false,
          "kind": "ClusterRole",
          "pluralName": "clusterroles",
          "singularName": "clusterrole",
          "version": "v1",
        },
        {
          "apiVersion": "v1",
          "groupName": undefined,
          "isNamespaced": true,
          "kind": "Pod",
          "pluralName": "pods",
          "singularName": "pod",
          "version": "v1",
        },
      ]
    `);
    expect(sortedResult).toHaveLength(2);
  });
});
