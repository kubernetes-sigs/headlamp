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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThrottle } from '../../components/common/Resource/ResourceTable';
import * as apiDiscoveryModule from './api/v2/apiDiscovery';
import type { ApiResource } from './api/v2/ApiResource';
import CustomResourceDefinition from './crd';
import { KubeObject } from './KubeObject';

const mockDiscoveredResources: ApiResource[] = [
  {
    apiVersion: 'v1',
    groupName: '',
    pluralName: 'pods',
    singularName: 'pod',
    kind: 'Pod',
    version: 'v1',
    isNamespaced: true,
  },
  {
    apiVersion: 'apps/v1',
    groupName: 'apps',
    pluralName: 'deployments',
    singularName: 'deployment',
    kind: 'Deployment',
    version: 'v1',
    isNamespaced: true,
  },
  {
    apiVersion: 'stable.example.com/v1',
    groupName: 'stable.example.com',
    pluralName: 'crontabs',
    singularName: 'crontab',
    kind: 'CronTab',
    version: 'v1',
    isNamespaced: true,
  },
  {
    apiVersion: 'monitoring.coreos.com/v1',
    groupName: 'monitoring.coreos.com',
    pluralName: 'prometheuses',
    singularName: 'prometheus',
    kind: 'Prometheus',
    version: 'v1',
    isNamespaced: true,
  },
];

function createWrapper(
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CustomResourceDefinition API discovery fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useList fallback', () => {
    it('falls back to apiDiscovery when listing CRDs is forbidden (status 403)', async () => {
      vi.spyOn(KubeObject, 'useList').mockReturnValue({
        items: null,
        error: { status: 403, message: 'customresourcedefinitions is forbidden' },
        errors: [{ status: 403, message: 'customresourcedefinitions is forbidden' }],
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        clusterResults: {},
        data: null,
        dataUpdatedAt: 0,
        hasMore: false,
        remainingItemCount: undefined,
        loadMore: undefined,
        *[Symbol.iterator]() {
          yield null;
          yield { status: 403 };
        },
      } as any);

      const discoverySpy = vi
        .spyOn(apiDiscoveryModule, 'discoverClusterApiResources')
        .mockResolvedValue(mockDiscoveredResources);

      const { result } = renderHook(
        () => CustomResourceDefinition.useList({ cluster: 'test-cluster' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.items).not.toBeNull();
      });

      expect(discoverySpy).toHaveBeenCalledWith('test-cluster');
      expect(result.current.error).toBeNull();
      expect(result.current.isError).toBe(false);
      expect(result.current.items).toHaveLength(2);

      const cronTabCrd = result.current.items?.find(
        (it: any) => it.metadata.name === 'crontabs.stable.example.com'
      );
      expect(cronTabCrd).toBeDefined();
      expect(cronTabCrd!.spec.names.kind).toBe('CronTab');
      expect(cronTabCrd!.spec.scope).toBe('Namespaced');

      // Verify that the synthesized CRD spec is usable to create a CRClass
      const crClass = cronTabCrd!.makeCRClassOrNull();
      expect(crClass).not.toBeNull();
      expect(crClass!.kind).toBe('CronTab');
    });

    it('falls back when error message indicates forbidden access', async () => {
      vi.spyOn(KubeObject, 'useList').mockReturnValue({
        items: null,
        error: new Error(
          'customresourcedefinitions.apiextensions.k8s.io is forbidden: User "system:serviceaccount:default:sa" cannot list resource "customresourcedefinitions" in API group "apiextensions.k8s.io" at the cluster scope'
        ),
        errors: [],
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        clusterResults: {},
        data: null,
        dataUpdatedAt: 0,
        hasMore: false,
        remainingItemCount: undefined,
        loadMore: undefined,
        *[Symbol.iterator]() {
          yield null;
          yield new Error('forbidden');
        },
      } as any);

      vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources').mockResolvedValue(
        mockDiscoveredResources
      );

      const { result } = renderHook(
        () => CustomResourceDefinition.useList({ cluster: 'prod-cluster' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.items).not.toBeNull();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.items?.map((it: any) => it.metadata.name)).toEqual([
        'crontabs.stable.example.com',
        'prometheuses.monitoring.coreos.com',
      ]);
    });

    it('does not fall back when error is not a 403 / permission error', () => {
      const serverError = { status: 500, message: 'Internal Server Error' };
      vi.spyOn(KubeObject, 'useList').mockReturnValue({
        items: null,
        error: serverError,
        errors: [serverError],
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        clusterResults: {},
        data: null,
        dataUpdatedAt: 0,
        hasMore: false,
        remainingItemCount: undefined,
        loadMore: undefined,
        *[Symbol.iterator]() {
          yield null;
          yield serverError;
        },
      } as any);

      const discoverySpy = vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources');

      const { result } = renderHook(
        () => CustomResourceDefinition.useList({ cluster: 'test-cluster' }),
        { wrapper: createWrapper() }
      );

      expect(discoverySpy).not.toHaveBeenCalled();
      expect(result.current.error).toBe(serverError);
      expect(result.current.items).toBeNull();
    });

    it('returns normal list result when listing succeeds', () => {
      const mockCrd = new CustomResourceDefinition({
        kind: 'CustomResourceDefinition',
        apiVersion: 'apiextensions.k8s.io/v1',
        metadata: {
          name: 'real.example.com',
          uid: 'real-1',
          creationTimestamp: new Date().toISOString(),
        },
        spec: {
          group: 'example.com',
          version: 'v1',
          names: { plural: 'reals', singular: 'real', kind: 'Real', listKind: 'RealList' },
          versions: [{ name: 'v1', served: true, storage: true, additionalPrinterColumns: [] }],
          scope: 'Namespaced',
        },
      });

      vi.spyOn(KubeObject, 'useList').mockReturnValue({
        items: [mockCrd],
        error: null,
        errors: null,
        isLoading: false,
        isFetching: false,
        isError: false,
        isSuccess: true,
        clusterResults: {},
        data: null,
        dataUpdatedAt: 100,
        hasMore: false,
        remainingItemCount: undefined,
        loadMore: undefined,
        *[Symbol.iterator]() {
          yield [mockCrd];
          yield null;
        },
      } as any);

      const discoverySpy = vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources');

      const { result } = renderHook(
        () => CustomResourceDefinition.useList({ cluster: 'test-cluster' }),
        { wrapper: createWrapper() }
      );

      expect(discoverySpy).not.toHaveBeenCalled();
      expect(result.current.items).toEqual([mockCrd]);
      expect(result.current.error).toBeNull();
    });

    it('limits discovery fallback to forbidden clusters and preserves real CRDs and non-403 errors', async () => {
      const realCrd = new CustomResourceDefinition({
        kind: 'CustomResourceDefinition',
        apiVersion: 'apiextensions.k8s.io/v1',
        metadata: {
          name: 'real.example.com',
          uid: 'real-1',
          creationTimestamp: new Date().toISOString(),
        },
        spec: {
          group: 'example.com',
          version: 'v1',
          names: { plural: 'reals', singular: 'real', kind: 'Real', listKind: 'RealList' },
          versions: [
            {
              name: 'v1',
              served: true,
              storage: true,
              additionalPrinterColumns: [
                { name: 'Phase', type: 'string', jsonPath: '.status.phase' },
              ],
            },
          ],
          scope: 'Namespaced',
        },
      });
      realCrd.cluster = 'cluster-a';

      const forbiddenB = { status: 403, message: 'Forbidden', cluster: 'cluster-b' };
      const serverErrC = { status: 500, message: 'Internal Server Error', cluster: 'cluster-c' };

      vi.spyOn(KubeObject, 'useList').mockReturnValue({
        items: [realCrd],
        error: forbiddenB,
        errors: [forbiddenB, serverErrC],
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        clusterResults: {
          'cluster-a': {
            data: null,
            error: null,
            errors: null,
            isError: false,
            isFetching: false,
            isLoading: false,
            isSuccess: true,
            items: [realCrd],
            status: 'success',
          },
        },
        data: null,
        dataUpdatedAt: 100,
        hasMore: false,
        remainingItemCount: undefined,
        loadMore: undefined,
        *[Symbol.iterator]() {
          yield [realCrd];
          yield forbiddenB;
        },
      } as any);

      const discoverySpy = vi
        .spyOn(apiDiscoveryModule, 'discoverClusterApiResources')
        .mockResolvedValue([
          {
            apiVersion: 'widgets.io/v1',
            groupName: 'widgets.io',
            pluralName: 'widgets',
            singularName: 'widget',
            kind: 'Widget',
            version: 'v1',
            isNamespaced: true,
          },
        ]);

      const { result } = renderHook(
        () =>
          CustomResourceDefinition.useList({ clusters: ['cluster-a', 'cluster-b', 'cluster-c'] }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.clusterResults?.['cluster-b']?.isSuccess).toBe(true);
      });

      // Discovery only ran for forbidden cluster-b, not cluster-a or cluster-c.
      expect(discoverySpy).toHaveBeenCalledTimes(1);
      expect(discoverySpy).toHaveBeenCalledWith('cluster-b');

      // Preserves cluster-a real CRD (with printer columns) and merges cluster-b synthetic CRD.
      expect(result.current.items?.map((it: any) => `${it.cluster}:${it.metadata.name}`)).toEqual([
        'cluster-a:real.example.com',
        'cluster-b:widgets.widgets.io',
      ]);
      const preservedReal = result.current.items?.find(
        (it: any) => it.metadata.name === 'real.example.com'
      );
      expect(preservedReal?.spec.versions[0].additionalPrinterColumns).toHaveLength(1);

      // Preserves non-403 server error from cluster-c.
      expect(result.current.error).toBe(serverErrC);
      expect(result.current.errors).toEqual([serverErrC]);
      expect(result.current.isError).toBe(true);
    });

    it('preserves distinct per-cluster resources when multiple clusters are forbidden', async () => {
      const forbiddenA = { status: 403, message: 'Forbidden', cluster: 'cluster-a' };
      const forbiddenB = { status: 403, message: 'Forbidden', cluster: 'cluster-b' };

      vi.spyOn(KubeObject, 'useList').mockReturnValue({
        items: null,
        error: forbiddenA,
        errors: [forbiddenA, forbiddenB],
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        clusterResults: {},
        data: null,
        dataUpdatedAt: 0,
        hasMore: false,
        remainingItemCount: undefined,
        loadMore: undefined,
        *[Symbol.iterator]() {
          yield null;
          yield forbiddenA;
        },
      } as any);

      vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources').mockImplementation(
        async cluster => {
          if (cluster === 'cluster-a') {
            return [
              {
                apiVersion: 'widgets.io/v1',
                groupName: 'widgets.io',
                pluralName: 'widgets',
                singularName: 'widget',
                kind: 'Widget',
                version: 'v1',
                isNamespaced: true,
              },
            ];
          }
          return [
            {
              apiVersion: 'gadgets.io/v1beta1',
              groupName: 'gadgets.io',
              pluralName: 'gadgets',
              singularName: 'gadget',
              kind: 'Gadget',
              version: 'v1beta1',
              isNamespaced: false,
            },
          ];
        }
      );

      const { result } = renderHook(
        () => CustomResourceDefinition.useList({ clusters: ['cluster-a', 'cluster-b'] }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.items?.map((it: any) => `${it.cluster}:${it.metadata.name}`)).toEqual([
        'cluster-a:widgets.widgets.io',
        'cluster-b:gadgets.gadgets.io',
      ]);
      expect(
        result.current.clusterResults?.['cluster-a']?.items?.map((it: any) => it.metadata.name)
      ).toEqual(['widgets.widgets.io']);
      expect(
        result.current.clusterResults?.['cluster-b']?.items?.map((it: any) => it.metadata.name)
      ).toEqual(['gadgets.gadgets.io']);
    });

    it('propagates discovery errors instead of returning empty results', async () => {
      vi.spyOn(KubeObject, 'useList').mockReturnValue({
        items: null,
        error: { status: 403, message: 'Forbidden', cluster: 'test-cluster' },
        errors: [{ status: 403, message: 'Forbidden', cluster: 'test-cluster' }],
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        clusterResults: {},
        data: null,
        dataUpdatedAt: 0,
        hasMore: false,
        remainingItemCount: undefined,
        loadMore: undefined,
        *[Symbol.iterator]() {
          yield null;
          yield { status: 403 };
        },
      } as any);

      const discoveryError = new Error('Discovery 500 failure');
      vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources').mockRejectedValue(discoveryError);

      const { result } = renderHook(
        () => CustomResourceDefinition.useList({ cluster: 'test-cluster' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(discoveryError);
      expect(result.current.errors).toEqual([discoveryError]);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.items).toBeNull();
    });

    it('keeps merged items reference-stable so real useThrottle stops re-rendering after discovery', async () => {
      vi.useFakeTimers();
      try {
        const forbiddenErr = { status: 403, message: 'Forbidden', cluster: 'test-cluster' };
        vi.spyOn(KubeObject, 'useList').mockImplementation(
          () =>
            ({
              items: null,
              error: forbiddenErr,
              // Simulate useKubeObjectList returning a fresh errors array on every render.
              errors: [forbiddenErr],
              isLoading: false,
              isFetching: false,
              isError: true,
              isSuccess: false,
              clusterResults: {},
              data: null,
              dataUpdatedAt: 0,
              hasMore: false,
              remainingItemCount: undefined,
              loadMore: undefined,
              *[Symbol.iterator]() {
                yield null;
                yield forbiddenErr;
              },
            } as any)
        );

        vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources').mockResolvedValue(
          mockDiscoveredResources
        );

        let renderCount = 0;
        const { result } = renderHook(
          () => {
            renderCount++;
            const [items, error] = CustomResourceDefinition.useList({ cluster: 'test-cluster' });
            const throttledItems = useThrottle(items, 1000);
            return { items, error, throttledItems };
          },
          { wrapper: createWrapper() }
        );

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1100);
        });

        expect(result.current.error).toBeNull();
        expect(result.current.throttledItems).toHaveLength(2);

        const stableRenderCount = renderCount;
        const stableItems = result.current.items;
        const stableThrottledItems = result.current.throttledItems;

        await act(async () => {
          await vi.advanceTimersByTimeAsync(4000);
        });

        expect(renderCount).toBe(stableRenderCount);
        expect(result.current.items).toBe(stableItems);
        expect(result.current.throttledItems).toBe(stableThrottledItems);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('useGet fallback', () => {
    it('falls back to apiDiscovery when getting a CRD is forbidden (status 403)', async () => {
      vi.spyOn(KubeObject, 'useGet').mockReturnValue({
        data: null,
        error: { status: 403, message: 'Forbidden' },
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        status: 'error',
        *[Symbol.iterator]() {
          yield null;
          yield { status: 403 };
        },
      } as any);

      const discoverySpy = vi
        .spyOn(apiDiscoveryModule, 'discoverClusterApiResources')
        .mockResolvedValue(mockDiscoveredResources);

      const { result } = renderHook(
        () =>
          CustomResourceDefinition.useGet('crontabs.stable.example.com', undefined, {
            cluster: 'test-cluster',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(discoverySpy).toHaveBeenCalledWith('test-cluster');
      expect(result.current.error).toBeNull();
      expect(result.current.data?.metadata.name).toBe('crontabs.stable.example.com');
      expect(result.current.data?.spec.names.kind).toBe('CronTab');
    });

    it('finds CRD by kind or plural name', async () => {
      vi.spyOn(KubeObject, 'useGet').mockReturnValue({
        data: null,
        error: { status: 403, message: 'Forbidden' },
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        status: 'error',
        *[Symbol.iterator]() {
          yield null;
          yield { status: 403 };
        },
      } as any);

      vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources').mockResolvedValue(
        mockDiscoveredResources
      );

      const { result } = renderHook(
        () =>
          CustomResourceDefinition.useGet('CronTab', undefined, {
            cluster: 'test-cluster',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data?.metadata.name).toBe('crontabs.stable.example.com');
    });

    it('preserves original forbidden error and marks failure when discovery finds no matching CRD', async () => {
      const forbiddenError = { status: 403, message: 'Forbidden' };
      vi.spyOn(KubeObject, 'useGet').mockReturnValue({
        data: null,
        error: forbiddenError,
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        status: 'error',
        *[Symbol.iterator]() {
          yield null;
          yield forbiddenError;
        },
      } as any);

      vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources').mockResolvedValue(
        mockDiscoveredResources
      );

      const { result } = renderHook(
        () =>
          CustomResourceDefinition.useGet('nonexistent.example.com', undefined, {
            cluster: 'test-cluster',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe(forbiddenError);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.status).toBe('error');
    });

    it('propagates discovery errors in useGet fallback', async () => {
      vi.spyOn(KubeObject, 'useGet').mockReturnValue({
        data: null,
        error: { status: 403, message: 'Forbidden' },
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        status: 'error',
        *[Symbol.iterator]() {
          yield null;
          yield { status: 403 };
        },
      } as any);

      const discoveryError = new Error('Discovery endpoint unavailable');
      vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources').mockRejectedValue(discoveryError);

      const { result } = renderHook(
        () =>
          CustomResourceDefinition.useGet('crontabs.stable.example.com', undefined, {
            cluster: 'test-cluster',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe(discoveryError);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.status).toBe('error');
    });

    it('does not fall back when error is not forbidden', () => {
      const notFoundError = { status: 404, message: 'Not Found' };
      vi.spyOn(KubeObject, 'useGet').mockReturnValue({
        data: null,
        error: notFoundError,
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        status: 'error',
        *[Symbol.iterator]() {
          yield null;
          yield notFoundError;
        },
      } as any);

      const discoverySpy = vi.spyOn(apiDiscoveryModule, 'discoverClusterApiResources');

      const { result } = renderHook(
        () =>
          CustomResourceDefinition.useGet('widgets.example.com', undefined, {
            cluster: 'test-cluster',
          }),
        { wrapper: createWrapper() }
      );

      expect(discoverySpy).not.toHaveBeenCalled();
      expect(result.current.error).toBe(notFoundError);
      expect(result.current.data).toBeNull();
    });

    it('surfaces discovery refetch errors and clears cached fallback data', async () => {
      vi.spyOn(KubeObject, 'useGet').mockReturnValue({
        data: null,
        error: { status: 403, message: 'Forbidden' },
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        status: 'error',
        *[Symbol.iterator]() {
          yield null;
          yield { status: 403 };
        },
      } as any);

      const refetchError = new Error('Discovery refetch failed');
      const discoverySpy = vi
        .spyOn(apiDiscoveryModule, 'discoverClusterApiResources')
        .mockResolvedValueOnce(mockDiscoveredResources)
        .mockRejectedValueOnce(refetchError);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      });

      const { result } = renderHook(
        () =>
          CustomResourceDefinition.useGet('crontabs.stable.example.com', undefined, {
            cluster: 'test-cluster',
          }),
        { wrapper: createWrapper(queryClient) }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data?.metadata.name).toBe('crontabs.stable.example.com');
      expect(result.current.error).toBeNull();

      await act(async () => {
        await queryClient.refetchQueries({
          queryKey: ['api-discovery-crd-fallback', 'test-cluster'],
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(discoverySpy).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBe(refetchError);
      expect(result.current.data).toBeNull();
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.status).toBe('error');
    });
  });
});
