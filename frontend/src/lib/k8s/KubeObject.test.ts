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
import { createElement, type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { type MockInstance, vi } from 'vitest';
import {
  getCombinedAllowedNamespaces,
  hasAllowedNamespacesRestriction,
} from '../../helpers/clusterSettings';
import { getCluster } from '../cluster';
import { AllowedNamespacesResolutionContext } from './allowedNamespacesContext';
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
    vi.mocked(useConnectApi).mockImplementation((calls, deps) => realUseConnectApi(calls, deps));
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
      return ({ children }: { children?: ReactNode }) =>
        createElement(MemoryRouter, null, createElement(contextHarness(handle), null, children));
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
      vi.mocked(useConnectApi).mockImplementation((calls, deps) => realUseConnectApi(calls, deps));
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
      vi.mocked(useConnectApi).mockImplementation((calls, deps) => realUseConnectApi(calls, deps));
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
      vi.mocked(useConnectApi).mockImplementation((calls, deps) => realUseConnectApi(calls, deps));
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
  });
});
