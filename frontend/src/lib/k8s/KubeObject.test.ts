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
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  createElement,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { MemoryRouter } from 'react-router-dom';
import { type MockInstance, vi } from 'vitest';

vi.mock('../cluster', () => ({
  formatClusterPathParam: vi.fn(),
  getCluster: vi.fn(),
  getSelectedClusters: vi.fn(),
}));
const discoveryStore = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    version: 0,
    listeners,
    bump() {
      this.version++;
      listeners.forEach(listener => listener());
    },
  };
});
vi.mock('../../helpers/clusterSettings', () => ({
  loadClusterSettings: vi.fn(),
  getCombinedAllowedNamespaces: vi.fn(() => []),
  hasAllowedNamespacesRestriction: vi.fn(() => false),
  isRestrictedOnlyByDiscovery: vi.fn(() => false),
  subscribeDiscoveredNamespaces: (listener: () => void) => {
    discoveryStore.listeners.add(listener);
    return () => discoveryStore.listeners.delete(listener);
  },
  getDiscoveredNamespacesVersion: () => discoveryStore.version,
  getDiscoveryGeneration: () => 0,
}));
vi.mock('../router/createRouteURL', () => ({ createRouteURL: vi.fn() }));
vi.mock('../util', () => ({ timeAgo: vi.fn() }));
vi.mock('./api/v1/clusterRequests', () => ({ post: vi.fn() }));
vi.mock('./api/v1/factories', () => ({
  apiFactory: vi.fn(),
  apiFactoryWithNamespace: vi.fn(),
}));
const { actualUseConnectApi } = vi.hoisted(() => ({
  actualUseConnectApi: {
    current: undefined as unknown as typeof import('./api/v1/hooks').useConnectApi,
  },
}));

vi.mock('./api/v1/hooks', async importOriginal => {
  const actual: typeof import('./api/v1/hooks') = await importOriginal();
  // Keep the real hook reachable through a plain reference: mock implementations
  // are wiped by vi.resetAllMocks(), which other suites in this file call.
  actualUseConnectApi.current = actual.useConnectApi;
  return {
    ...actual,
    useConnectApi: vi.fn(),
    useSelectedClusters: vi.fn(),
  };
});
vi.mock('./api/v2/hooks', () => ({ useKubeObject: vi.fn() }));
vi.mock('./api/v2/useKubeObjectList', () => ({
  makeListRequests: vi.fn(),
  useKubeObjectList: vi.fn(),
}));
vi.mock('./patchUtils', () => ({
  computePatchOperations: vi.fn(),
  computeRawPatchCount: vi.fn(),
}));

import {
  getCombinedAllowedNamespaces,
  hasAllowedNamespacesRestriction,
  isRestrictedOnlyByDiscovery,
} from '../../helpers/clusterSettings';
import { getCluster } from '../cluster';
import { AllowedNamespacesResolutionContext } from './allowedNamespacesContext';
import { post } from './api/v1/clusterRequests';
import { ApiClient, ApiWithNamespaceClient } from './api/v1/factories';
import { useConnectApi, useSelectedClusters } from './api/v1/hooks';
import { ScaleApi } from './api/v1/scaleApi';
import { ApiError } from './api/v2/ApiError';
import { makeListRequests, useKubeObjectList } from './api/v2/useKubeObjectList';
import { KubeObject, KubeObjectInterface } from './KubeObject';
import { computePatchOperations, computeRawPatchCount } from './patchUtils';

function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe('KubeObject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    vi.mocked(useKubeObjectList).mockReturnValue({} as any);
  });

  describe('KubeObject requests and editing', () => {
    class Widget extends KubeObject<KubeObjectInterface> {
      static apiVersion = 'example.test/v1';
      static apiName = 'widgets';
      static kind = 'Widget';
      static isNamespaced = true;
    }

    const data: KubeObjectInterface = {
      apiVersion: 'example.test/v1',
      kind: 'Widget',
      metadata: {
        name: 'sample',
        namespace: 'apps',
        uid: 'sample-uid',
        creationTimestamp: '2026-01-01T00:00:00Z',
      },
      spec: { replicas: 1 },
    };
    let endpoint: ApiWithNamespaceClient<KubeObjectInterface>;

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(getCluster).mockReturnValue('selected');
      endpoint = {
        isNamespaced: true,
        apiInfo: [
          { group: 'example.test', version: 'v1', resource: 'widgets' },
          { group: 'example.test', version: 'v1beta1', resource: 'widgets' },
        ],
        list: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['list']>(),
        get: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['get']>(),
        post: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['post']>(),
        put: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['put']>(),
        patch: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['patch']>(),
        jsonPatch: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['jsonPatch']>(),
        delete: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['delete']>(),
      };
      Widget.apiEndpoint = endpoint;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('removes nested readonly fields without modifying the original resource', () => {
      class EditableWidget extends Widget {
        static readOnlyFields = ['$.metadata.resourceVersion', '$.spec.containers[*].status'];
      }
      const original = {
        ...data,
        metadata: { ...data.metadata, resourceVersion: '42' },
        spec: { containers: [{ name: 'app', status: 'running' }] },
      };

      const editable = new EditableWidget(original).getEditableObject();

      expect(editable).toEqual({
        ...data,
        spec: { containers: [{ name: 'app' }] },
      });
      expect(original.metadata.resourceVersion).toBe('42');
      expect(original.spec.containers[0].status).toBe('running');
    });

    /** The connect thunks handed to useConnectApi by the first render. */
    function connectedApiCalls(): Array<() => any> {
      return vi.mocked(useConnectApi).mock.calls[0][0] as unknown as Array<() => any>;
    }

    it('uses allowed namespaces when a namespaced list has no explicit namespace', async () => {
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['permitted']);
      vi.mocked(endpoint.list).mockResolvedValue(vi.fn());
      renderHook(() => Widget.useApiList(vi.fn(), undefined, { cluster: 'selected' }));

      await connectedApiCalls()[0]();

      expect(getCombinedAllowedNamespaces).toHaveBeenCalledWith('selected');
      expect(endpoint.list).toHaveBeenCalledWith(
        'permitted',
        expect.any(Function),
        undefined,
        {},
        'selected'
      );
    });

    it('preserves selectors, errors and cancellation for each explicitly requested namespace', async () => {
      const cancel = vi.fn();
      const onError = vi.fn();
      vi.mocked(endpoint.list).mockResolvedValue(cancel);
      renderHook(() =>
        Widget.useApiList(vi.fn(), onError, {
          namespace: ['one', 'two'],
          labelSelector: 'app=example',
          fieldSelector: 'metadata.name=sample',
          limit: 5,
          cluster: 'east',
        })
      );

      for (const request of connectedApiCalls()) {
        const stop = await request();
        stop();
      }

      expect(getCombinedAllowedNamespaces).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(2);
      for (const namespace of ['one', 'two']) {
        expect(endpoint.list).toHaveBeenCalledWith(
          namespace,
          expect.any(Function),
          expect.any(Function),
          { labelSelector: 'app=example', fieldSelector: 'metadata.name=sample', limit: 5 },
          'east'
        );
      }
      const error = new ApiError('request failed');
      const cancelOnError = vi.fn();
      for (const [, , errorHandler] of vi.mocked(endpoint.list).mock.calls) {
        errorHandler?.(error, cancelOnError);
      }
      expect(onError).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenLastCalledWith(error, cancelOnError);
    });

    it('uses an all-namespace request when no cluster or restriction is selected', async () => {
      vi.mocked(getCluster).mockReturnValue(null);
      vi.mocked(endpoint.list).mockResolvedValue(vi.fn());
      renderHook(() => Widget.useApiList(vi.fn()));

      await connectedApiCalls()[0]();

      expect(endpoint.list).toHaveBeenCalledWith(
        '',
        expect.any(Function),
        undefined,
        {},
        undefined
      );
      expect(getCombinedAllowedNamespaces).not.toHaveBeenCalled();
    });

    it('wraps a get response and forwards request errors and cancellation', async () => {
      const cancel = vi.fn();
      const onError = vi.fn();
      vi.mocked(endpoint.get).mockImplementation(async (_namespace, _name, onGet) => {
        onGet(data);
        return cancel;
      });
      const onGet = vi.fn();
      renderHook(() => Widget.useApiGet(onGet, 'sample', 'apps', onError, { cluster: 'east' }));

      expect(await connectedApiCalls()[0]()).toBe(cancel);
      expect(endpoint.get).toHaveBeenCalledWith(
        'apps',
        'sample',
        expect.any(Function),
        onError,
        undefined,
        'east'
      );
      expect(onGet).toHaveBeenCalledWith(expect.objectContaining({ jsonData: data }));
    });

    it('sets background propagation and immediate deletion for a forced Job deletion', () => {
      class Job extends Widget {
        static kind = 'Job';
      }
      new Job({ ...data, kind: 'Job' }, 'east').delete(true);

      expect(endpoint.delete).toHaveBeenCalledWith(
        'apps',
        'sample',
        { propagationPolicy: 'Background', gracePeriodSeconds: 0 },
        'east'
      );
    });

    it('sends merge patches with the resource namespace and cluster', () => {
      new Widget(data, 'east').patch({ spec: { replicas: 3 } });

      expect(endpoint.patch).toHaveBeenCalledWith(
        { spec: { replicas: 3 } },
        'apps',
        'sample',
        {},
        'east'
      );
    });

    it('sends only editable JSON patch operations to the namespaced endpoint', async () => {
      const operations = [{ op: 'replace' as const, path: '/spec/replicas', value: 3 }];
      vi.mocked(computePatchOperations).mockReturnValue(operations);
      vi.mocked(endpoint.jsonPatch).mockResolvedValue(data);

      await expect(new Widget(data, 'east').patchUpdate(data, data)).resolves.toBe(data);
      expect(endpoint.jsonPatch).toHaveBeenCalledWith(operations, 'apps', 'sample', {}, 'east');
    });

    it('rejects edits limited to server-managed fields rather than silently discarding them', async () => {
      vi.mocked(computePatchOperations).mockReturnValue([]);
      vi.mocked(computeRawPatchCount).mockReturnValue(2);

      await expect(new Widget(data).patchUpdate(data, data)).rejects.toThrow(
        'No editable changes to apply: all 2 change(s) for sample were in server-managed fields'
      );
      expect(endpoint.jsonPatch).not.toHaveBeenCalled();
    });

    it('does not send a patch for an unchanged resource', async () => {
      vi.mocked(computePatchOperations).mockReturnValue([]);
      vi.mocked(computeRawPatchCount).mockReturnValue(0);

      await expect(new Widget(data).patchUpdate(data, data)).resolves.toBe(data);
      expect(endpoint.jsonPatch).not.toHaveBeenCalled();
    });

    it('rejects scaling resources whose endpoint has no scale API', () => {
      expect(() => new Widget(data).scale(3)).toThrow('This class has no scale API: Widget');
    });

    it('passes replica changes, metadata and cluster to the scale subresource', async () => {
      const patch = vi.fn<ScaleApi['patch']>().mockResolvedValue(data);
      Widget.apiEndpoint = {
        ...endpoint,
        scale: { get: vi.fn(), put: vi.fn(), patch },
      };

      await new Widget(data, 'east').scale(3);

      expect(patch).toHaveBeenCalledWith({ spec: { replicas: 3 } }, data.metadata, 'east');
    });

    it('does not insert a namespace into a cluster-scoped JSON patch request', async () => {
      class ClusterWidget extends Widget {
        static isNamespaced = false;
      }
      const jsonPatch = vi
        .fn<ApiClient<KubeObjectInterface>['jsonPatch']>()
        .mockResolvedValue(data);
      const client: ApiClient<KubeObjectInterface> = {
        ...endpoint,
        isNamespaced: false,
        list: vi.fn(),
        get: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        jsonPatch,
      };
      ClusterWidget.apiEndpoint = client;
      const operations = [{ op: 'replace' as const, path: '/spec/replicas', value: 3 }];
      vi.mocked(computePatchOperations).mockReturnValue(operations);

      await new ClusterWidget(data, 'east').patchUpdate(data, data);

      expect(jsonPatch).toHaveBeenCalledWith(operations, 'sample', {}, 'east');
    });

    it('retries authorization on the beta review API only for a missing stable API', async () => {
      const result = { status: { allowed: true } };
      vi.mocked(post).mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce(result);

      await expect(
        Widget.fetchAuthorization({ verb: 'get', resource: 'widgets' }, 'east')
      ).resolves.toEqual(result);
      expect(post).toHaveBeenNthCalledWith(
        2,
        '/apis/authorization.k8s.io/v1beta1/selfsubjectaccessreviews',
        {
          kind: 'SelfSubjectAccessReview',
          apiVersion: 'authorization.k8s.io/v1beta1',
          spec: { resourceAttributes: { verb: 'get', resource: 'widgets' } },
        },
        false,
        { cluster: 'east' }
      );
    });

    it('does not retry forbidden authorization requests', async () => {
      const error = { status: 403 };
      vi.mocked(post).mockRejectedValue(error);

      await expect(Widget.fetchAuthorization({ verb: 'get' }, 'east')).rejects.toBe(error);
      expect(post).toHaveBeenCalledOnce();
    });

    it('propagates a missing authorization API after both supported versions fail', async () => {
      const error = { status: 404 };
      vi.mocked(post).mockRejectedValue(error);

      await expect(Widget.fetchAuthorization({ verb: 'get' }, 'east')).rejects.toBe(error);
      expect(post).toHaveBeenCalledTimes(2);
    });

    it('falls back to the next resource API version after a not-found authorization result', async () => {
      const result = { status: { allowed: true } };
      const fetch = vi
        .spyOn(Widget, 'fetchAuthorization')
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce(result);

      await expect(Widget.getAuthorization('list', undefined, 'east')).resolves.toEqual(result);
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        { verb: 'list', resource: 'widgets', group: 'example.test', version: 'v1beta1' },
        'east'
      );
    });

    it('propagates resource authorization errors without trying unrelated API versions', async () => {
      const error = { status: 403 };
      const fetch = vi.spyOn(Widget, 'fetchAuthorization').mockRejectedValue(error);

      await expect(Widget.getAuthorization('list', undefined, 'east')).rejects.toBe(error);
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  it('returns no API group when the class does not define an API version', () => {
    expect(KubeObject.apiGroupName).toBeUndefined();
  });

  it('matches subclasses that define a custom API group and kind', () => {
    class MyResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyResourceKind';
    }

    expect(
      MyResource.isClassOf(
        new MyResource({ kind: 'MyResourceKind', metadata: { name: 'my-test-resource' } })
      )
    ).toBe(true);
  });

  it('uses exact namespace requests instead of constructing a cross-product', () => {
    class MyNamespacedResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyNamespacedResource';
      static apiName = 'mynamespacedresources';
      static isNamespaced = true;
    }
    const requests = [
      { cluster: 'cluster-a', namespaces: ['foo'] },
      { cluster: 'cluster-b', namespaces: ['bar'] },
    ];

    renderHook(
      () =>
        MyNamespacedResource.useList({
          clusters: ['cluster-a', 'cluster-b'],
          namespace: ['foo', 'bar'],
          requests,
        }),
      { wrapper: queryWrapper() }
    );

    expect(makeListRequests).not.toHaveBeenCalled();
    expect(useKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({ kubeObjectClass: MyNamespacedResource, requests })
    );
  });

  it('recomputes list requests when discovered namespaces change, also outside the gate', () => {
    class MyNamespacedResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyNamespacedResource';
      static apiName = 'mynamespacedresources';
      static isNamespaced = true;
    }
    vi.mocked(makeListRequests).mockReturnValue([]);

    renderHook(() => MyNamespacedResource.useList({ clusters: ['cluster-a'] }), {
      wrapper: queryWrapper(),
    });
    const callsBefore = vi.mocked(makeListRequests).mock.calls.length;

    act(() => discoveryStore.bump());

    expect(vi.mocked(makeListRequests).mock.calls.length).toBe(callsBefore + 1);
  });

  describe('with a restriction that only comes from namespace discovery', () => {
    class MyJob extends KubeObject {
      static apiVersion = 'batch/v1';
      static kind = 'Job';
      static apiName = 'jobs';
      static isNamespaced = true;
    }

    beforeEach(() => {
      vi.mocked(isRestrictedOnlyByDiscovery).mockReturnValue(true);
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      // Discovery found no namespace: none of its probes is allowed anywhere.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
      vi.mocked(makeListRequests).mockReturnValue([]);
    });

    afterEach(() => {
      vi.mocked(isRestrictedOnlyByDiscovery).mockReturnValue(false);
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(false);
    });

    function lastRouting() {
      const call = vi.mocked(makeListRequests).mock.calls.at(-1)!;
      const [, allowedNamespacesFor, , , isRestricted] = call;
      return { allowed: allowedNamespacesFor('cluster-a'), restricted: isRestricted!('cluster-a') };
    }

    it('keeps the cluster-wide request for kinds the user may list cluster-wide', async () => {
      vi.mocked(post).mockResolvedValue({ status: { allowed: true } });

      renderHook(() => MyJob.useList({ clusters: ['cluster-a'] }), { wrapper: queryWrapper() });

      await waitFor(() => expect(lastRouting()).toEqual({ allowed: [], restricted: false }));
      expect(post).toHaveBeenCalledWith(
        '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
        expect.objectContaining({
          spec: { resourceAttributes: { verb: 'list', group: 'batch', resource: 'jobs' } },
        }),
        false,
        { cluster: 'cluster-a' }
      );
    });

    it('keeps explicitly requested namespaces that discovery did not find', async () => {
      vi.mocked(post).mockResolvedValue({ status: { allowed: false } });

      renderHook(() => MyJob.useList({ clusters: ['cluster-a'], namespace: 'team-jobs' }), {
        wrapper: queryWrapper(),
      });

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(lastRouting()).toEqual({ allowed: [], restricted: false });
    });

    it('treats an empty namespace as all namespaces, not as an explicit request', async () => {
      vi.mocked(post).mockResolvedValue({ status: { allowed: false } });
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['team-a']);

      renderHook(() => MyJob.useList({ clusters: ['cluster-a'], namespace: '' }), {
        wrapper: queryWrapper(),
      });

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(lastRouting()).toEqual({ allowed: ['team-a'], restricted: true });
      expect(vi.mocked(makeListRequests).mock.calls.at(-1)![3]).toBeUndefined();
    });

    it('applies the discovered namespaces when the kind cannot be listed cluster-wide', async () => {
      vi.mocked(post).mockResolvedValue({ status: { allowed: false } });

      renderHook(() => MyJob.useList({ clusters: ['cluster-a'] }), { wrapper: queryWrapper() });

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(lastRouting()).toEqual({ allowed: [], restricted: true });
    });
  });

  it('removes namespaces from exact requests for cluster-scoped resources', () => {
    class MyClusterResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyClusterResource';
      static apiName = 'myclusterresources';
      static isNamespaced = false;
    }

    renderHook(
      () =>
        MyClusterResource.useList({
          requests: [{ cluster: 'cluster-a', namespaces: ['foo'] }],
        }),
      { wrapper: queryWrapper() }
    );

    expect(useKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({
        kubeObjectClass: MyClusterResource,
        requests: [{ cluster: 'cluster-a', namespaces: undefined }],
      })
    );
  });

  it('uses an explicit cluster for instance authorization checks', async () => {
    class MyResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static apiName = 'myresources';
    }
    const getAuthorization = vi
      .spyOn(MyResource, 'getAuthorization')
      .mockResolvedValue({ status: { allowed: true } } as any);
    const resource = new MyResource(
      {
        apiVersion: 'example.headlamp.dev/v1',
        metadata: { name: 'my-resource', namespace: 'default' },
      },
      'original-cluster'
    );

    await resource.getAuthorization('get', undefined, 'explicit-cluster');

    expect(getAuthorization).toHaveBeenCalledWith(
      'get',
      {
        group: 'example.headlamp.dev',
        name: 'my-resource',
        namespace: 'default',
        verb: 'get',
        version: 'v1',
      },
      'explicit-cluster'
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('KubeObject.useApiList namespace restriction', () => {
  class NamespacedResource extends KubeObject {
    static apiVersion = 'v1';
    static apiName = 'pods';
    static kind = 'Pod';
    static isNamespaced = true;
  }

  class ClusterScopedResource extends KubeObject {
    static apiVersion = 'v1';
    static apiName = 'nodes';
    static kind = 'Node';
    static isNamespaced = false;
  }

  // Stub apiList so the tests never touch the (mocked) apiEndpoint and can count the
  // list requests that useApiList decides to make.
  let apiListSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCluster).mockReturnValue('my-cluster');
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(false);
    vi.mocked(isRestrictedOnlyByDiscovery).mockReturnValue(false);
    apiListSpy = vi
      .spyOn(KubeObject, 'apiList')
      .mockImplementation(() => () => Promise.resolve(() => {}));
  });

  afterEach(() => {
    apiListSpy.mockRestore();
    vi.mocked(useConnectApi).mockImplementation(() => {});
  });

  /** The namespace passed to each apiList call, in order (undefined for a cluster-wide list). */
  function requestedNamespaces(): Array<string | undefined> {
    return apiListSpy.mock.calls.map(
      call => (call[2] as { namespace?: string } | undefined)?.namespace
    );
  }

  /** How many list-call thunks were handed to useConnectApi on the single render. */
  function connectedCallCount(): number {
    const mockUseConnectApi = vi.mocked(useConnectApi);
    expect(mockUseConnectApi).toHaveBeenCalledTimes(1);
    // New signature: useConnectApi(apiCalls, deps)
    // apiCalls is the first argument
    return (mockUseConnectApi.mock.calls[0][0] as any[])?.length ?? 0;
  }

  it('performs a single cluster-wide list when there is no namespace restriction', () => {
    renderHook(() => NamespacedResource.useApiList(() => {}));

    expect(apiListSpy).toHaveBeenCalledTimes(1);
    expect(requestedNamespaces()).toEqual([undefined]);
    expect(connectedCallCount()).toBe(1);
  });

  it('preserves cluster-wide listing for a kind allowed outside the discovery probes', async () => {
    vi.mocked(isRestrictedOnlyByDiscovery).mockReturnValue(true);
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(post).mockResolvedValue({ status: { allowed: true } });

    renderHook(() => NamespacedResource.useApiList(() => {}));

    expect(apiListSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiListSpy).toHaveBeenCalledTimes(1));
    expect(requestedNamespaces()).toEqual([undefined]);
  });

  it('rejects an old discovery-wide stream after settings switch to a manual restriction', async () => {
    vi.mocked(isRestrictedOnlyByDiscovery).mockReturnValue(true);
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
    vi.mocked(post).mockResolvedValue({ status: { allowed: true } });

    let deliver: ((items: KubeObject[]) => void) | undefined;
    apiListSpy.mockImplementation((callback: (items: KubeObject[]) => void) => () => {
      deliver = callback;
      return Promise.resolve(() => {});
    });
    vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
      actualUseConnectApi.current(calls, deps)
    );
    const pending = deferred<void>();
    let suspended = false;
    const onList = vi.fn();
    function Consumer() {
      NamespacedResource.useApiList(onList);
      if (suspended) {
        throw pending.promise;
      }
      return null;
    }
    const tree = () =>
      createElement(
        MemoryRouter,
        null,
        createElement(Suspense, { fallback: 'loading' }, createElement(Consumer))
      );
    const view = render(tree());
    await waitFor(() => expect(deliver).toBeDefined());

    vi.mocked(isRestrictedOnlyByDiscovery).mockReturnValue(false);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['manual']);
    suspended = true;
    view.rerender(tree());
    const calls = onList.mock.calls.length;

    act(() =>
      deliver!([
        new NamespacedResource({
          metadata: { name: 'outside', namespace: 'outside' },
        } as KubeObjectInterface),
      ])
    );
    expect(onList).toHaveBeenCalledTimes(calls);
  });

  it('lists each explicitly requested namespace', () => {
    renderHook(() =>
      NamespacedResource.useApiList(() => {}, undefined, { namespace: ['ns-a', 'ns-b'] })
    );

    expect(apiListSpy).toHaveBeenCalledTimes(2);
    expect(requestedNamespaces()).toEqual(['ns-a', 'ns-b']);
    expect(connectedCallCount()).toBe(2);
  });

  it.each([
    { initialNamespace: undefined, nextNamespace: 'ns-a' },
    { initialNamespace: 'ns-a', nextNamespace: undefined },
  ])(
    'reconnects when namespace policy changes from $initialNamespace to $nextNamespace with the same set',
    async ({ initialNamespace, nextNamespace }) => {
      const requests: Array<{
        deliver: (items: KubeObject[]) => void;
        fail?: (error: ApiError, cluster?: string) => void;
        cancel: ReturnType<typeof vi.fn>;
      }> = [];
      apiListSpy.mockImplementation((deliver, fail) => () => {
        const cancel = vi.fn();
        requests.push({ deliver, fail, cancel });
        return Promise.resolve(cancel);
      });
      vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
        actualUseConnectApi.current(calls, deps)
      );
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
      const onList = vi.fn();
      const onError = vi.fn();
      const { rerender } = renderHook(
        ({ namespace }: { namespace?: string }) =>
          NamespacedResource.useApiList(onList, onError, { namespace }),
        { wrapper: MemoryRouter, initialProps: { namespace: initialNamespace } }
      );
      expect(requests).toHaveLength(1);

      await act(async () => rerender({ namespace: nextNamespace }));

      expect(requests).toHaveLength(2);
      expect(requests[0].cancel).toHaveBeenCalledTimes(1);
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
      const resource = new NamespacedResource({ metadata: { name: 'pod', namespace: 'ns-a' } });
      const error = new ApiError('current error');
      const callsBeforePolicyChange = onList.mock.calls.length;
      act(() => {
        requests[1].deliver([resource]);
        requests[1].fail?.(error, 'my-cluster');
      });
      if (nextNamespace) {
        expect(onList).toHaveBeenLastCalledWith([resource]);
        expect(onError).toHaveBeenLastCalledWith(error, 'my-cluster');
      } else {
        expect(onList).toHaveBeenCalledTimes(callsBeforePolicyChange);
        expect(onError).not.toHaveBeenCalled();
      }

      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
      const callsBeforeOldStream = onList.mock.calls.length;
      const errorsBeforeOldStream = onError.mock.calls.length;
      act(() => {
        requests[0].deliver([resource]);
        requests[0].fail?.(error, 'my-cluster');
      });
      expect(onList).toHaveBeenCalledTimes(callsBeforeOldStream);
      expect(onError).toHaveBeenCalledTimes(errorsBeforeOldStream);
      act(() => requests[1].deliver([resource]));
      expect(onList).toHaveBeenLastCalledWith([resource]);
    }
  );

  it.each([
    { namespace: [''], expected: [] },
    { namespace: ['ns-a', ''], expected: ['ns-a'] },
  ])(
    'does not request all namespaces for $namespace under an empty restriction',
    ({ namespace, expected }) => {
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      const onList = vi.fn();

      renderHook(() => NamespacedResource.useApiList(onList, undefined, { namespace }));

      expect(requestedNamespaces()).toEqual(expected);
      if (expected.length === 0) {
        expect(onList).toHaveBeenCalledWith([]);
      }
    }
  );

  it('does not rerender the host when an unrestricted stream delivers a list', () => {
    let deliver!: (items: KubeObject[]) => void;
    apiListSpy.mockImplementation(onList => () => {
      deliver = onList;
      return Promise.resolve(vi.fn());
    });
    vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
      actualUseConnectApi.current(calls, deps)
    );
    const onList = vi.fn();
    const rendered = vi.fn();
    renderHook(
      () => {
        rendered();
        NamespacedResource.useApiList(onList);
      },
      { wrapper: MemoryRouter }
    );

    act(() => deliver([]));

    expect(onList).toHaveBeenCalledWith([]);
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it.each([{ namespaces: [] }, { namespaces: ['ns-a'] }])(
    'rejects stale errors from a superseded $namespaces stream',
    async ({ namespaces }) => {
      const errors: Array<(error: ApiError, cluster?: string) => void> = [];
      apiListSpy.mockImplementation((_onList, onError) => () => {
        errors.push(onError);
        return Promise.resolve(vi.fn());
      });
      vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
        actualUseConnectApi.current(calls, deps)
      );
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(namespaces);
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(namespaces.length > 0);
      const onError = vi.fn();
      const { rerender } = renderHook(() => NamespacedResource.useApiList(vi.fn(), onError), {
        wrapper: MemoryRouter,
      });
      const staleError = new ApiError('late failure');

      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      rerender();
      await act(async () => errors[0](staleError, 'my-cluster'));
      expect(onError).not.toHaveBeenCalled();

      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-b']);
      rerender();
      await act(async () => errors[0](staleError, 'my-cluster'));
      expect(onError).not.toHaveBeenCalled();

      const currentError = new ApiError('current failure');
      act(() => errors[1](currentError, 'my-cluster'));
      expect(onError).toHaveBeenCalledExactlyOnceWith(currentError, 'my-cluster');
    }
  );

  it('keeps the connected stream live after a Suspense hide and reveal', async () => {
    const requests: Array<(items: KubeObject[]) => void> = [];
    const cancel = vi.fn();
    apiListSpy.mockImplementation(onList => () => {
      requests.push(onList);
      return Promise.resolve(cancel);
    });
    vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
      actualUseConnectApi.current(calls, deps)
    );
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
    const pending = deferred<void>();
    let suspended = false;
    const onList = vi.fn();
    const attached = vi.fn();
    const detached = vi.fn();
    function Consumer() {
      NamespacedResource.useApiList(onList);
      useLayoutEffect(() => {
        attached();
        return detached;
      }, []);
      if (suspended) {
        throw pending.promise;
      }
      return 'visible list';
    }
    const tree = () =>
      createElement(
        MemoryRouter,
        null,
        createElement(Suspense, { fallback: 'loading list' }, createElement(Consumer))
      );
    const view = render(tree());

    suspended = true;
    view.rerender(tree());
    expect(screen.getByText('loading list')).toBeInTheDocument();
    expect(detached).toHaveBeenCalledTimes(1);

    suspended = false;
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(screen.getByText('visible list')).toBeInTheDocument();
    expect(attached).toHaveBeenCalledTimes(2);
    expect(requests).toHaveLength(1);
    expect(cancel).not.toHaveBeenCalled();

    act(() => requests[0]([]));
    expect(onList).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('lists each allowed namespace when a restriction resolves to namespaces', () => {
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['allowed-a', 'allowed-b']);

    renderHook(() => NamespacedResource.useApiList(() => {}));

    expect(apiListSpy).toHaveBeenCalledTimes(2);
    expect(requestedNamespaces()).toEqual(['allowed-a', 'allowed-b']);
    expect(connectedCallCount()).toBe(2);
  });

  it('calls onList([]) and issues no request when an allowed-namespaces restriction resolves empty (fail closed)', () => {
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
    const onList = vi.fn();

    renderHook(() => NamespacedResource.useApiList(onList));

    // No unrestricted cluster-wide fallback: no list thunks are ever connected.
    expect(apiListSpy).not.toHaveBeenCalled();
    const mockUseConnectApi = vi.mocked(useConnectApi);
    // New signature: useConnectApi(apiCalls, deps)
    expect(
      mockUseConnectApi.mock.calls.every(call => ((call[0] as any[])?.length ?? 0) === 0)
    ).toBe(true);
    // Consumer is explicitly notified with an empty list so stale objects are cleared.
    expect(onList).toHaveBeenCalledWith([]);
  });

  it('clears stale objects when the restriction transitions from non-empty to empty (regression)', () => {
    // Start with a non-empty restriction so the first render produces results.
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
    const onList = vi.fn();

    const { rerender } = renderHook(() => NamespacedResource.useApiList(onList));

    // First render: one request for 'ns-a'.
    expect(apiListSpy).toHaveBeenCalledTimes(1);
    expect(requestedNamespaces()).toEqual(['ns-a']);

    // Now the restriction resolves to zero namespaces (e.g. RBAC changed).
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);

    vi.clearAllMocks();
    // Reset spy so connectedCallCount reflects only the second render.
    apiListSpy = vi
      .spyOn(KubeObject, 'apiList')
      .mockImplementation(() => () => Promise.resolve(() => {}));

    rerender();

    // No unrestricted fallback request must be made.
    expect(apiListSpy).not.toHaveBeenCalled();
    // No list thunks are connected in any render after the transition.
    const mockUseConnectApi = vi.mocked(useConnectApi);
    // New signature: useConnectApi(apiCalls, deps)
    expect(
      mockUseConnectApi.mock.calls.every(call => ((call[0] as any[])?.length ?? 0) === 0)
    ).toBe(true);
    // The consumer must be notified with [] so stale objects are not retained.
    expect(onList).toHaveBeenCalledWith([]);
  });

  it('ignores an in-flight list callback after the namespace restriction clears', async () => {
    class FreshTestResource extends KubeObject {
      static apiVersion = 'v1';
      static apiName = 'pods';
      static kind = 'Pod';
      static isNamespaced = true;
    }

    type ListRequest = {
      callback: (items: any[]) => void;
      cancellationReady: ReturnType<typeof deferred<void>>;
      cancellation: Promise<() => void>;
      cancel: ReturnType<typeof vi.fn>;
    };
    const requests: ListRequest[] = [];
    const mockEndpoint = {
      isNamespaced: true,
      apiInfo: [{ group: '', version: 'v1', resource: 'pods' }],
      list: vi.fn((_namespace: string, callback: (items: any[]) => void) => {
        const cancellationReady = deferred<void>();
        const cancel = vi.fn(() =>
          callback([{ metadata: { name: 'stale-pod-during-cancel', namespace: _namespace } }])
        );
        const cancellation = cancellationReady.promise.then(() => cancel);
        requests.push({ callback, cancellationReady, cancellation, cancel });
        return cancellation;
      }),
    };

    FreshTestResource.apiEndpoint = mockEndpoint as any;
    apiListSpy.mockRestore();
    vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
      actualUseConnectApi.current(calls, deps)
    );
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
    const onList = vi.fn();
    let setEmitStaleDuringCommit!: (emit: boolean) => void;

    const { rerender } = renderHook(
      () => {
        FreshTestResource.useApiList(onList);
        const [emitStaleDuringCommit, setEmit] = useState(false);
        setEmitStaleDuringCommit = setEmit;
        useLayoutEffect(() => {
          if (emitStaleDuringCommit && requests[0]) {
            requests[0].callback([
              { metadata: { name: 'stale-pod-during-transition-commit', namespace: 'ns-a' } },
            ]);
          }
        }, [emitStaleDuringCommit]);
      },
      { wrapper: MemoryRouter }
    );

    expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
    const firstRequest = requests[0]!;

    // Receive the initial allowed result while the list/watch request is active.
    act(() => {
      firstRequest.callback([{ metadata: { name: 'allowed-pod', namespace: 'ns-a' } }]);
    });
    expect(onList).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'allowed-pod' }),
          }),
        }),
      ])
    );

    // Clear the restriction while the request's cancellation function is still pending.
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
    const callsBeforeClear = onList.mock.calls.length;
    act(() => {
      setEmitStaleDuringCommit(true);
    });
    expect(onList).toHaveBeenCalledTimes(callsBeforeClear + 1);
    expect(onList).toHaveBeenLastCalledWith([]);

    // The callback ran in a layout effect during this same commit, before passive cleanup.
    // A further late event while cancellation is unresolved must also be ignored.
    const callsAfterClear = onList.mock.calls.length;
    act(() => {
      firstRequest.callback([{ metadata: { name: 'stale-pod', namespace: 'ns-a' } }]);
    });
    expect(onList).toHaveBeenCalledTimes(callsAfterClear);

    // The real useConnectApi cleanup waits for the request to expose its cancel function.
    await act(async () => {
      firstRequest.cancellationReady.resolve(undefined);
      await firstRequest.cancellation;
    });
    expect(firstRequest.cancel).toHaveBeenCalledTimes(1);
    expect(onList).toHaveBeenCalledTimes(callsAfterClear);

    // A later allowed list must not include anything delivered by the stale callback.
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-b']);
    rerender();
    const secondRequest = requests[1]!;
    act(() => {
      secondRequest.callback([{ metadata: { name: 'new-pod', namespace: 'ns-b' } }]);
    });
    expect(onList).toHaveBeenLastCalledWith([
      expect.objectContaining({
        jsonData: expect.objectContaining({
          metadata: expect.objectContaining({ name: 'new-pod' }),
        }),
      }),
    ]);
    expect(onList).not.toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'stale-pod' }),
          }),
        }),
      ])
    );
  });

  it('ignores a late unrestricted list callback after the restriction becomes empty (regression)', async () => {
    class UnrestrictedTestResource extends KubeObject {
      static apiVersion = 'v1';
      static apiName = 'pods';
      static kind = 'Pod';
      static isNamespaced = true;
    }

    type ListRequest = {
      callback: (items: any[]) => void;
      cancellationReady: ReturnType<typeof deferred<void>>;
      cancellation: Promise<() => void>;
      cancel: ReturnType<typeof vi.fn>;
    };
    const requests: ListRequest[] = [];
    const mockEndpoint = {
      isNamespaced: true,
      apiInfo: [{ group: '', version: 'v1', resource: 'pods' }],
      list: vi.fn((_namespace: string, callback: (items: any[]) => void) => {
        const cancellationReady = deferred<void>();
        // A cancel that still emits one last event from the old stream.
        const cancel = vi.fn(() =>
          callback([{ metadata: { name: 'stale-pod-during-cancel', namespace: _namespace } }])
        );
        const cancellation = cancellationReady.promise.then(() => cancel);
        requests.push({ callback, cancellationReady, cancellation, cancel });
        return cancellation;
      }),
    };

    UnrestrictedTestResource.apiEndpoint = mockEndpoint as any;
    apiListSpy.mockRestore();
    // No restriction at first, so the request itself must be an unrestricted
    // cluster-wide list.
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(false);
    vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
      actualUseConnectApi.current(calls, deps)
    );
    const onList = vi.fn();

    const { rerender } = renderHook(() => UnrestrictedTestResource.useApiList(onList), {
      wrapper: MemoryRouter,
    });

    expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
    expect(mockEndpoint.list.mock.calls[0][0]).toBe('');
    const unrestrictedRequest = requests[0]!;

    // Receive the unrestricted (cluster-wide) result while the request is
    // still active.
    act(() => {
      unrestrictedRequest.callback([{ metadata: { name: 'unrestricted-pod', namespace: 'any' } }]);
    });
    expect(onList).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'unrestricted-pod' }),
          }),
        }),
      ])
    );

    // The restriction becomes active and resolves to zero namespaces while the
    // unrestricted request's cancellation is still pending.
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    const callsBeforeTransition = onList.mock.calls.length;
    act(() => {
      rerender();
    });
    // The consumer is notified with [] so stale objects are cleared.
    expect(onList).toHaveBeenCalledTimes(callsBeforeTransition + 1);
    expect(onList).toHaveBeenLastCalledWith([]);

    // A late callback from the old unrestricted request must not deliver
    // objects while cancellation is unresolved.
    const callsAfterTransition = onList.mock.calls.length;
    act(() => {
      unrestrictedRequest.callback([
        { metadata: { name: 'late-unrestricted-pod', namespace: 'secret-ns' } },
      ]);
    });
    expect(onList).toHaveBeenCalledTimes(callsAfterTransition);

    // Cancelling the old stream (which emits once more) must also stay
    // suppressed.
    await act(async () => {
      unrestrictedRequest.cancellationReady.resolve(undefined);
      await unrestrictedRequest.cancellation;
    });
    expect(unrestrictedRequest.cancel).toHaveBeenCalledTimes(1);
    expect(onList).toHaveBeenCalledTimes(callsAfterTransition);
  });

  it('performs a single cluster-wide list for cluster-scoped resources even under a restriction', () => {
    vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);

    renderHook(() => ClusterScopedResource.useApiList(() => {}));

    expect(apiListSpy).toHaveBeenCalledTimes(1);
    expect(requestedNamespaces()).toEqual([undefined]);
    expect(connectedCallCount()).toBe(1);
  });

  // Multi-cluster regression tests (opts.cluster vs getCluster)

  it('applies restriction from the current cluster when no opts.cluster is given', () => {
    // Current cluster ("my-cluster") is restricted.
    vi.mocked(getCombinedAllowedNamespaces).mockImplementation(cluster =>
      cluster === 'my-cluster' ? ['ns-current'] : []
    );
    vi.mocked(hasAllowedNamespacesRestriction).mockImplementation(
      cluster => cluster === 'my-cluster'
    );

    renderHook(() => NamespacedResource.useApiList(() => {}));

    expect(apiListSpy).toHaveBeenCalledTimes(1);
    expect(requestedNamespaces()).toEqual(['ns-current']);
    expect(connectedCallCount()).toBe(1);
  });

  it('applies restriction from opts.cluster when current cluster is unrestricted', () => {
    // Current cluster is unrestricted, but opts.cluster ("remote") is restricted.
    vi.mocked(getCombinedAllowedNamespaces).mockImplementation(cluster =>
      cluster === 'remote' ? ['ns-remote'] : []
    );
    vi.mocked(hasAllowedNamespacesRestriction).mockImplementation(cluster => cluster === 'remote');

    renderHook(() => NamespacedResource.useApiList(() => {}, undefined, { cluster: 'remote' }));

    expect(apiListSpy).toHaveBeenCalledTimes(1);
    expect(requestedNamespaces()).toEqual(['ns-remote']);
    expect(connectedCallCount()).toBe(1);
  });

  it('does unrestricted list on opts.cluster when only the current cluster is restricted', () => {
    // Current cluster is restricted, but opts.cluster ("remote") is unrestricted.
    vi.mocked(getCombinedAllowedNamespaces).mockImplementation(cluster =>
      cluster === 'my-cluster' ? ['ns-current'] : []
    );
    vi.mocked(hasAllowedNamespacesRestriction).mockImplementation(
      cluster => cluster === 'my-cluster'
    );

    renderHook(() => NamespacedResource.useApiList(() => {}, undefined, { cluster: 'remote' }));

    // "remote" has no restriction, so a single cluster-wide list is expected.
    expect(apiListSpy).toHaveBeenCalledTimes(1);
    expect(requestedNamespaces()).toEqual([undefined]);
    expect(connectedCallCount()).toBe(1);
  });

  it('fails closed on opts.cluster when its restriction resolves empty', () => {
    // Current cluster is unrestricted, opts.cluster ("remote") has a restriction
    // that resolves to zero namespaces.
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
    vi.mocked(hasAllowedNamespacesRestriction).mockImplementation(cluster => cluster === 'remote');
    const onList = vi.fn();

    renderHook(() => NamespacedResource.useApiList(onList, undefined, { cluster: 'remote' }));

    // Fail closed: no requests, but consumer is notified with [] to clear stale objects.
    expect(apiListSpy).not.toHaveBeenCalled();
    const mockUseConnectApi = vi.mocked(useConnectApi);
    // New signature: useConnectApi(apiCalls, deps)
    expect(
      mockUseConnectApi.mock.calls.every(call => ((call[0] as any[])?.length ?? 0) === 0)
    ).toBe(true);
    expect(onList).toHaveBeenCalledWith([]);
  });

  // Empty-string cluster: the request layer (streamResultsForCluster) treats an empty
  // opts.cluster as the current cluster, so the restriction must be evaluated against
  // the current cluster too, not against a phantom "no cluster" entry.

  it('fails closed when an empty-string cluster resolves to the current cluster with an empty restriction', () => {
    vi.mocked(hasAllowedNamespacesRestriction).mockImplementation(
      cluster => cluster === 'my-cluster'
    );
    vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
    const onList = vi.fn();

    renderHook(() => NamespacedResource.useApiList(onList, undefined, { cluster: '' }));

    // The restriction must be checked against the current cluster, which is active but
    // resolves empty: no unrestricted cluster-wide fallback request may be issued.
    expect(hasAllowedNamespacesRestriction).toHaveBeenCalledWith('my-cluster');
    expect(apiListSpy).not.toHaveBeenCalled();
    const mockUseConnectApi = vi.mocked(useConnectApi);
    // New signature: useConnectApi(apiCalls, deps)
    expect(
      mockUseConnectApi.mock.calls.every(call => ((call[0] as any[])?.length ?? 0) === 0)
    ).toBe(true);
    expect(onList).toHaveBeenCalledWith([]);
  });

  it("requests only the current cluster's allowed namespaces when an empty-string cluster has a non-empty allow-list", () => {
    vi.mocked(hasAllowedNamespacesRestriction).mockImplementation(
      cluster => cluster === 'my-cluster'
    );
    vi.mocked(getCombinedAllowedNamespaces).mockImplementation(cluster =>
      cluster === 'my-cluster' ? ['ns-current'] : []
    );

    renderHook(() => NamespacedResource.useApiList(() => {}, undefined, { cluster: '' }));

    // An empty opts.cluster must behave exactly like no cluster at all: scoped to the
    // current cluster's allow-list instead of an unrestricted cluster-wide list.
    expect(apiListSpy).toHaveBeenCalledTimes(1);
    expect(requestedNamespaces()).toEqual(['ns-current']);
    expect(connectedCallCount()).toBe(1);
  });

  describe('reacts to AllowedNamespacesResolutionContext updates without an explicit rerender', () => {
    /** Handle through which a test updates the provider value after the wrapper mounted. */
    type ContextHandle = { setKey: ((key: string) => void) | null };

    /** A list request recorded by makeRecordedListEndpoint, to trigger its callback manually. */
    type TransitionListRequest = { callback: (items: any[]) => void };

    function ContextWrapper({
      children,
      onKeySetterReady,
    }: {
      children?: ReactNode;
      onKeySetterReady?: (setKey: (key: string) => void) => void;
    }) {
      const [key, setKey] = useState('resolution:empty');
      // Report the setter from an effect, not during render, to keep renders pure.
      useEffect(() => {
        onKeySetterReady?.(setKey);
      }, [onKeySetterReady]);
      // Context provider with the current resolution state around the consumer.
      return createElement(AllowedNamespacesResolutionContext.Provider, { value: key }, children);
    }

    /** Component choosing the wrapper's value-capture callback per test. */
    function contextHarness(handle: ContextHandle) {
      // Captured here, outside any component render, to keep the wrapper pure.
      return ({ children }: { children?: ReactNode }) =>
        createElement(ContextWrapper, {
          children,
          onKeySetterReady: setKey => {
            handle.setKey = setKey;
          },
        });
    }

    function withContextAndRouter(handle: ContextHandle) {
      const Context = contextHarness(handle);
      return ({ children }: { children?: ReactNode }) =>
        createElement(MemoryRouter, null, createElement(Context, null, children));
    }

    /** List endpoint recording each request with its callback, so a test can emit
     * results or stale events manually; cancellation resolves without side effects. */
    function makeRecordedListEndpoint(requests: TransitionListRequest[]) {
      return {
        isNamespaced: true,
        apiInfo: [{ group: '', version: 'v1', resource: 'pods' }],
        list: vi.fn((_namespace: string, callback: (items: any[]) => void) => {
          requests.push({ callback });
          return Promise.resolve(() => {});
        }),
      };
    }

    /** Switch the spies to the real streaming path for one transition scenario:
     * actual useConnectApi reconnection under the given allowed-namespaces restriction. */
    function connectWithRealStreams(allowedNamespaces: string[]) {
      apiListSpy.mockRestore();
      vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
        actualUseConnectApi.current(calls, deps)
      );
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(allowedNamespaces);
    }

    it('fails closed when the context changes from a non-empty to an empty resolution', () => {
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      renderHook(() => NamespacedResource.useApiList(onList), {
        wrapper: contextHarness(handle),
      });

      // First render: the resolved restriction issues one namespace-scoped request.
      expect(apiListSpy).toHaveBeenCalledTimes(1);
      expect(requestedNamespaces()).toEqual(['ns-a']);

      // Only the provider value changes; the consumer is not explicitly rerendered.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
      act(() => {
        handle.setKey!('resolution:empty-after-nonempty');
      });

      // No unrestricted fallback request is issued, and no new stream connects.
      expect(apiListSpy).toHaveBeenCalledTimes(1);
      const mockUseConnectApi = vi.mocked(useConnectApi);
      // The restriction renders must not connect any stream thunks after the
      // transition (the initial render legitimately connected the ns-a stream).
      const previousCallCount = mockUseConnectApi.mock.calls.length - 1;
      const callsAfterTransition = mockUseConnectApi.mock.calls.slice(previousCallCount);
      expect(callsAfterTransition.length).toBeGreaterThan(0);
      // New signature: useConnectApi(apiCalls, deps)
      expect(callsAfterTransition.every(call => ((call[0] as any[])?.length ?? 0) === 0)).toBe(
        true
      );
      // The consumer must be notified with an empty list from the context update alone.
      expect(onList).toHaveBeenCalledWith([]);
      expect(onList).toHaveBeenLastCalledWith([]);
    });

    it('issues namespace-scoped requests when the context changes from an empty to a non-empty resolution', () => {
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      renderHook(() => NamespacedResource.useApiList(onList), {
        wrapper: contextHarness(handle),
      });

      // Fail closed initially: no requests, consumer told the list is empty.
      expect(apiListSpy).not.toHaveBeenCalled();
      expect(onList).toHaveBeenCalledWith([]);

      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
      act(() => {
        handle.setKey!('resolution:ns-a');
      });

      // Only namespace-scoped requests are connected; nothing unrestricted.
      expect(apiListSpy).toHaveBeenCalledTimes(1);
      expect(requestedNamespaces()).toEqual(['ns-a']);
      const mockUseConnectApi = vi.mocked(useConnectApi);
      expect((mockUseConnectApi.mock.calls.at(-1)?.[0] as any[])?.length).toBe(1);
    });

    it('cancels the previous stream and suppresses its late callbacks when the context resolves empty', async () => {
      class ContextTransitionResource extends KubeObject {
        static apiVersion = 'v1';
        static apiName = 'pods';
        static kind = 'Pod';
        static isNamespaced = true;
      }

      type ListRequest = {
        callback: (items: any[]) => void;
        cancellationReady: ReturnType<typeof deferred<void>>;
        cancellation: Promise<() => void>;
        cancel: ReturnType<typeof vi.fn>;
      };
      const requests: ListRequest[] = [];
      const mockEndpoint = {
        isNamespaced: true,
        apiInfo: [{ group: '', version: 'v1', resource: 'pods' }],
        list: vi.fn((_namespace: string, callback: (items: any[]) => void) => {
          const cancellationReady = deferred<void>();
          // A cancel that still emits one last event from the old stream.
          const cancel = vi.fn(() =>
            callback([{ metadata: { name: 'stale-pod-during-cancel', namespace: _namespace } }])
          );
          const cancellation = cancellationReady.promise.then(() => cancel);
          requests.push({ callback, cancellationReady, cancellation, cancel });
          return cancellation;
        }),
      };

      ContextTransitionResource.apiEndpoint = mockEndpoint as any;
      apiListSpy.mockRestore();
      vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
        actualUseConnectApi.current(calls, deps)
      );
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      renderHook(
        () => {
          ContextTransitionResource.useApiList(onList);
        },
        { wrapper: withContextAndRouter(handle) }
      );

      expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
      const firstRequest = requests[0]!;

      // Receive the initially allowed result while the list/watch request is active.
      act(() => {
        firstRequest.callback([{ metadata: { name: 'allowed-pod', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            jsonData: expect.objectContaining({
              metadata: expect.objectContaining({ name: 'allowed-pod' }),
            }),
          }),
        ])
      );

      // The resolution turns empty again, without an explicit rerender.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
      const callsBeforeTransition = onList.mock.calls.length;
      act(() => {
        handle.setKey!('resolution:empty-real-streams');
      });
      // The consumer is notified with [] during the transition commit itself.
      expect(onList).toHaveBeenCalledTimes(callsBeforeTransition + 1);
      expect(onList).toHaveBeenLastCalledWith([]);

      // A late callback from the old request must not deliver objects while
      // cancellation is unresolved.
      const callsAfterTransition = onList.mock.calls.length;
      act(() => {
        firstRequest.callback([{ metadata: { name: 'stale-pod', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenCalledTimes(callsAfterTransition);
      expect(mockEndpoint.list).toHaveBeenCalledTimes(1);

      // The previous stream is cleaned up and its cancel-time event stays suppressed.
      await act(async () => {
        firstRequest.cancellationReady.resolve(undefined);
        await firstRequest.cancellation;
      });
      expect(firstRequest.cancel).toHaveBeenCalledTimes(1);
      expect(onList).toHaveBeenCalledTimes(callsAfterTransition);
      expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
    });

    it('issues the newly allowed namespace request when the context resolves non-empty', async () => {
      class ContextEmptyStartResource extends KubeObject {
        static apiVersion = 'v1';
        static apiName = 'pods';
        static kind = 'Pod';
        static isNamespaced = true;
      }

      type ListRequest = {
        callback: (items: any[]) => void;
        cancellationReady: ReturnType<typeof deferred<void>>;
        cancellation: Promise<() => void>;
        cancel: ReturnType<typeof vi.fn>;
      };
      const requests: ListRequest[] = [];
      const mockEndpoint = {
        isNamespaced: true,
        apiInfo: [{ group: '', version: 'v1', resource: 'pods' }],
        list: vi.fn((_namespace: string, callback: (items: any[]) => void) => {
          const cancellationReady = deferred<void>();
          const cancel = vi.fn();
          const cancellation = cancellationReady.promise.then(() => cancel);
          requests.push({ callback, cancellationReady, cancellation, cancel });
          return cancellation;
        }),
      };

      ContextEmptyStartResource.apiEndpoint = mockEndpoint as any;
      apiListSpy.mockRestore();
      vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
        actualUseConnectApi.current(calls, deps)
      );
      vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(true);
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue([]);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      renderHook(
        () => {
          ContextEmptyStartResource.useApiList(onList);
        },
        { wrapper: withContextAndRouter(handle) }
      );

      // Fail closed initially: no requests, consumer told the list is empty.
      expect(mockEndpoint.list).not.toHaveBeenCalled();
      expect(onList).toHaveBeenCalledWith([]);

      // The resolution turns non-empty, without an explicit rerender.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
      act(() => {
        handle.setKey!('resolution:ns-a-real-streams');
      });

      // A namespace-scoped request is issued without any explicit rerender.
      expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
      expect(mockEndpoint.list.mock.calls[0][0]).toBe('ns-a');
      const request = requests[0]!;

      // Results for the newly allowed namespace are delivered once the restriction
      // gate is lifted again (no stale fail-closed suppression).
      act(() => {
        request.callback([{ metadata: { name: 'new-pod', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'new-pod' }),
          }),
        }),
      ]);
    });

    it('clears cached objects and drops old-stream callbacks when the allowed namespaces remap to a different non-empty set', () => {
      class ContextRemapResource extends KubeObject {
        static apiVersion = 'v1';
        static apiName = 'pods';
        static kind = 'Pod';
        static isNamespaced = true;
      }

      const requests: TransitionListRequest[] = [];
      const mockEndpoint = makeRecordedListEndpoint(requests);

      ContextRemapResource.apiEndpoint = mockEndpoint as any;
      connectWithRealStreams(['ns-a']);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      renderHook(
        () => {
          ContextRemapResource.useApiList(onList);
        },
        { wrapper: withContextAndRouter(handle) }
      );

      expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
      expect(mockEndpoint.list.mock.calls[0][0]).toBe('ns-a');
      const nsARequest = requests[0]!;

      // Receive the initially allowed result while the ns-a request is active.
      act(() => {
        nsARequest.callback([{ metadata: { name: 'allowed-a', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'allowed-a' }),
          }),
        }),
      ]);

      // The restriction remaps to a different non-empty set, without an explicit
      // rerender.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-b']);
      act(() => {
        handle.setKey!('resolution:ns-b');
      });

      // A new request is issued for the remapped namespace...
      expect(mockEndpoint.list).toHaveBeenCalledTimes(2);
      expect(mockEndpoint.list.mock.calls[1][0]).toBe('ns-b');
      const nsBRequest = requests[1]!;

      // ...the previously cached ns-a objects no longer reach the consumer, and
      // the transition commit reports an empty list instead.
      expect(onList).toHaveBeenLastCalledWith([]);

      // A late callback from the old ns-a request must stay suppressed even
      // while cancellation is still pending.
      const callsBeforeLateCallback = onList.mock.calls.length;
      act(() => {
        nsARequest.callback([{ metadata: { name: 'stale-a', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenCalledTimes(callsBeforeLateCallback);

      // The remapped set's results are delivered, without any ns-a object mixed in.
      act(() => {
        nsBRequest.callback([{ metadata: { name: 'allowed-b', namespace: 'ns-b' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'allowed-b' }),
          }),
        }),
      ]);
    });

    it('drops both superseded streams and delivers only remaining-set results when the allowed namespaces shrink to a subset', () => {
      class ContextShrinkResource extends KubeObject {
        static apiVersion = 'v1';
        static apiName = 'pods';
        static kind = 'Pod';
        static isNamespaced = true;
      }

      const requests: TransitionListRequest[] = [];
      const mockEndpoint = makeRecordedListEndpoint(requests);

      ContextShrinkResource.apiEndpoint = mockEndpoint as any;
      connectWithRealStreams(['ns-a', 'ns-b']);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      renderHook(
        () => {
          ContextShrinkResource.useApiList(onList);
        },
        { wrapper: withContextAndRouter(handle) }
      );

      expect(mockEndpoint.list).toHaveBeenCalledTimes(2);
      expect(mockEndpoint.list.mock.calls.map(call => call[0])).toEqual(['ns-a', 'ns-b']);
      const nsARequest = requests[0]!;
      const nsBRequest = requests[1]!;

      // Both initially allowed namespaces deliver their results.
      act(() => {
        nsARequest.callback([{ metadata: { name: 'allowed-a', namespace: 'ns-a' } }]);
        nsBRequest.callback([{ metadata: { name: 'allowed-b', namespace: 'ns-b' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'allowed-a' }),
          }),
        }),
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'allowed-b' }),
          }),
        }),
      ]);

      // The restriction shrinks to a subset, without an explicit rerender.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-b']);
      act(() => {
        handle.setKey!('resolution:shrink');
      });

      // A fresh ns-b request is issued next to the superseded pair, and the
      // cached ns-a objects no longer reach the consumer.
      expect(mockEndpoint.list).toHaveBeenCalledTimes(3);
      expect(mockEndpoint.list.mock.calls.map(call => call[0])).toEqual(['ns-a', 'ns-b', 'ns-b']);
      expect(onList).toHaveBeenLastCalledWith([]);

      // Late callbacks from BOTH superseded requests must stay suppressed.
      const callsBeforeLateCallbacks = onList.mock.calls.length;
      act(() => {
        nsARequest.callback([{ metadata: { name: 'stale-a', namespace: 'ns-a' } }]);
        nsBRequest.callback([{ metadata: { name: 'stale-b', namespace: 'ns-b' } }]);
      });
      expect(onList).toHaveBeenCalledTimes(callsBeforeLateCallbacks);

      // The new ns-b request delivers exactly its own results; no cached or
      // stale ns-a object is mixed in.
      act(() => {
        requests[2]!.callback([{ metadata: { name: 'fresh-b', namespace: 'ns-b' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'fresh-b' }),
          }),
        }),
      ]);
    });

    it('drops the original stream callback revived by an ns-a -> ns-b -> ns-a round trip', async () => {
      class ContextRoundTripResource extends KubeObject {
        static apiVersion = 'v1';
        static apiName = 'pods';
        static kind = 'Pod';
        static isNamespaced = true;
      }

      type ListRequest = {
        callback: (items: any[]) => void;
        cancellationReady: ReturnType<typeof deferred<void>>;
        cancellation: Promise<() => void>;
        cancel: ReturnType<typeof vi.fn>;
      };
      const requests: ListRequest[] = [];
      const mockEndpoint = {
        isNamespaced: true,
        apiInfo: [{ group: '', version: 'v1', resource: 'pods' }],
        list: vi.fn((_namespace: string, callback: (items: any[]) => void) => {
          // Cancellation only resolves when the test resolves it, so a
          // superseded stream's callback stays invocable meanwhile.
          const cancellationReady = deferred<void>();
          const cancel = vi.fn();
          const cancellation = cancellationReady.promise.then(() => cancel);
          requests.push({ callback, cancellationReady, cancellation, cancel });
          return cancellation;
        }),
      };

      ContextRoundTripResource.apiEndpoint = mockEndpoint as any;
      connectWithRealStreams(['ns-a']);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      renderHook(
        () => {
          ContextRoundTripResource.useApiList(onList);
        },
        { wrapper: withContextAndRouter(handle) }
      );

      // The first ns-a stream connects, and its cancellation is left pending.
      expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
      expect(mockEndpoint.list.mock.calls[0][0]).toBe('ns-a');
      const originalNsARequest = requests[0]!;

      // The original stream's fresh results reach the consumer.
      act(() => {
        originalNsARequest.callback([{ metadata: { name: 'round-a1', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'round-a1' }),
          }),
        }),
      ]);

      // Transition to a different non-empty set, without an explicit rerender.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-b']);
      act(() => {
        handle.setKey!('resolution:round-trip-ns-b');
      });
      expect(mockEndpoint.list).toHaveBeenCalledTimes(2);
      expect(mockEndpoint.list.mock.calls[1][0]).toBe('ns-b');

      // Transition back to the original set: the namespace-set identity now
      // matches the original stream again, and a replacement ns-a stream is
      // established while the original stream's cancellation is still pending.
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['ns-a']);
      act(() => {
        handle.setKey!('resolution:round-trip-back-to-ns-a');
      });
      expect(mockEndpoint.list).toHaveBeenCalledTimes(3);
      expect(mockEndpoint.list.mock.calls.map(call => call[0])).toEqual(['ns-a', 'ns-b', 'ns-a']);
      const replacementNsARequest = requests[2]!;

      // Fresh results from the replacement ns-a stream reach the consumer.
      act(() => {
        replacementNsARequest.callback([{ metadata: { name: 'round-a2', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'round-a2' }),
          }),
        }),
      ]);
      const callsBeforeStaleDelivery = onList.mock.calls.length;

      // The original ns-a callback matches every prior guard again at this
      // point: its namespace set identity is live again and the restriction
      // generation was never advanced by the two non-empty transitions. Invoking
      // it must neither overwrite nor reintroduce its stale objects.
      act(() => {
        originalNsARequest.callback([{ metadata: { name: 'stale-revived-a', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenCalledTimes(callsBeforeStaleDelivery);
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'round-a2' }),
          }),
        }),
      ]);
    });

    it.each(['restricted', 'explicit', 'cluster-scoped', 'unrestricted'])(
      'does not reconnect an unchanged %s request when another selector updates',
      mode => {
        const requests: Array<(items: KubeObject[]) => void> = [];
        const cancel = vi.fn();
        apiListSpy.mockImplementation(onList => () => {
          requests.push(onList);
          return Promise.resolve(cancel);
        });
        vi.mocked(useConnectApi).mockImplementation((calls, deps) =>
          actualUseConnectApi.current(calls, deps)
        );
        vi.mocked(hasAllowedNamespacesRestriction).mockReturnValue(mode !== 'unrestricted');
        vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(
          mode === 'restricted' ? ['ns-a'] : []
        );
        const Resource = mode === 'cluster-scoped' ? ClusterScopedResource : NamespacedResource;
        const options = mode === 'explicit' ? { namespace: 'explicit' } : undefined;
        const onList = vi.fn();
        const handle: ContextHandle = { setKey: null };

        renderHook(() => Resource.useApiList(onList, undefined, options), {
          wrapper: withContextAndRouter(handle),
        });
        expect(requests).toHaveLength(1);

        act(() => handle.setKey!('resolution:another-cluster'));

        expect(requests).toHaveLength(1);
        expect(cancel).not.toHaveBeenCalled();
        act(() => requests[0]([]));
        expect(onList).toHaveBeenLastCalledWith([]);
      }
    );

    it('drops the cancelled stream callback when the request cluster changes without changing namespaces', async () => {
      class ContextReconnectResource extends KubeObject {
        static apiVersion = 'v1';
        static apiName = 'pods';
        static kind = 'Pod';
        static isNamespaced = true;
      }

      type ListRequest = {
        callback: (items: any[]) => void;
        cancellationReady: ReturnType<typeof deferred<void>>;
        cancellation: Promise<() => void>;
        cancel: ReturnType<typeof vi.fn>;
      };
      const requests: ListRequest[] = [];
      const mockEndpoint = {
        isNamespaced: true,
        apiInfo: [{ group: '', version: 'v1', resource: 'pods' }],
        list: vi.fn((_namespace: string, callback: (items: any[]) => void) => {
          // Cancellation only resolves when the test resolves it, so the
          // superseded stream's callback stays invocable meanwhile.
          const cancellationReady = deferred<void>();
          const cancel = vi.fn();
          const cancellation = cancellationReady.promise.then(() => cancel);
          requests.push({ callback, cancellationReady, cancellation, cancel });
          return cancellation;
        }),
      };

      ContextReconnectResource.apiEndpoint = mockEndpoint as any;
      connectWithRealStreams(['ns-a']);
      const onList = vi.fn();
      const handle: ContextHandle = { setKey: null };

      const { rerender } = renderHook(
        ({ cluster }) => {
          ContextReconnectResource.useApiList(onList, undefined, { cluster });
        },
        { wrapper: withContextAndRouter(handle), initialProps: { cluster: 'first' } }
      );

      // The first ns-a stream connects, and its cancellation is left pending.
      expect(mockEndpoint.list).toHaveBeenCalledTimes(1);
      expect(mockEndpoint.list.mock.calls[0][0]).toBe('ns-a');
      const originalNsARequest = requests[0]!;

      // The original stream's results reach the consumer.
      act(() => {
        originalNsARequest.callback([{ metadata: { name: 'context-a1', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'context-a1' }),
          }),
        }),
      ]);

      rerender({ cluster: 'second' });
      expect(mockEndpoint.list).toHaveBeenCalledTimes(2);
      expect(mockEndpoint.list.mock.calls.map(call => call[0])).toEqual(['ns-a', 'ns-a']);
      const replacementNsARequest = requests[1]!;

      // Fresh results from the replacement stream reach the consumer.
      act(() => {
        replacementNsARequest.callback([{ metadata: { name: 'context-a2', namespace: 'ns-a' } }]);
      });
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'context-a2' }),
          }),
        }),
      ]);
      const callsBeforeStaleDelivery = onList.mock.calls.length;

      // A late callback from the cancelled original stream still matches the
      // namespace set identity and the restriction generation, so only the
      // stream revision can reject it. It must not overwrite the fresh results.
      act(() => {
        originalNsARequest.callback([
          { metadata: { name: 'stale-after-context-reconnect', namespace: 'ns-a' } },
        ]);
      });
      expect(onList).toHaveBeenCalledTimes(callsBeforeStaleDelivery);
      expect(onList).toHaveBeenLastCalledWith([
        expect.objectContaining({
          jsonData: expect.objectContaining({
            metadata: expect.objectContaining({ name: 'context-a2' }),
          }),
        }),
      ]);

      // The superseded stream is cleaned up, and its cancel-time event stays
      // suppressed as well.
      await act(async () => {
        originalNsARequest.cancellationReady.resolve(undefined);
        await originalNsARequest.cancellation;
      });
      expect(originalNsARequest.cancel).toHaveBeenCalledTimes(1);
      expect(onList).toHaveBeenCalledTimes(callsBeforeStaleDelivery);
    });
  });
});
