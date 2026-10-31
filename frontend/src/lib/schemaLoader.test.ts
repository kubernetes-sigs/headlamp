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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockAppsV1Document,
  mockCoreV1Document,
  mockCRDDocument,
  mockOpenAPIV2FallbackDocument,
  mockOpenAPIV3Discovery,
  mockRecursiveDocument,
} from './fixtures/schemaFixtures';
import { clusterRequest } from './k8s/api/v1/clusterRequests';
import { CLUSTERS_PREFIX } from './k8s/api/v1/constants';
import { combinePath } from './k8s/api/v1/formatUrl';
import {
  loadResourceSchema,
  mapApiVersionToDiscoveryKey,
  resetSchemaLoaderCache,
  resolveLocalRef,
  validateAdvertisedUrl,
} from './schemaLoader';

vi.mock('./k8s/api/v1/clusterRequests', () => ({
  clusterRequest: vi.fn(),
}));

describe('schemaLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSchemaLoaderCache();
  });

  describe('mapApiVersionToDiscoveryKey and URL validation', () => {
    it('correctly maps core and grouped apiVersions', () => {
      expect(mapApiVersionToDiscoveryKey('v1')).toEqual({
        group: '',
        version: 'v1',
        discoveryKey: 'api/v1',
      });
      expect(mapApiVersionToDiscoveryKey('apps/v1')).toEqual({
        group: 'apps',
        version: 'v1',
        discoveryKey: 'apis/apps/v1',
      });
      expect(mapApiVersionToDiscoveryKey('custom.example.com/v1alpha1')).toEqual({
        group: 'custom.example.com',
        version: 'v1alpha1',
        discoveryKey: 'apis/custom.example.com/v1alpha1',
      });
    });

    it('rejects invalid or dangerous advertised URLs', () => {
      expect(() => validateAdvertisedUrl('https://evil.com/openapi/v3')).toThrow(
        /Unexpected absolute URL/
      );
      expect(() => validateAdvertisedUrl('//evil.com/openapi/v3')).toThrow(
        /Unexpected protocol-relative URL/
      );
      expect(() => validateAdvertisedUrl('/openapi/v3/../secret')).toThrow(/Path traversal/);
      expect(() => validateAdvertisedUrl('/api/v1/namespaces')).toThrow(
        /does not target the expected OpenAPI v3 route/
      );
      expect(() => validateAdvertisedUrl('')).toThrow(/non-empty string/);
    });

    it('rejects encoded path traversal, encoded separators, and backslashes', () => {
      // Encoded dot segments
      expect(() =>
        validateAdvertisedUrl('/openapi/v3/%2e%2e/%2e%2e/%2e%2e/other/openapi/v3/api/v1')
      ).toThrow(/Encoded path traversal|Path traversal/);
      expect(() => validateAdvertisedUrl('/openapi/v3/%2E%2E/other')).toThrow(
        /Encoded path traversal|Path traversal/
      );
      expect(() => validateAdvertisedUrl('/openapi/v3/%2e/other')).toThrow(
        /Encoded path traversal|Path traversal/
      );

      // Encoded separators
      expect(() => validateAdvertisedUrl('/openapi/v3%2f..%2f..')).toThrow(
        /Encoded path traversal|Path traversal/
      );

      // Raw and encoded backslashes
      expect(() => validateAdvertisedUrl('/openapi/v3\\something')).toThrow(
        /Backslashes are not permitted/
      );
      expect(() => validateAdvertisedUrl('/openapi/v3/%5c/something')).toThrow(
        /Backslashes are not permitted/
      );
      expect(() => validateAdvertisedUrl('/openapi/v3/%5C/something')).toThrow(
        /Backslashes are not permitted/
      );

      // Enforces exact /openapi/v3 route boundary
      expect(() => validateAdvertisedUrl('/openapi/v34/apis/apps/v1')).toThrow(
        /does not target the expected OpenAPI v3 route/
      );

      // Query string containing encoded dots or separators is NOT treated as path traversal
      expect(() =>
        validateAdvertisedUrl('/openapi/v3/apis/apps/v1?hash=42A&query=%2e%2e')
      ).not.toThrow();
    });

    it('accepts valid relative OpenAPI v3 URLs with hash query parameters', () => {
      expect(() =>
        validateAdvertisedUrl(
          '/openapi/v3/apis/apps/v1?hash=42A6878347E24792019EEA24751BB5AF9C3EEAC2A07849D6305C0657155609B1'
        )
      ).not.toThrow();
    });
  });

  describe('Review regressions', () => {
    it.each(['\t', '\r', '\n'])(
      'rejects control-character traversal before cluster URL canonicalization (%j)',
      async control => {
        const advertisedUrl = `/openapi/v3/${`.${control}./`.repeat(4)}openapi/v3/api/v1`;
        // Prove this input escapes the same prefix used by clusterRequest.
        expect(
          new URL(combinePath(`/${CLUSTERS_PREFIX}/prod`, advertisedUrl), 'http://localhost')
            .pathname
        ).toBe('/openapi/v3/api/v1');
        const safeUrl = '/openapi/v3/api/v1?hash=safe';
        validateAdvertisedUrl(safeUrl);
        expect(
          new URL(combinePath(`/${CLUSTERS_PREFIX}/prod`, safeUrl), 'http://localhost').pathname
        ).toBe('/clusters/prod/openapi/v3/api/v1');
        vi.mocked(clusterRequest).mockResolvedValue({
          paths: { 'api/v1': { serverRelativeURL: advertisedUrl } },
        });
        await expect(
          loadResourceSchema({ cluster: 'prod', apiVersion: 'v1', kind: 'Pod' })
        ).rejects.toThrow(/Control characters/);
        expect(clusterRequest).toHaveBeenCalledTimes(1);
        expect(() =>
          validateAdvertisedUrl(
            `/openapi/v3/api/%${control.charCodeAt(0).toString(16).padStart(2, '0')}v1`
          )
        ).toThrow(/Control characters/);
      }
    );

    it.each([
      ['v3', false],
      ['v3', true],
      ['v2', false],
      ['v2', true],
    ] as const)(
      'shares explicit %s refreshes while superseding a previous request (pending: %s)',
      async (format, pending) => {
        let release!: () => void;
        const blocked = new Promise<void>(resolve => {
          release = resolve;
        });
        let documentCalls = 0;
        const url = mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL;
        vi.mocked(clusterRequest).mockImplementation(async path => {
          if (path === '/openapi/v3') {
            if (format === 'v2') throw { status: 404 };
            return mockOpenAPIV3Discovery;
          }
          if (path === (format === 'v3' ? url : '/openapi/v2')) {
            documentCalls++;
            if (pending || documentCalls > 1) await blocked;
            return format === 'v3' ? mockAppsV1Document : mockOpenAPIV2FallbackDocument;
          }
          throw new Error(`Unexpected path: ${path}`);
        });
        const params = { cluster: 'refresh-cluster', apiVersion: 'apps/v1', kind: 'Deployment' };
        const original = loadResourceSchema(params);
        await vi.waitFor(() => expect(documentCalls).toBe(1));
        if (!pending) await original;
        const refreshes = Array.from({ length: 5 }, () =>
          loadResourceSchema({ ...params, refresh: true })
        );
        await vi.waitFor(() => expect(documentCalls).toBeGreaterThan(1));
        release();
        const results = await Promise.all([original, ...refreshes]);
        expect(results.every(result => result.sourceFormat === `openapi/${format}`)).toBe(true);
        expect(documentCalls).toBe(2);
        await loadResourceSchema(params);
        expect(documentCalls).toBe(2);
      }
    );

    it.each(['v3', 'v2'] as const)('retries failed shared %s refreshes', async format => {
      let reject!: (error: Error) => void;
      const blocked = new Promise((_, rejectPromise) => {
        reject = rejectPromise;
      });
      let documentCalls = 0;
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          if (format === 'v2') throw { status: 404 };
          return mockOpenAPIV3Discovery;
        }
        documentCalls++;
        if (documentCalls === 2) return blocked;
        return format === 'v3' ? mockAppsV1Document : mockOpenAPIV2FallbackDocument;
      });
      const params = { cluster: 'retry-refresh', apiVersion: 'apps/v1', kind: 'Deployment' };
      await loadResourceSchema(params);
      const refreshes = Promise.allSettled(
        Array.from({ length: 5 }, () => loadResourceSchema({ ...params, refresh: true }))
      );
      await vi.waitFor(() => expect(documentCalls).toBeGreaterThan(1));
      reject(new Error('temporary failure'));
      const results = await refreshes;
      expect(results.every(result => result.status === 'rejected')).toBe(true);
      expect(documentCalls).toBe(2);
      expect((await loadResourceSchema({ ...params, refresh: true })).sourceFormat).toBe(
        `openapi/${format}`
      );
      expect(documentCalls).toBe(3);
    });

    it.each([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ])(
      'invalidates pending v2 fallback (all clusters: %s, failure: %s)',
      async (allClusters, failure) => {
        let settle!: (value: any) => void;
        let reject!: (error: any) => void;
        const blocked = new Promise((resolve, rejectPromise) => {
          settle = resolve;
          reject = rejectPromise;
        });
        let documentCalls = 0;
        vi.mocked(clusterRequest).mockImplementation(async path => {
          if (path === '/openapi/v3') throw { status: 404 };
          documentCalls++;
          if (documentCalls === 1) return blocked;
          return mockOpenAPIV2FallbackDocument;
        });
        const params = { cluster: 'reset-fallback', apiVersion: 'apps/v1', kind: 'Deployment' };
        const oldLoad = loadResourceSchema(params).catch(error => error);
        await vi.waitFor(() => expect(documentCalls).toBe(1));
        resetSchemaLoaderCache(allClusters ? undefined : params.cluster);
        await loadResourceSchema(params);
        if (failure) reject({ status: 404 });
        else settle(mockOpenAPIV2FallbackDocument);
        expect(await oldLoad).toEqual(
          expect.objectContaining({ message: expect.stringMatching(/cache was reset/i) })
        );
        await loadResourceSchema(params);
        expect(documentCalls).toBe(2);
      }
    );

    it.each([
      ['initial discovery', false],
      ['initial discovery', true],
      ['missing-group rediscovery', false],
      ['missing-group rediscovery', true],
      ['redirect rediscovery', false],
      ['redirect rediscovery', true],
      ['unsupported discovery', false],
      ['unsupported discovery', true],
    ] as const)(
      'stops dependent requests after reset during %s (all clusters: %s)',
      async (phase, allClusters) => {
        let settle!: (value: any) => void;
        let reject!: (error: any) => void;
        const blocked = new Promise((resolve, rejectPromise) => {
          settle = resolve;
          reject = rejectPromise;
        });
        const oldUrl = '/openapi/v3/apis/apps/v1?hash=obsolete';
        const newUrl = '/openapi/v3/apis/apps/v1?hash=current';
        const index = (url: string) => ({ paths: { 'apis/apps/v1': { serverRelativeURL: url } } });
        let discoveryCalls = 0;
        const blockedCall = phase.includes('rediscovery') ? 2 : 1;
        vi.mocked(clusterRequest).mockImplementation(async path => {
          if (path === '/openapi/v3') {
            discoveryCalls++;
            if (discoveryCalls === blockedCall) return blocked;
            if (discoveryCalls < blockedCall)
              return phase === 'missing-group rediscovery' ? { paths: {} } : index(oldUrl);
            return index(newUrl);
          }
          if (path === oldUrl && phase === 'redirect rediscovery') throw { status: 301 };
          if (path === oldUrl || path === newUrl) return mockAppsV1Document;
          if (path === '/openapi/v2') return mockOpenAPIV2FallbackDocument;
          throw new Error(`Unexpected path: ${path}`);
        });
        const params = { cluster: 'reset-cluster', apiVersion: 'apps/v1', kind: 'Deployment' };
        // Attach rejection handling before releasing any deferred work.
        const oldLoad = loadResourceSchema(params).then(
          result => result,
          error => error
        );
        await vi.waitFor(() => expect(discoveryCalls).toBe(blockedCall));
        resetSchemaLoaderCache(allClusters ? undefined : params.cluster);
        expect((await loadResourceSchema(params)).sourceUrl).toBe(newUrl);
        const callsAfterReset = vi.mocked(clusterRequest).mock.calls.length;
        if (phase === 'unsupported discovery') reject({ status: 404 });
        else settle(phase === 'missing-group rediscovery' ? { paths: {} } : index(oldUrl));
        expect(await oldLoad).toEqual(
          expect.objectContaining({ message: expect.stringMatching(/cache was reset/i) })
        );
        expect(clusterRequest).toHaveBeenCalledTimes(callsAfterReset);
        expect((await loadResourceSchema(params)).sourceUrl).toBe(newUrl);
        expect(clusterRequest).toHaveBeenCalledTimes(callsAfterReset);
      }
    );
  });

  describe('Discovery and exact GVK selection', () => {
    it('loads core v1 Pod schema using OpenAPI v3 discovery without touching v2', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          return mockOpenAPIV3Discovery;
        }
        if (path === mockOpenAPIV3Discovery.paths['api/v1'].serverRelativeURL) {
          return mockCoreV1Document;
        }
        throw new Error(`Unexpected request path: ${path}`);
      });

      const result = await loadResourceSchema({
        cluster: 'prod-cluster',
        apiVersion: 'v1',
        kind: 'Pod',
      });

      expect(result.sourceFormat).toBe('openapi/v3');
      expect(result.sourceUrl).toBe(mockOpenAPIV3Discovery.paths['api/v1'].serverRelativeURL);
      expect(result.schema).toEqual(
        mockCoreV1Document.components!.schemas!['io.k8s.api.core.v1.Pod']
      );
      expect(result.document).toEqual(mockCoreV1Document);

      // Verify /openapi/v2 was never called
      const calledPaths = vi.mocked(clusterRequest).mock.calls.map(call => call[0]);
      expect(calledPaths).not.toContain('/openapi/v2');
      expect(calledPaths).toContain('/openapi/v3');
      expect(calledPaths).toContain(mockOpenAPIV3Discovery.paths['api/v1'].serverRelativeURL);
    });

    it('loads grouped API Deployment schema from apps/v1', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const result = await loadResourceSchema({
        cluster: 'prod-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(result.sourceFormat).toBe('openapi/v3');
      expect(result.schema).toEqual(
        mockAppsV1Document.components!.schemas!['io.k8s.api.apps.v1.Deployment']
      );
    });

    it('returns schema: null when group/version exists but exact kind is missing', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const result = await loadResourceSchema({
        cluster: 'prod-cluster',
        apiVersion: 'apps/v1',
        kind: 'NonExistentKind',
      });

      expect(result.schema).toBeNull();
      expect(result.document).toEqual(mockAppsV1Document);
      expect(result.sourceFormat).toBe('openapi/v3');
    });

    it('requires explicit non-empty cluster identity and rejects missing cluster', async () => {
      await expect(
        loadResourceSchema({
          cluster: '',
          apiVersion: 'v1',
          kind: 'Pod',
        })
      ).rejects.toThrow(/Cluster identity is required/);

      await expect(
        loadResourceSchema({
          cluster: '   ',
          apiVersion: 'v1',
          kind: 'Pod',
        })
      ).rejects.toThrow(/Cluster identity is required/);
    });
  });

  describe('Isolation and Concurrency', () => {
    it('keeps clusters strictly isolated even with identical advertised URLs', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      await loadResourceSchema({
        cluster: 'cluster-A',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      await loadResourceSchema({
        cluster: 'cluster-B',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      // Cluster A calls
      const callsClusterA = vi
        .mocked(clusterRequest)
        .mock.calls.filter(call => call[1]?.cluster === 'cluster-A');
      // Cluster B calls
      const callsClusterB = vi
        .mocked(clusterRequest)
        .mock.calls.filter(call => call[1]?.cluster === 'cluster-B');

      expect(callsClusterA.length).toBe(2); // discovery + apps/v1 doc
      expect(callsClusterB.length).toBe(2); // discovery + apps/v1 doc
    });

    it('deduplicates concurrent discovery and document requests for the same cluster', async () => {
      let discoveryRequests = 0;
      let docRequests = 0;

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryRequests++;
          return mockOpenAPIV3Discovery;
        }
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          docRequests++;
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // Run 5 simultaneous requests for Deployment in cluster-X
      const promises = Array.from({ length: 5 }, () =>
        loadResourceSchema({
          cluster: 'cluster-X',
          apiVersion: 'apps/v1',
          kind: 'Deployment',
        })
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.schema).toBeDefined();
        expect(res.sourceFormat).toBe('openapi/v3');
      }

      expect(discoveryRequests).toBe(1);
      expect(docRequests).toBe(1);
    });

    it('reuses loaded group/version document for different kinds in the same group/version', async () => {
      let docRequests = 0;

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          docRequests++;
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const resDeployment = await loadResourceSchema({
        cluster: 'cluster-X',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      const resDaemonSet = await loadResourceSchema({
        cluster: 'cluster-X',
        apiVersion: 'apps/v1',
        kind: 'DaemonSet',
      });

      expect(resDeployment.schema).toEqual(
        mockAppsV1Document.components!.schemas!['io.k8s.api.apps.v1.Deployment']
      );
      expect(resDaemonSet.schema).toEqual(
        mockAppsV1Document.components!.schemas!['io.k8s.api.apps.v1.DaemonSet']
      );

      expect(docRequests).toBe(1);
    });
  });

  describe('Refresh, Invalidation and Failures', () => {
    it('fetches a new document when the advertised hash URL changes', async () => {
      let discoveryCalls = 0;
      const oldUrl = mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL;
      const newUrl = '/openapi/v3/apis/apps/v1?hash=NEW_HASH_999999999999999999999999';

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          if (discoveryCalls === 1) {
            return mockOpenAPIV3Discovery;
          }
          return {
            paths: {
              ...mockOpenAPIV3Discovery.paths,
              'apis/apps/v1': { serverRelativeURL: newUrl },
            },
          };
        }
        if (path === oldUrl || path === newUrl) {
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // Initial load
      const res1 = await loadResourceSchema({
        cluster: 'cluster-hash',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });
      expect(res1.sourceUrl).toBe(oldUrl);

      // Force refresh
      const res2 = await loadResourceSchema({
        cluster: 'cluster-hash',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        refresh: true,
      });
      expect(res2.sourceUrl).toBe(newUrl);
    });

    it('retries newly advertised URL when old document URL returns 404 (stale hash rotation)', async () => {
      let discoveryCalls = 0;
      const staleUrl = '/openapi/v3/apis/apps/v1?hash=STALE_HASH';
      const freshUrl = '/openapi/v3/apis/apps/v1?hash=FRESH_HASH';

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          if (discoveryCalls === 1) {
            return {
              paths: {
                'apis/apps/v1': { serverRelativeURL: staleUrl },
              },
            };
          }
          return {
            paths: {
              'apis/apps/v1': { serverRelativeURL: freshUrl },
            },
          };
        }
        if (path === staleUrl) {
          const err: any = new Error('Not Found');
          err.status = 404;
          throw err;
        }
        if (path === freshUrl) {
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const res = await loadResourceSchema({
        cluster: 'rotation-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(res.sourceUrl).toBe(freshUrl);
      expect(res.schema).toBeDefined();
    });

    it('deduplicates concurrent forced discovery requests during missing-group revalidation', async () => {
      let discoveryCalls = 0;
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          // First call has missing group; subsequent revalidation has the group
          if (discoveryCalls === 1) {
            return {
              paths: {
                'api/v1': { serverRelativeURL: '/openapi/v3/api/v1?hash=123' },
              },
            };
          }
          return mockOpenAPIV3Discovery;
        }
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // 5 concurrent calls for missing group
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          loadResourceSchema({
            cluster: 'dedup-missing-cluster',
            apiVersion: 'apps/v1',
            kind: 'Deployment',
          })
        )
      );

      expect(results).toHaveLength(5);
      for (const res of results) {
        expect(res.sourceFormat).toBe('openapi/v3');
        expect(res.schema).toBeDefined();
      }

      // Exactly 1 initial discovery + 1 deduplicated revalidation discovery = 2 calls (not 6)
      expect(discoveryCalls).toBe(2);
    });

    it('deduplicates concurrent rediscovery and document fetching on stale-hash 404 recovery', async () => {
      let discoveryCalls = 0;
      let freshDocCalls = 0;
      const staleUrl = '/openapi/v3/apis/apps/v1?hash=STALE_404';
      const freshUrl = '/openapi/v3/apis/apps/v1?hash=FRESH_404';

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          if (discoveryCalls === 1) {
            return {
              paths: {
                'apis/apps/v1': { serverRelativeURL: staleUrl },
              },
            };
          }
          return {
            paths: {
              'apis/apps/v1': { serverRelativeURL: freshUrl },
            },
          };
        }
        if (path === staleUrl) {
          const err: any = new Error('Not Found');
          err.status = 404;
          throw err;
        }
        if (path === freshUrl) {
          freshDocCalls++;
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // 5 concurrent callers encountering stale document 404
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          loadResourceSchema({
            cluster: 'stale-dedup-cluster',
            apiVersion: 'apps/v1',
            kind: 'Deployment',
          })
        )
      );

      expect(results).toHaveLength(5);
      for (const res of results) {
        expect(res.sourceUrl).toBe(freshUrl);
        expect(res.schema).toBeDefined();
      }

      // Exactly 1 initial discovery + 1 deduplicated refresh discovery = 2 discovery calls
      expect(discoveryCalls).toBe(2);
      // Exactly 1 fetch for the replacement fresh document (deduplicated across all 5 callers!)
      expect(freshDocCalls).toBe(1);
    });

    it('recovers from stale-hash HTTP and opaque redirects through explicit cluster transport without escaping', async () => {
      let discoveryCalls = 0;
      let freshDocCalls = 0;
      const redirectUrl = '/openapi/v3/apis/apps/v1?hash=OLD_REDIRECT';
      const freshUrl = '/openapi/v3/apis/apps/v1?hash=NEW_AFTER_REDIRECT';

      vi.mocked(clusterRequest).mockImplementation(async (path, opts) => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          if (discoveryCalls === 1) {
            return {
              paths: {
                'apis/apps/v1': { serverRelativeURL: redirectUrl },
              },
            };
          }
          return {
            paths: {
              'apis/apps/v1': { serverRelativeURL: freshUrl },
            },
          };
        }
        if (path === redirectUrl) {
          // Verify that redirect: 'manual' was requested to prevent browser from escaping the cluster route
          expect(opts?.redirect).toBe('manual');
          const err: any = new Error('Redirected');
          err.status = 302;
          throw err;
        }
        if (path === freshUrl) {
          freshDocCalls++;
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // 3 concurrent callers encountering redirect
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          loadResourceSchema({
            cluster: 'redirect-cluster',
            apiVersion: 'apps/v1',
            kind: 'Deployment',
          })
        )
      );

      expect(results).toHaveLength(3);
      for (const res of results) {
        expect(res.sourceUrl).toBe(freshUrl);
        expect(res.schema).toBeDefined();
      }

      // Exactly 1 initial discovery + 1 deduplicated rediscovery = 2
      expect(discoveryCalls).toBe(2);
      // Replacement document fetched through cluster transport exactly once
      expect(freshDocCalls).toBe(1);
    });

    it('prevents slower stale discovery requests from overwriting newer refresh state', async () => {
      let resolveSlowDiscovery: (data: any) => void;
      const slowDiscoveryPromise = new Promise(resolve => {
        resolveSlowDiscovery = resolve;
      });

      let slowDiscoveryStarted: () => void;
      const slowStartedPromise = new Promise<void>(resolve => {
        slowDiscoveryStarted = resolve;
      });

      let discoveryCalls = 0;
      const oldUrl = '/openapi/v3/apis/apps/v1?hash=SLOWER_OLD_HASH';
      const newUrl = '/openapi/v3/apis/apps/v1?hash=FASTER_NEW_HASH';

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          if (discoveryCalls === 1) {
            slowDiscoveryStarted();
            return await slowDiscoveryPromise;
          }
          // Fast refresh returns newer hash
          return {
            paths: {
              'apis/apps/v1': { serverRelativeURL: newUrl },
            },
          };
        }
        if (path === oldUrl || path === newUrl) {
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // Start slow initial discovery (Request A)
      const reqA = loadResourceSchema({
        cluster: 'race-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      await slowStartedPromise;

      // Now issue a force refresh (Request B) which completes fast
      const reqB = await loadResourceSchema({
        cluster: 'race-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        refresh: true,
      });

      expect(reqB.sourceUrl).toBe(newUrl);

      // Now settle the older Request A with obsolete data
      resolveSlowDiscovery!({
        paths: {
          'apis/apps/v1': { serverRelativeURL: oldUrl },
        },
      });
      await reqA;

      // Subsequent call must STILL use newer state (newUrl) and not have been clobbered by Request A
      const reqC = await loadResourceSchema({
        cluster: 'race-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(reqC.sourceUrl).toBe(newUrl);
    });

    it('ensures older failed document requests do not delete newer cached promises', async () => {
      let rejectSlowDoc: (err: any) => void;
      const slowDocPromise = new Promise((_, reject) => {
        rejectSlowDoc = reject;
      });

      let slowDocStarted: () => void;
      const slowDocStartedPromise = new Promise<void>(resolve => {
        slowDocStarted = resolve;
      });

      const docUrl = '/openapi/v3/apis/apps/v1?hash=PARALLEL_DOC';
      let docCalls = 0;

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          return {
            paths: {
              'apis/apps/v1': { serverRelativeURL: docUrl },
            },
          };
        }
        if (path === docUrl) {
          docCalls++;
          if (docCalls === 1) {
            slowDocStarted();
            return await slowDocPromise;
          }
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // Start slow request that will eventually fail
      const req1 = loadResourceSchema({
        cluster: 'doc-race-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      await slowDocStartedPromise;

      // Start a refresh request that succeeds
      const req2 = await loadResourceSchema({
        cluster: 'doc-race-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        refresh: true,
      });

      expect(req2.schema).toBeDefined();

      // Now reject the slow first request
      const err: any = new Error('Network error');
      err.status = 500;
      rejectSlowDoc!(err);

      await expect(req1).rejects.toThrow('Network error');

      // Subsequent request must hit cache populated by req2 and NOT re-fetch
      const req3 = await loadResourceSchema({
        cluster: 'doc-race-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(req3.schema).toBeDefined();
      expect(docCalls).toBe(2); // Only 1 (failed) + 1 (succeeded), not 3!
    });

    it('allows retry after transient network failure and does not poison the cache', async () => {
      let shouldFail = true;

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          if (shouldFail) {
            const err: any = new Error('Connection timeout');
            err.status = 504;
            throw err;
          }
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // First call fails
      await expect(
        loadResourceSchema({
          cluster: 'retry-cluster',
          apiVersion: 'apps/v1',
          kind: 'Deployment',
        })
      ).rejects.toThrow('Connection timeout');

      // Second call succeeds
      shouldFail = false;
      const res = await loadResourceSchema({
        cluster: 'retry-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(res.schema).toBeDefined();
      expect(res.sourceFormat).toBe('openapi/v3');
    });

    it('falls back to OpenAPI v2 when /openapi/v3 is genuinely unsupported (404 / 501)', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          const err: any = new Error('Not Found');
          err.status = 404;
          throw err;
        }
        if (path === '/openapi/v2') {
          return mockOpenAPIV2FallbackDocument;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const res = await loadResourceSchema({
        cluster: 'legacy-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(res.sourceFormat).toBe('openapi/v2');
      expect(res.sourceUrl).toBe('/openapi/v2');
      expect(res.schema).toEqual(
        mockOpenAPIV2FallbackDocument.definitions!['io.k8s.api.apps.v1.Deployment']
      );
    });

    it('caches discovery misses and the v2 fallback when a resource is absent from both formats', async () => {
      let discoveryCalls = 0;
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          return {
            paths: {
              'api/v1': { serverRelativeURL: '/openapi/v3/api/v1?hash=123' },
            },
          };
        }
        if (path === '/openapi/v2') {
          return mockOpenAPIV2FallbackDocument;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // First lookup for an uninstalled CRD
      const res1 = await loadResourceSchema({
        cluster: 'uninstalled-crd-cluster',
        apiVersion: 'custom.example.com/v1alpha1',
        kind: 'UninstalledCRD',
      });

      expect(res1.schema).toBeNull();
      expect(res1.document).toBe(mockOpenAPIV2FallbackDocument);
      expect(res1.sourceFormat).toBe('openapi/v2');

      // 1 initial discovery + 1 revalidation check = 2 discovery calls
      expect(discoveryCalls).toBe(2);

      // Fetch v2 once to check for groups not advertised in v3.
      const calledPaths = vi.mocked(clusterRequest).mock.calls.map(call => call[0]);
      expect(calledPaths.filter(path => path === '/openapi/v2')).toHaveLength(1);

      // Subsequent lookups for the missing group must use the cached miss and NOT trigger any network calls
      const res2 = await loadResourceSchema({
        cluster: 'uninstalled-crd-cluster',
        apiVersion: 'custom.example.com/v1alpha1',
        kind: 'AnotherKindInMissingGroup',
      });

      expect(res2.schema).toBeNull();
      expect(res2.document).toBe(mockOpenAPIV2FallbackDocument);
      // discoveryCalls must still be 2 (no new network request made!)
      expect(discoveryCalls).toBe(2);
      expect(vi.mocked(clusterRequest).mock.calls).toHaveLength(3);

      // Explicit refresh: true must bypass the cached miss and re-check discovery
      const res3 = await loadResourceSchema({
        cluster: 'uninstalled-crd-cluster',
        apiVersion: 'custom.example.com/v1alpha1',
        kind: 'UninstalledCRD',
        refresh: true,
      });

      expect(res3.schema).toBeNull();
      expect(discoveryCalls).toBe(3);
    });

    it('checks v2 when a previously advertised group disappears from discovery', async () => {
      let discoveryCalls = 0;
      const initialDocUrl = '/openapi/v3/apis/apps/v1?hash=STALE_DELETED';

      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          discoveryCalls++;
          if (discoveryCalls === 1) {
            return {
              paths: {
                'apis/apps/v1': { serverRelativeURL: initialDocUrl },
              },
            };
          }
          // On refresh, group disappeared (CRD was uninstalled)
          return {
            paths: {
              'api/v1': { serverRelativeURL: '/openapi/v3/api/v1?hash=123' },
            },
          };
        }
        if (path === initialDocUrl) {
          const err: any = new Error('Not Found');
          err.status = 404;
          throw err;
        }
        if (path === '/openapi/v2') return mockOpenAPIV2FallbackDocument;
        throw new Error(`Unexpected path: ${path}`);
      });

      const res = await loadResourceSchema({
        cluster: 'crd-deleted-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(res.schema).toEqual(
        mockOpenAPIV2FallbackDocument.definitions!['io.k8s.api.apps.v1.Deployment']
      );
      expect(res.document).toBe(mockOpenAPIV2FallbackDocument);
      expect(res.sourceFormat).toBe('openapi/v2');

      // The missing v3 group must still be checked in v2.
      const calledPaths = vi.mocked(clusterRequest).mock.calls.map(call => call[0]);
      expect(calledPaths.filter(path => path === '/openapi/v2')).toHaveLength(1);
    });

    it('loads a v2-only aggregated API when v3 discovery is supported', async () => {
      const schema = {
        type: 'object',
        'x-kubernetes-group-version-kind': [
          { group: 'metrics.k8s.io', version: 'v1beta1', kind: 'PodMetrics' },
        ],
      };
      const document = {
        ...mockOpenAPIV2FallbackDocument,
        definitions: { PodMetrics: schema },
      };
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === '/openapi/v2') return document;
        throw new Error(`Unexpected path: ${path}`);
      });

      const result = await loadResourceSchema({
        cluster: 'aggregated-cluster',
        apiVersion: 'metrics.k8s.io/v1beta1',
        kind: 'PodMetrics',
      });

      expect(result).toEqual({
        schema,
        document,
        sourceFormat: 'openapi/v2',
        sourceUrl: '/openapi/v2',
      });
    });

    it('retains misses for alternating absent groups across discovery refreshes', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === '/openapi/v2') return mockOpenAPIV2FallbackDocument;
        throw new Error(`Unexpected path: ${path}`);
      });

      for (const apiVersion of ['missing-a/v1', 'missing-b/v1', 'missing-a/v1', 'missing-b/v1']) {
        const result = await loadResourceSchema({
          cluster: 'missing-groups',
          apiVersion,
          kind: 'Absent',
        });
        expect(result.schema).toBeNull();
      }

      const paths = vi.mocked(clusterRequest).mock.calls.map(([path]) => path);
      expect(paths.filter(path => path === '/openapi/v3')).toHaveLength(3);
      expect(paths.filter(path => path === '/openapi/v2')).toHaveLength(1);
    });

    it('clears a cached miss when a refreshed discovery advertises that group', async () => {
      let discovery = { paths: { 'apis/apps/v1': mockOpenAPIV3Discovery.paths['apis/apps/v1'] } };
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return discovery;
        if (path === '/openapi/v2') return mockOpenAPIV2FallbackDocument;
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          return mockAppsV1Document;
        }
        if (
          path ===
          mockOpenAPIV3Discovery.paths['apis/custom.example.com/v1alpha1'].serverRelativeURL
        ) {
          return mockCRDDocument;
        }
        throw new Error(`Unexpected path: ${path}`);
      });
      const params = {
        cluster: 'installed-group',
        apiVersion: 'custom.example.com/v1alpha1',
        kind: 'ControlledResource',
      };
      expect((await loadResourceSchema(params)).schema).toBeNull();

      discovery = mockOpenAPIV3Discovery;
      await loadResourceSchema({
        cluster: params.cluster,
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        refresh: true,
      });
      const installed = await loadResourceSchema(params);
      expect(installed.sourceFormat).toBe('openapi/v3');
      expect(installed.schema).not.toBeNull();

      discovery = { paths: { 'apis/apps/v1': mockOpenAPIV3Discovery.paths['apis/apps/v1'] } };
      await loadResourceSchema({
        cluster: params.cluster,
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        refresh: true,
      });
      const countBeforeMiss = vi
        .mocked(clusterRequest)
        .mock.calls.filter(([path]) => path === '/openapi/v3').length;
      await loadResourceSchema(params);
      expect(
        vi.mocked(clusterRequest).mock.calls.filter(([path]) => path === '/openapi/v3')
      ).toHaveLength(countBeforeMiss + 1);
    });

    it.each(['changed', 'removed', 'unchanged'])(
      'updates cached document URLs when discovery is refreshed (%s)',
      async change => {
        const oldUrl = mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL;
        const newUrl = '/openapi/v3/apis/apps/v1?hash=UPDATED';
        let discovery = mockOpenAPIV3Discovery;
        vi.mocked(clusterRequest).mockImplementation(async path => {
          if (path === '/openapi/v3') return discovery;
          if (path === '/openapi/v2') return mockOpenAPIV2FallbackDocument;
          if (path === oldUrl || path === newUrl) return mockAppsV1Document;
          if (path === mockOpenAPIV3Discovery.paths['api/v1'].serverRelativeURL)
            return mockCoreV1Document;
          throw new Error(`Unexpected path: ${path}`);
        });
        const params = { cluster: 'document-eviction', apiVersion: 'apps/v1', kind: 'Deployment' };
        await loadResourceSchema(params);
        const otherPaths = { 'api/v1': discovery.paths['api/v1'] };
        discovery = {
          paths:
            change === 'unchanged'
              ? mockOpenAPIV3Discovery.paths
              : change === 'changed'
              ? { ...otherPaths, 'apis/apps/v1': { serverRelativeURL: newUrl } }
              : otherPaths,
        } as typeof discovery;
        await loadResourceSchema({
          cluster: params.cluster,
          apiVersion: 'v1',
          kind: 'Pod',
          refresh: true,
        });

        discovery = mockOpenAPIV3Discovery;
        await loadResourceSchema({
          cluster: params.cluster,
          apiVersion: 'v1',
          kind: 'Pod',
          refresh: true,
        });
        await loadResourceSchema(params);
        expect(
          vi.mocked(clusterRequest).mock.calls.filter(([path]) => path === oldUrl)
        ).toHaveLength(change === 'unchanged' ? 1 : 2);
      }
    );

    it.each([401, 403, 503])(
      'preserves explicit HTTP %s document errors mentioning redirect without recovery requests',
      async status => {
        const apiVersion = 'redirect.example.com/v1';
        const url = '/openapi/v3/apis/redirect.example.com/v1?hash=denied';
        const error = Object.assign(new Error(`Access denied for ${url}`), { status });
        let discoveryCalls = 0;
        vi.mocked(clusterRequest).mockImplementation(async path => {
          if (path === '/openapi/v3') {
            discoveryCalls++;
            // An incorrect rediscovery would remove the group and allow v2 fallback.
            return discoveryCalls === 1
              ? { paths: { [`apis/${apiVersion}`]: { serverRelativeURL: url } } }
              : { paths: {} };
          }
          if (path === url) throw error;
          if (path === '/openapi/v2') return mockOpenAPIV2FallbackDocument;
          throw new Error(`Unexpected path: ${path}`);
        });

        await expect(
          loadResourceSchema({ cluster: 'denied-cluster', apiVersion, kind: 'Example' })
        ).rejects.toBe(error);
        expect(vi.mocked(clusterRequest).mock.calls.map(([path]) => path)).toEqual([
          '/openapi/v3',
          url,
        ]);
      }
    );

    it('preserves 401 and 403 authentication/authorization errors and never masks them as v3 unsupported', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          const err: any = new Error('Unauthorized');
          err.status = 401;
          throw err;
        }
        if (path === '/openapi/v2') {
          return mockOpenAPIV2FallbackDocument;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      await expect(
        loadResourceSchema({
          cluster: 'auth-cluster',
          apiVersion: 'apps/v1',
          kind: 'Deployment',
        })
      ).rejects.toThrow('Unauthorized');

      const calledPaths = vi.mocked(clusterRequest).mock.calls.map(call => call[0]);
      expect(calledPaths).not.toContain('/openapi/v2');
    });

    it('throws error and does not cache malformed discovery', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          return { unexpectedKey: 123 }; // malformed, missing paths
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      await expect(
        loadResourceSchema({
          cluster: 'malformed-cluster',
          apiVersion: 'apps/v1',
          kind: 'Deployment',
        })
      ).rejects.toThrow(/missing paths map/);
    });

    it('resetSchemaLoaderCache invalidates in-flight responses so they do not repopulate stale cache', async () => {
      let resolveFirstDoc: (val: any) => void;
      const firstDocPromise = new Promise(resolve => {
        resolveFirstDoc = resolve;
      });

      let notifyDocStarted: () => void;
      const docStartedPromise = new Promise<void>(resolve => {
        notifyDocStarted = resolve;
      });

      let callCount = 0;
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === mockOpenAPIV3Discovery.paths['apis/apps/v1'].serverRelativeURL) {
          callCount++;
          if (callCount === 1) {
            notifyDocStarted();
            return await firstDocPromise;
          }
          return mockAppsV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      // Start in-flight request
      const inFlight = loadResourceSchema({
        cluster: 'invalidation-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      // Wait until the document request has actually been dispatched
      await docStartedPromise;

      // Invalidate while first fetch is pending in flight
      resetSchemaLoaderCache('invalidation-cluster');

      // Finish first fetch
      resolveFirstDoc!(mockAppsV1Document);
      await expect(inFlight).rejects.toThrow(/cache was reset/i);

      // Now request again; it must make a fresh fetch because the invalidated request was discarded
      await loadResourceSchema({
        cluster: 'invalidation-cluster',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
      });

      expect(callCount).toBe(2);
    });
  });

  describe('Schema Fidelity & Reference Preservation', () => {
    it('preserves enum, nullable, default, and oneOf on custom resource schemas', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (
          path ===
          mockOpenAPIV3Discovery.paths['apis/custom.example.com/v1alpha1'].serverRelativeURL
        ) {
          return mockCRDDocument;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const res = await loadResourceSchema({
        cluster: 'crd-cluster',
        apiVersion: 'custom.example.com/v1alpha1',
        kind: 'ControlledResource',
      });

      expect(res.schema).toBeDefined();
      const spec = (res.schema as any).properties.spec;

      // enum and default
      expect(spec.properties.mode.enum).toEqual(['Fast', 'Safe', 'Manual']);
      expect(spec.properties.mode.default).toBe('Safe');

      // nullable
      expect(spec.properties.name.nullable).toBe(true);

      // oneOf
      expect(spec.oneOf).toEqual([{ required: ['name'] }, { required: ['selector'] }]);

      // Kubernetes extensions
      expect((res.schema as any)['x-kubernetes-preserve-unknown-fields']).toBe(false);
      expect((res.schema as any)['x-kubernetes-group-version-kind']).toEqual([
        {
          group: 'custom.example.com',
          version: 'v1alpha1',
          kind: 'ControlledResource',
        },
      ]);
    });

    it('allows resolving local $ref against the preserved document without mutation', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') return mockOpenAPIV3Discovery;
        if (path === mockOpenAPIV3Discovery.paths['api/v1'].serverRelativeURL) {
          return mockCoreV1Document;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const res = await loadResourceSchema({
        cluster: 'ref-cluster',
        apiVersion: 'v1',
        kind: 'Pod',
      });

      const metadataRef = (res.schema as any).properties.metadata.$ref;
      expect(metadataRef).toBe(
        '#/components/schemas/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta'
      );

      expect(res.document).not.toBeNull();
      const resolved = resolveLocalRef(metadataRef, res.document!);
      expect(resolved).toEqual(
        mockCoreV1Document.components!.schemas!['io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta']
      );
    });

    it.each([
      ['#/components/schemas/io%2Ek8s.api.core.v1.Pod', 'io.k8s.api.core.v1.Pod'],
      ['#/components/schemas/space%20name', 'space name'],
      ['#/components/schemas/percent%25name', 'percent%name'],
      ['#/components/schemas/slash%7E1name', 'slash/name'],
      ['#/components/schemas/tilde%7E0name', 'tilde~name'],
      ['#/components/schemas/literal%2520name', 'literal%20name'],
      ['#/components/schemas/caf%C3%A9', 'café'],
      ['#%2Fcomponents%2Fschemas%2Fspace%20name', 'space name'],
      ['#/components/schemas/slash~1name', 'slash/name'],
      ['#/components/schemas/tilde~01name', 'tilde~1name'],
    ])('resolves URI fragment %s without modifying its document', (ref, name) => {
      const schema = { type: 'object' as const };
      const document = {
        ...mockCoreV1Document,
        components: { schemas: { [name]: schema } },
      };
      const before = JSON.stringify(document);
      expect(resolveLocalRef(ref, document)).toBe(schema);
      expect(JSON.stringify(document)).toBe(before);
    });

    it.each([
      '#/components/schemas/%',
      '#/components/schemas/%2',
      '#/components/schemas/%GG',
      '#/components/schemas/%C3%28',
    ])('returns null for malformed URI fragment %s', ref => {
      expect(resolveLocalRef(ref, mockCoreV1Document)).toBeNull();
    });

    it.each(['#/components/schemas/missing', '#anchor', 'other.json#/components/schemas/Pod'])(
      'returns null for an unresolved or non-pointer URI fragment %s',
      ref => {
        expect(resolveLocalRef(ref, mockCoreV1Document)).toBeNull();
      }
    );

    it('safely handles recursive schemas without infinite recursion', async () => {
      vi.mocked(clusterRequest).mockImplementation(async path => {
        if (path === '/openapi/v3') {
          return {
            paths: {
              'apis/recursive.example.com/v1': {
                serverRelativeURL: '/openapi/v3/apis/recursive.example.com/v1?hash=rec123',
              },
            },
          };
        }
        if (path === '/openapi/v3/apis/recursive.example.com/v1?hash=rec123') {
          return mockRecursiveDocument;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const res = await loadResourceSchema({
        cluster: 'rec-cluster',
        apiVersion: 'recursive.example.com/v1',
        kind: 'TreeNode',
      });

      expect(res.schema).toBeDefined();
      expect(res.document).not.toBeNull();
      const parentRef = (res.schema as any).properties.parent.$ref;
      expect(parentRef).toBe('#/components/schemas/com.example.recursive.v1.TreeNode');

      const resolved = resolveLocalRef(parentRef, res.document!);
      expect(resolved).toBe(res.schema); // Circular self-reference intact
    });
  });
});
