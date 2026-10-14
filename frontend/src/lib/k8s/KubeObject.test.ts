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

import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { type MockInstance, vi } from 'vitest';
import {
  getCombinedAllowedNamespaces,
  hasAllowedNamespacesRestriction,
} from '../../helpers/clusterSettings';
import { getCluster } from '../cluster';
import { useConnectApi, useSelectedClusters } from './api/v1/hooks';
import { makeListRequests, useKubeObjectList } from './api/v2/useKubeObjectList';
import { KubeObject } from './KubeObject';

vi.mock('../cluster', () => ({
  formatClusterPathParam: vi.fn(),
  getCluster: vi.fn(),
  getSelectedClusters: vi.fn(),
}));
vi.mock('../../helpers/clusterSettings', () => ({
  loadClusterSettings: vi.fn(),
  getCombinedAllowedNamespaces: vi.fn(() => []),
  hasAllowedNamespacesRestriction: vi.fn(() => false),
}));
vi.mock('../router/createRouteURL', () => ({ createRouteURL: vi.fn() }));
vi.mock('../util', () => ({ timeAgo: vi.fn() }));
vi.mock('./api/v1/clusterRequests', () => ({ post: vi.fn() }));
vi.mock('./api/v1/factories', () => ({
  apiFactory: vi.fn(),
  apiFactoryWithNamespace: vi.fn(),
}));
const { realUseConnectApi } = vi.hoisted(() => ({
  realUseConnectApi: vi.fn(),
}));

vi.mock('./api/v1/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/hooks')>();
  realUseConnectApi.mockImplementation(actual.useConnectApi);
  return {
    ...actual,
    useConnectApi: vi.fn(),
    useSelectedClusters: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}
vi.mock('./api/v2/hooks', () => ({ useKubeObject: vi.fn() }));
vi.mock('./api/v2/useKubeObjectList', () => ({
  makeListRequests: vi.fn(),
  useKubeObjectList: vi.fn(),
}));
vi.mock('./patchUtils', () => ({
  computePatchOperations: vi.fn(),
  computeRawPatchCount: vi.fn(),
}));

describe('KubeObject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    vi.mocked(useKubeObjectList).mockReturnValue({} as any);
    // Mock useConnectApi for tests that don't use the real implementation
    vi.mocked(useConnectApi).mockImplementation(() => {});
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

    renderHook(() =>
      MyNamespacedResource.useList({
        clusters: ['cluster-a', 'cluster-b'],
        namespace: ['foo', 'bar'],
        requests,
      })
    );

    expect(makeListRequests).not.toHaveBeenCalled();
    expect(useKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({ kubeObjectClass: MyNamespacedResource, requests })
    );
  });

  it('removes namespaces from exact requests for cluster-scoped resources', () => {
    class MyClusterResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyClusterResource';
      static apiName = 'myclusterresources';
      static isNamespaced = false;
    }

    renderHook(() =>
      MyClusterResource.useList({
        requests: [{ cluster: 'cluster-a', namespaces: ['foo'] }],
      })
    );

    expect(useKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({
        kubeObjectClass: MyClusterResource,
        requests: [{ cluster: 'cluster-a', namespaces: undefined }],
      })
    );
  });
});

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

  it('lists each explicitly requested namespace', () => {
    renderHook(() =>
      NamespacedResource.useApiList(() => {}, undefined, { namespace: ['ns-a', 'ns-b'] })
    );

    expect(apiListSpy).toHaveBeenCalledTimes(2);
    expect(requestedNamespaces()).toEqual(['ns-a', 'ns-b']);
    expect(connectedCallCount()).toBe(2);
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
    vi.mocked(useConnectApi).mockImplementation((calls, deps) => realUseConnectApi(calls, deps));
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
});
