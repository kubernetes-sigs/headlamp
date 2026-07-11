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

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  MockedFunction,
  MockInstance,
  vi,
} from 'vitest';
import { apiDiscovery, MAX_SUMMARY_KEYS, type PayloadSummary } from './apiDiscovery';
import { clusterFetch } from './fetch';

// Reused across tests that need a Response whose body fails to parse as JSON.
const mockJsonParseFailure = (reason: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.reject(reason),
  } as unknown as Response);

// Type guards used by the #4840 logging tests. Each variant validates its own
// required fields so an unrelated debug object that happens to carry a `type`
// string can't pass; only objects that match `summarizeAggregatedPayload`'s
// actual contract are accepted.
function isPayloadSummary(value: unknown): value is PayloadSummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case 'null':
      return true;
    case 'array':
      return typeof v.length === 'number';
    case 'object':
      return Array.isArray(v.keys) && typeof v.truncated === 'boolean';
    case 'string':
      return typeof v.length === 'number' && typeof v.preview === 'string';
    case 'number':
    case 'boolean':
    case 'undefined':
    case 'bigint':
    case 'symbol':
    case 'function':
      return 'value' in v;
    default:
      return false;
  }
}
function isNullSummary(value: unknown): value is Extract<PayloadSummary, { type: 'null' }> {
  return isPayloadSummary(value) && value.type === 'null';
}
function isArraySummary(value: unknown): value is Extract<PayloadSummary, { type: 'array' }> {
  return isPayloadSummary(value) && value.type === 'array';
}
function isObjectSummary(value: unknown): value is Extract<PayloadSummary, { type: 'object' }> {
  return isPayloadSummary(value) && value.type === 'object';
}
function isStringSummary(value: unknown): value is Extract<PayloadSummary, { type: 'string' }> {
  return isPayloadSummary(value) && value.type === 'string';
}
function isNumberSummary(value: unknown): value is { type: 'number'; value: unknown } {
  return isPayloadSummary(value) && value.type === 'number';
}

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

  // #4840: critical network and parsing failures used to be swallowed without
  // logging, making "missing resources in the UI" extremely hard to debug.
  // These tests pin the discovery path to its debug logging contract.
  describe('logs the cause of every fallback or skipped fetch (#4840)', () => {
    // One shared spy created in beforeEach and torn down in afterEach so the
    // cleanup runs even when an assertion throws. Restoring the single spy
    // (rather than `vi.restoreAllMocks()`) leaves the file-level `vi.mock`
    // for `./fetch` intact and avoids cross-test interference.
    let debugSpy: MockInstance<Console['debug']>;

    beforeEach(() => {
      debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
      debugSpy.mockRestore();
    });

    it('logs the rejection reason when aggregated /api rejects', async () => {
      const networkError = new Error('aggregated /api network down');

      mockClusterFetch
        .mockRejectedValueOnce(networkError) // /api aggregated rejects
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const messages = debugSpy.mock.calls.map(args => String(args[0]));
      expect(
        messages.some(m => m.includes('Aggregated /api discovery unusable for cluster cluster1'))
      ).toBe(true);
      expect(debugSpy.mock.calls.some(args => args.includes(networkError))).toBe(true);
    });

    it('logs the unusable payload when aggregated returns no items array', async () => {
      const malformed = { unexpected: 'shape' };

      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(malformed)) // /api aggregated returns malformed shape
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const messages = debugSpy.mock.calls.map(args => String(args[0]));
      expect(
        messages.some(m => m.includes('Aggregated /api discovery unusable for cluster cluster1'))
      ).toBe(true);
      // The unusable payload itself is logged as a bounded summary. Pin the
      // full discriminated shape (`type: 'object'` with `keys` + `truncated`)
      // so the test matches `summarizeAggregatedPayload`'s contract rather
      // than any object that happens to carry a `keys` array.
      const objectSummaries = debugSpy.mock.calls.flat().filter(isObjectSummary);
      const matching = objectSummaries.filter(s => s.keys.includes('unexpected'));
      expect(matching.length).toBeGreaterThan(0);
      expect(matching[0].truncated).toBe(false);
    });

    it('truncates the summary keys when an aggregated payload has many fields', async () => {
      // Construct a body with no `items` array but well over MAX_SUMMARY_KEYS
      // own properties so the bound kicks in. Pin the contract: keys array
      // is strictly smaller than the input and `truncated` is set.
      const INPUT_KEY_COUNT = 25;
      const bigUnusable: Record<string, number> = {};
      for (let i = 0; i < INPUT_KEY_COUNT; i++) {
        bigUnusable[`field${i}`] = i;
      }

      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(bigUnusable)) // /api aggregated unusable (no items)
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const truncated = debugSpy.mock.calls
        .flat()
        .filter(isObjectSummary)
        .filter(s => s.truncated);
      expect(truncated.length).toBeGreaterThan(0);
      // Pin the exact bound by reusing the exported `MAX_SUMMARY_KEYS`
      // constant rather than a literal: the assertion stays honest if the
      // bound shrinks, and a future change that loosens it also fails the
      // test instead of silently passing.
      expect(truncated[0].keys.length).toBe(MAX_SUMMARY_KEYS);
    });

    it('tags a null aggregated body as type null in the summary', async () => {
      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(null)) // /api aggregated body is JSON null
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const nullSummaries = debugSpy.mock.calls.flat().filter(isNullSummary);
      expect(nullSummaries.length).toBeGreaterThan(0);
    });

    it('tags an array aggregated body as type array with its length', async () => {
      const arrayBody = [1, 2, 3, 4];
      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(arrayBody)) // /api aggregated body is a top-level array
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const arraySummaries = debugSpy.mock.calls.flat().filter(isArraySummary);
      expect(arraySummaries.length).toBeGreaterThan(0);
      expect(arraySummaries[0].length).toBe(arrayBody.length);
    });

    it('truncates and length-tags a string aggregated body in the summary', async () => {
      // A misbehaving proxy can return plain text where JSON discovery was
      // expected; `res.json()` then parses to a string and we should still
      // produce a bounded summary instead of dumping the raw body.
      const stringBody = 'x'.repeat(500);
      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(stringBody)) // /api aggregated body is a string
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const stringSummaries = debugSpy.mock.calls.flat().filter(isStringSummary);
      expect(stringSummaries.length).toBeGreaterThan(0);
      expect(stringSummaries[0].length).toBe(stringBody.length);
      // The preview is strictly shorter than the body so the log stays
      // bounded even for arbitrarily long string payloads.
      expect(stringSummaries[0].preview.length).toBeLessThan(stringBody.length);
    });

    it('tags a primitive aggregated body with its typeof and raw value', async () => {
      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(42)) // /api aggregated body is a number
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const numberSummaries = debugSpy.mock.calls.flat().filter(isNumberSummary);
      expect(numberSummaries.length).toBeGreaterThan(0);
      expect(numberSummaries[0].value).toBe(42);
    });

    it('logs the rejection reason when the legacy /api fetch rejects', async () => {
      const legacyApiError = new Error('legacy /api dropped');

      mockClusterFetch
        .mockRejectedValueOnce(new Error('agg /api')) // /api aggregated rejects (clusterFetch throws on non-OK in prod)
        .mockRejectedValueOnce(new Error('agg /apis')) // /apis aggregated rejects (clusterFetch throws on non-OK in prod)
        .mockRejectedValueOnce(legacyApiError) // legacy /api rejects
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const messages = debugSpy.mock.calls.map(args => String(args[0]));
      expect(
        messages.some(m =>
          m.includes('Legacy /api discovery fetch or parse failed for cluster cluster1')
        )
      ).toBe(true);
      expect(debugSpy.mock.calls.some(args => args.includes(legacyApiError))).toBe(true);
    });

    it('logs the rejection reason when the legacy /apis fetch rejects', async () => {
      const legacyApisError = new Error('legacy /apis dropped');

      mockClusterFetch
        .mockRejectedValueOnce(new Error('agg /api')) // /api aggregated rejects (clusterFetch throws on non-OK in prod)
        .mockRejectedValueOnce(new Error('agg /apis')) // /apis aggregated rejects (clusterFetch throws on non-OK in prod)
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockRejectedValueOnce(legacyApisError); // legacy /apis rejects

      await apiDiscovery(['cluster1']);

      const messages = debugSpy.mock.calls.map(args => String(args[0]));
      expect(
        messages.some(m =>
          m.includes('Legacy /apis discovery fetch or parse failed for cluster cluster1')
        )
      ).toBe(true);
      expect(debugSpy.mock.calls.some(args => args.includes(legacyApisError))).toBe(true);
    });

    it('logs the parse error when the legacy /api response body is not JSON', async () => {
      // `clusterFetch` resolves OK but `res.json()` rejects, so the same
      // `.catch` should fire, the "fetch or parse failed" log should
      // appear, and apiDiscovery should continue by treating the legacy
      // side as null (so /apis still gets processed).
      const parseError = new Error('legacy /api invalid JSON');

      mockClusterFetch
        .mockRejectedValueOnce(new Error('agg /api')) // /api aggregated rejects (clusterFetch throws on non-OK in prod)
        .mockRejectedValueOnce(new Error('agg /apis')) // /apis aggregated rejects (clusterFetch throws on non-OK in prod)
        .mockResolvedValueOnce(mockJsonParseFailure(parseError)) // legacy /api: ok but json() rejects
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const messages = debugSpy.mock.calls.map(args => String(args[0]));
      expect(
        messages.some(m =>
          m.includes('Legacy /api discovery fetch or parse failed for cluster cluster1')
        )
      ).toBe(true);
      expect(debugSpy.mock.calls.some(args => args.includes(parseError))).toBe(true);
    });

    it('bounds non-Error rejection reasons through the payload summarizer', async () => {
      // A pathological rejection reason can itself be a huge object. Routing
      // non-Error reasons through `summarizeAggregatedPayload` keeps logs
      // readable even when the reason isn't an Error instance.
      const hugeReason: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        hugeReason[`field${i}`] = i;
      }

      mockClusterFetch
        .mockRejectedValueOnce(hugeReason) // /api aggregated rejects with a giant non-Error
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      // The raw `hugeReason` was NOT logged directly; the summarizer
      // produced an object-summary in its place.
      const rawReasonLogged = debugSpy.mock.calls.some(args => args.includes(hugeReason));
      expect(rawReasonLogged).toBe(false);
      const objectSummaries = debugSpy.mock.calls.flat().filter(isObjectSummary);
      expect(objectSummaries.length).toBeGreaterThan(0);
    });

    it('logs the parse error when the aggregated /api response body is not JSON', async () => {
      // The aggregated path also runs through `.then(res => res.json())`,
      // so a non-JSON body lands as a rejected settlement in
      // `Promise.allSettled`. The unusable-side log must include the parse
      // error and apiDiscovery must continue with the legacy fallback.
      const parseError = new Error('aggregated /api invalid JSON');

      mockClusterFetch
        .mockResolvedValueOnce(mockJsonParseFailure(parseError)) // /api aggregated: ok but json() rejects
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const messages = debugSpy.mock.calls.map(args => String(args[0]));
      expect(
        messages.some(m => m.includes('Aggregated /api discovery unusable for cluster cluster1'))
      ).toBe(true);
      expect(debugSpy.mock.calls.some(args => args.includes(parseError))).toBe(true);
    });

    it('tags a boolean aggregated body as type boolean with its raw value', async () => {
      // JSON.parse can produce a top-level boolean from `"true"` / `"false"`;
      // exercise the boolean branch of the primitive fallthrough alongside
      // the existing number test.
      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(false)) // /api aggregated body is a boolean
        .mockResolvedValueOnce(mockJsonResponse(mockAggregatedApis)) // /apis aggregated OK
        .mockResolvedValueOnce(mockJsonResponse({ versions: [] })) // legacy /api (empty)
        .mockResolvedValueOnce(mockJsonResponse({ groups: [] })); // legacy /apis (empty)

      await apiDiscovery(['cluster1']);

      const booleanSummaries = debugSpy.mock.calls
        .flat()
        .filter(
          (arg): arg is { type: 'boolean'; value: unknown } =>
            isPayloadSummary(arg) && arg.type === 'boolean'
        );
      expect(booleanSummaries.length).toBeGreaterThan(0);
      expect(booleanSummaries[0].value).toBe(false);
    });
  });
});
