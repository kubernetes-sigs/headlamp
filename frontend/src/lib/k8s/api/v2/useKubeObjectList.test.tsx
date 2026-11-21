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
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setConfig } from '../../../../redux/configSlice';
import store from '../../../../redux/stores/store';
import Namespace from '../../namespace';
import { ApiError } from './ApiError';
import { getDiscoveredConnectionRevision } from './discoveredConnectionRevisions';
import { getResourceDiscoveryConnection } from './discoveryConnection';
import { clusterFetch } from './fetch';
import {
  DEFAULT_LIST_LIMIT,
  isWatchedListStillRequested,
  kubeObjectListQuery,
  ListResponse,
  makeListRequests,
  useKubeObjectList,
  useWatchKubeObjectLists,
} from './useKubeObjectList';
import * as websocket from './webSocket';

// Mock WebSocket functionality
const mockUseWebSockets = vi.fn();
const mockSubscribe = vi.fn().mockImplementation(() => Promise.resolve(() => {}));
const mockClusterFetch = vi.mocked(clusterFetch);

vi.mock('./webSocket', () => ({
  useWebSockets: (...args: any[]) => mockUseWebSockets(...args),
  BASE_WS_URL: 'http://localhost:3000',
}));

vi.mock('./multiplexer', () => ({
  WebSocketManager: {
    subscribe: (...args: any[]) => mockSubscribe(...args),
  },
}));

vi.mock('./fetch', () => ({
  clusterFetch: vi.fn(),
}));

describe('makeListRequests', () => {
  describe('for non namespaced resource', () => {
    it('should not include namespace in requests', () => {
      const requests = makeListRequests(['default'], () => ['namespace-a'], false, [
        'namepspace-a',
        'namespace-b',
      ]);
      expect(requests).toEqual([{ cluster: 'default', namespaces: undefined }]);
    });
  });
  describe('for namespaced resource', () => {
    it('should make request with no namespaces provided', () => {
      const requests = makeListRequests(['default'], () => [], true);
      expect(requests).toEqual([{ cluster: 'default', namespaces: [] }]);
    });

    it('should not make a cluster-wide request when a namespace restriction resolves empty', () => {
      const requests = makeListRequests(
        ['default'],
        () => [],
        true,
        [],
        () => true
      );
      expect(requests).toEqual([]);
    });

    it('should reject requested namespaces when a namespace restriction resolves empty', () => {
      const requests = makeListRequests(
        ['default'],
        () => [],
        true,
        ['namespace-a'],
        () => true
      );
      expect(requests).toEqual([]);
    });

    it('should make requests for allowed namespaces only', () => {
      const requests = makeListRequests(['default'], () => ['namespace-a'], true);
      expect(requests).toEqual([{ cluster: 'default', namespaces: ['namespace-a'] }]);
    });

    it('should make requests for allowed namespaces only, even when requested other', () => {
      const requests = makeListRequests(['default'], () => ['namespace-a'], true, [
        'namespace-a',
        'namespace-b',
      ]);
      expect(requests).toEqual([{ cluster: 'default', namespaces: ['namespace-a'] }]);
    });

    it('should skip a cluster when requested namespaces do not intersect its allow-list', () => {
      const requests = makeListRequests(
        ['cluster-a', 'cluster-b'],
        cluster => (cluster === 'cluster-a' ? ['namespace-a'] : ['namespace-b']),
        true,
        ['namespace-a'],
        () => true
      );
      expect(requests).toEqual([{ cluster: 'cluster-a', namespaces: ['namespace-a'] }]);
    });

    it('should make requests for allowed namespaces per cluster', () => {
      const requests = makeListRequests(
        ['cluster-a', 'cluster-b'],
        (cluster: string | null) => (cluster === 'cluster-a' ? ['namespace-a'] : ['namespace-b']),
        true
      );
      expect(requests).toEqual([
        { cluster: 'cluster-a', namespaces: ['namespace-a'] },
        { cluster: 'cluster-b', namespaces: ['namespace-b'] },
      ]);
    });

    it('should make requests for allowed namespaces per cluster, even if requested other', () => {
      const requests = makeListRequests(
        ['cluster-a', 'cluster-b'],
        (cluster: string | null) => (cluster === 'cluster-a' ? ['namespace-a'] : ['namespace-b']),
        true,
        ['namespace-a', 'namespace-b', 'namespace-c']
      );
      expect(requests).toEqual([
        { cluster: 'cluster-a', namespaces: ['namespace-a'] },
        { cluster: 'cluster-b', namespaces: ['namespace-b'] },
      ]);
    });

    it('should make requests for allowed namespaces per cluster, with one cluster without allowed namespaces', () => {
      const requests = makeListRequests(
        ['cluster-a', 'cluster-b'],
        (cluster: string | null) => (cluster === 'cluster-a' ? ['namespace-a'] : []),
        true,
        ['namespace-a', 'namespace-b', 'namespace-c']
      );
      expect(requests).toEqual([
        { cluster: 'cluster-a', namespaces: ['namespace-a'] },
        { cluster: 'cluster-b', namespaces: ['namespace-a', 'namespace-b', 'namespace-c'] },
      ]);
    });
  });
});

const mockClass = class {
  static apiVersion = 'v1';
  static apiName = 'pods';

  static apiEndpoint = {
    apiInfo: [
      {
        group: '',
        resource: 'pods',
        version: 'v1',
      },
    ],
  };

  constructor(public jsonData: any) {}

  get metadata() {
    return this.jsonData.metadata;
  }
} as any;

const mockNodeClass = class {
  static apiVersion = 'v1';
  static apiName = 'nodes';

  static apiEndpoint = {
    apiInfo: [
      {
        group: '',
        resource: 'nodes',
        version: 'v1',
      },
    ],
  };

  constructor(public jsonData: any) {}
} as any;

function makeListResponse({
  kind = 'PodList',
  items = [],
  resourceVersion = '1',
  continueToken,
  remainingItemCount,
}: {
  kind?: string;
  items?: any[];
  resourceVersion?: string;
  continueToken?: string;
  remainingItemCount?: number;
} = {}) {
  return {
    kind,
    apiVersion: 'v1',
    metadata: {
      resourceVersion,
      continue: continueToken,
      remainingItemCount,
    },
    items,
  };
}

function makePod(name: string, resourceVersion: string) {
  return {
    metadata: {
      name,
      namespace: 'default',
      resourceVersion,
      uid: name,
    },
  };
}

function podListPage(name: string, resourceVersion: string, continueToken?: string) {
  return new Response(
    JSON.stringify(
      makeListResponse({ items: [makePod(name, resourceVersion)], resourceVersion, continueToken })
    )
  );
}

function queryClientWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('isWatchedListStillRequested', () => {
  // Regression test for 9542b5cb5: an empty-string namespace means "all namespaces"
  // for a namespaced resource and is a valid, meaningful value — but it is falsy, so
  // a naive truthiness check (`!watching.namespace`) treats it the same as "no
  // namespace at all" and incorrectly drops the watch entry. It must never get
  // "cleaned up" just because it's an empty string.
  it('should keep a watch entry with an empty-string namespace when still requested', () => {
    const watching = { cluster: 'default', namespace: '' };
    const requests = [{ cluster: 'default', namespaces: [''] }];

    expect(isWatchedListStillRequested(watching, requests)).toBe(true);
  });

  it('should drop a watch entry whose cluster is no longer requested', () => {
    const watching = { cluster: 'default', namespace: '' };
    const requests = [{ cluster: 'other-cluster', namespaces: [''] }];

    expect(isWatchedListStillRequested(watching, requests)).toBe(false);
  });

  it('should keep a watch entry with no namespace for a non-namespaced resource', () => {
    const watching = { cluster: 'default', namespace: undefined };
    const requests = [{ cluster: 'default', namespaces: undefined }];

    expect(isWatchedListStillRequested(watching, requests)).toBe(true);
  });

  // A request with no namespace filter is served by kubeObjectListQuery with its
  // default namespace of '', so the resulting watch entry carries '' rather than
  // undefined. It still matches that request.
  it('should keep a watch entry with an empty-string namespace when the request has no namespaces', () => {
    const watching = { cluster: 'default', namespace: '' };
    const requests = [{ cluster: 'default', namespaces: undefined }];

    expect(isWatchedListStillRequested(watching, requests)).toBe(true);
  });

  it('should drop a watch entry whose namespace is no longer requested', () => {
    const watching = { cluster: 'default', namespace: 'gone' };
    const requests = [{ cluster: 'default', namespaces: ['kept'] }];

    expect(isWatchedListStillRequested(watching, requests)).toBe(false);
  });

  // The mirror image of the 9542b5cb5 regression: '' must not be read as "matches
  // anything" either. Without this case, '' is never checked against a non-empty
  // namespace list anywhere in the suite, so an implementation short-circuiting ''
  // to a match would pass every other test here.
  it('should drop a watch entry with an empty-string namespace when a specific namespace is requested', () => {
    const watching = { cluster: 'default', namespace: '' };
    const requests = [{ cluster: 'default', namespaces: ['default'] }];

    expect(isWatchedListStillRequested(watching, requests)).toBe(false);
  });
});

describe('useWatchKubeObjectLists', () => {
  beforeEach(() => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    vi.clearAllMocks();
  });

  it('should not be enabled when no endpoint is provided', () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();
    renderHook(() => useWatchKubeObjectLists({ kubeObjectClass: mockClass, lists: [] }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    expect(spy).toHaveBeenCalledWith({ enabled: false, connections: [] });
  });

  it('should call useWebSockets when endpoint and lists are provided', () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '1' }],
          endpoint: { version: 'v1', resource: 'pods' },
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    expect(spy.mock.calls[0][0].enabled).toBe(true);
    expect(spy.mock.calls[0][0].connections[0].cluster).toBe('default');
    expect(spy.mock.calls[0][0].connections[0].url).toBe('api/v1/pods?watch=1&resourceVersion=1');
  });

  it('should call useWebSockets when endpoint and 2 lists are provided', () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [
            { cluster: 'default', resourceVersion: '1', namespace: 'a' },
            { cluster: 'default', resourceVersion: '1', namespace: 'b' },
          ],
          endpoint: { version: 'v1', resource: 'pods' },
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    expect(spy.mock.calls[0][0].enabled).toBe(true);
    expect(spy.mock.calls[0][0].connections[0].cluster).toBe('default');
    expect(spy.mock.calls[0][0].connections[0].url).toBe(
      'api/v1/namespaces/a/pods?watch=1&resourceVersion=1'
    );

    expect(spy.mock.calls[0][0].connections[1].cluster).toBe('default');
    expect(spy.mock.calls[0][0].connections[1].url).toBe(
      'api/v1/namespaces/b/pods?watch=1&resourceVersion=1'
    );
  });

  it('should update query data on ADDED message', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    // Given
    const kubeObjectClass = mockClass;
    const endpoint = { version: 'v1', resource: 'pods' };
    const lists = [
      { cluster: 'default', resourceVersion: '1', namespace: 'a' },
      { cluster: 'default', resourceVersion: '1', namespace: 'b' },
    ];
    const cluster = 'default';
    const queryParams = {};
    const keyForNamespaceA = kubeObjectListQuery(
      mockClass,
      endpoint,
      'a',
      cluster,
      queryParams
    ).queryKey;
    const keyForNamespaceB = kubeObjectListQuery(
      mockClass,
      endpoint,
      'b',
      cluster,
      queryParams
    ).queryKey;

    // Prepopulate query data with existing list
    queryClient.setQueryData(keyForNamespaceA, {
      list: { items: [], metadata: { resourceVersion: '0' } },
      cluster,
    });
    queryClient.setQueryData(keyForNamespaceB, {
      list: { items: [], metadata: { resourceVersion: '0' } },
      cluster,
    });

    // When watching lists
    renderHook(() => useWatchKubeObjectLists({ kubeObjectClass, lists, endpoint }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    // And receiving updates
    const connectionToNamespaceA = useWebSocketSpy.mock.calls[0][0].connections[0];
    const objectA = { metadata: { namespace: 'a', resourceVersion: '123' } };
    connectionToNamespaceA.onMessage({
      type: 'ADDED',
      object: objectA,
    });
    const connectionToNamespaceB = useWebSocketSpy.mock.calls[0][0].connections[1];
    const objectB = { metadata: { namespace: 'b', resourceVersion: '123' } };
    connectionToNamespaceB.onMessage({
      type: 'ADDED',
      object: objectB,
    });

    // Should put object in the appropriate query data
    expect(
      (queryClient.getQueryData(keyForNamespaceA) as ListResponse<any>).list.items[0].jsonData
    ).toBe(objectA);

    expect(
      (queryClient.getQueryData(keyForNamespaceB) as ListResponse<any>).list.items[0].jsonData
    ).toBe(objectB);
  });

  it('should not call WebSocketManager.subscribe when multiplexer is disabled', () => {
    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '1' }],
          endpoint: { version: 'v1', resource: 'pods' },
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
      }
    );
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('useKubeObjectList', () => {
  beforeEach(() => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns an empty result without fetching when no list requests are allowed', () => {
    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [],
          emptyWhenNoRequests: true,
        }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );

    expect(result.result.current.items).toEqual([]);
    expect(mockClusterFetch).not.toHaveBeenCalled();
  });

  it('does not probe endpoints when no list requests are allowed', async () => {
    const multiVersionClass = class {
      static apiVersion = 'v1';
      static apiName = 'ingresses';
      static apiEndpoint = {
        apiInfo: [
          { group: 'networking.k8s.io', resource: 'ingresses', version: 'v1' },
          { group: 'extensions', resource: 'ingresses', version: 'v1beta1' },
        ],
      };
    } as any;

    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: multiVersionClass,
          requests: [],
          emptyWhenNoRequests: true,
        }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );

    await waitFor(() => expect(mockClusterFetch).not.toHaveBeenCalled());
  });

  it('fetches allowed namespaces individually without starting a cluster-wide watch', async () => {
    const namespaceClass = class {
      static apiVersion = 'v1';
      static apiName = 'namespaces';
      static kind = 'Namespace';

      constructor(public jsonData: any) {}
    } as any;
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({ allowedNamespaces: ['team-a', 'team-b'] })
    );
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            metadata: { name: 'team-a', managedFields: [{ manager: 'kubectl' }] },
          }),
      } as Response)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ metadata: { name: 'team-b' } }),
      } as Response);

    const query = kubeObjectListQuery(
      namespaceClass,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'restricted',
      {}
    );
    const response = await (query.queryFn as any)();
    const items = response.list.items as Array<{
      cluster: string;
      jsonData: { metadata: { name: string; managedFields?: unknown[] } };
    }>;

    expect(mockClusterFetch).toHaveBeenNthCalledWith(1, 'api/v1/namespaces/team-a', {
      cluster: 'restricted',
    });
    expect(mockClusterFetch).toHaveBeenNthCalledWith(2, 'api/v1/namespaces/team-b', {
      cluster: 'restricted',
    });
    expect(items.map(item => item.jsonData.metadata.name)).toEqual(['team-a', 'team-b']);
    expect(items[0].jsonData.metadata.managedFields).toBeUndefined();
    expect(items.every(item => item.cluster === 'restricted')).toBe(true);
    expect(response.skipWatch).toBe(true);
  });

  it('adds cluster and namespace context to allowed namespace errors', async () => {
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({ allowedNamespaces: ['team-a'] })
    );
    const error = new ApiError('Forbidden', { status: 403 });
    mockClusterFetch.mockRejectedValueOnce(error);

    const query = kubeObjectListQuery(
      class {
        static apiVersion = 'v1';
        static apiName = 'namespaces';
        static kind = 'Namespace';
      } as any,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'restricted',
      {}
    );

    await expect((query.queryFn as any)()).rejects.toBe(error);
    expect(error).toMatchObject({ cluster: 'restricted', namespace: 'team-a', status: 403 });
  });

  it('preserves non-ApiError failures from allowed namespace requests', async () => {
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({ allowedNamespaces: ['team-a'] })
    );
    const error = new TypeError('invalid namespace response');
    mockClusterFetch.mockRejectedValueOnce(error);

    const query = kubeObjectListQuery(
      class {
        static apiVersion = 'v1';
        static apiName = 'namespaces';
        static kind = 'Namespace';
      } as any,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'restricted',
      {}
    );

    await expect((query.queryFn as any)()).rejects.toBe(error);
  });

  it('uses the cluster-wide namespace query when no allowed namespaces are configured', async () => {
    const namespaceClass = class {
      static apiVersion = 'v1';
      static apiName = 'namespaces';
      static kind = 'Namespace';

      constructor(public jsonData: any) {}
    } as any;
    mockClusterFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(makeListResponse({ kind: 'NamespaceList' })),
    } as Response);

    const query = kubeObjectListQuery(
      namespaceClass,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'unrestricted',
      {}
    );
    const response = await (query.queryFn as any)();

    expect(mockClusterFetch).toHaveBeenCalledWith('api/v1/namespaces', {
      cluster: 'unrestricted',
    });
    expect(response.skipWatch).toBeUndefined();
  });

  it('uses a selector list when a namespace restriction resolves empty', async () => {
    const namespaceClass = class {
      static apiVersion = 'v1';
      static apiName = 'namespaces';
      static kind = 'Namespace';

      constructor(public jsonData: any) {}
    } as any;
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({ allowedNamespacesSelector: 'team=frontend' })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.restricted',
      JSON.stringify({
        selector: 'team=frontend',
        namespaces: [],
        resolvedAt: Date.now(),
      })
    );
    mockClusterFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(makeListResponse({ kind: 'NamespaceList' })),
    } as Response);

    const query = kubeObjectListQuery(
      namespaceClass,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'restricted',
      {}
    );
    const response = await (query.queryFn as any)();

    expect(response.list.items).toEqual([]);
    expect(response.skipWatch).toBe(true);
    expect(mockClusterFetch).toHaveBeenCalledWith(
      'api/v1/namespaces?labelSelector=team%3Dfrontend',
      { cluster: 'restricted' }
    );
  });

  it('lists selector-restricted namespaces without requiring per-name get access', async () => {
    const namespaceClass = class {
      static apiVersion = 'v1';
      static apiName = 'namespaces';
      static kind = 'Namespace';

      constructor(public jsonData: any) {}
    } as any;
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({ allowedNamespacesSelector: 'team=frontend' })
    );
    localStorage.setItem(
      'cluster_allowed_namespaces_selector_cache.restricted',
      JSON.stringify({
        selector: 'team=frontend',
        namespaces: ['team-a'],
        resolvedAt: Date.now(),
      })
    );
    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            kind: 'NamespaceList',
            items: [{ metadata: { name: 'team-a', labels: { team: 'frontend' } } }],
          })
        ),
    } as Response);

    const query = kubeObjectListQuery(
      namespaceClass,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'restricted',
      {}
    );
    const response = await (query.queryFn as any)();

    expect(mockClusterFetch).toHaveBeenCalledTimes(1);
    expect(mockClusterFetch).toHaveBeenCalledWith(
      'api/v1/namespaces?labelSelector=team%3Dfrontend',
      { cluster: 'restricted' }
    );
    expect(response.list.items.map((item: any) => item.jsonData.metadata.name)).toEqual(['team-a']);
  });

  it('uses the labeled namespace query while resolving a selector', async () => {
    const namespaceClass = class {
      static apiVersion = 'v1';
      static apiName = 'namespaces';
      static kind = 'Namespace';

      constructor(public jsonData: any) {}
    } as any;
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({
        allowedNamespaces: ['manual'],
        allowedNamespacesSelector: 'team=frontend',
      })
    );
    mockClusterFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(makeListResponse({ kind: 'NamespaceList' })),
    } as Response);

    const query = kubeObjectListQuery(
      namespaceClass,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'restricted',
      { labelSelector: 'team=frontend' }
    );
    await (query.queryFn as any)();

    expect(mockClusterFetch).toHaveBeenCalledWith(
      'api/v1/namespaces?labelSelector=team%3Dfrontend',
      { cluster: 'restricted' }
    );
  });

  it('intersects view selectors and only gets manually configured namespaces by name', async () => {
    const namespaceClass = class {
      static apiVersion = 'v1';
      static apiName = 'namespaces';
      static kind = 'Namespace';

      constructor(public jsonData: any) {}
    } as any;
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({
        allowedNamespaces: ['manual'],
        allowedNamespacesSelector: 'team=frontend',
      })
    );
    mockClusterFetch.mockImplementation(async url => {
      if (url === 'api/v1/namespaces/manual') {
        return {
          json: () => Promise.resolve({ metadata: { name: 'manual' } }),
        } as Response;
      }
      return {
        json: () =>
          Promise.resolve(
            makeListResponse({
              kind: 'NamespaceList',
              items: [{ metadata: { name: 'manual' } }, { metadata: { name: 'selected' } }],
            })
          ),
      } as Response;
    });

    const query = kubeObjectListQuery(
      namespaceClass,
      { version: 'v1', resource: 'namespaces' },
      undefined,
      'restricted',
      { labelSelector: 'headlamp.dev/project-id' }
    );
    const response = await (query.queryFn as any)();

    expect(mockClusterFetch).toHaveBeenCalledWith('api/v1/namespaces/manual', {
      cluster: 'restricted',
    });
    expect(mockClusterFetch).toHaveBeenCalledWith(
      'api/v1/namespaces?labelSelector=team%3Dfrontend%2Cheadlamp.dev%2Fproject-id',
      { cluster: 'restricted' }
    );
    expect(response.list.items.map((item: any) => item.jsonData.metadata.name)).toEqual([
      'manual',
      'selected',
    ]);
  });

  it('does not watch the synthesized allowed namespace list', async () => {
    const namespaceClass = class {
      static apiVersion = 'v1';
      static apiName = 'namespaces';
      static kind = 'Namespace';
      static apiEndpoint = {
        apiInfo: [{ group: '', resource: 'namespaces', version: 'v1' }],
      };

      constructor(public jsonData: any) {}
    } as any;
    localStorage.setItem(
      'cluster_settings.restricted',
      JSON.stringify({ allowedNamespaces: ['team-a'] })
    );
    mockClusterFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ metadata: { name: 'team-a' } }),
    } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: namespaceClass,
          requests: [{ cluster: 'restricted' }],
        }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );

    await waitFor(() => expect(result.result.current.items).toHaveLength(1));
    expect(mockUseWebSockets.mock.calls.at(-1)?.[0].connections).toEqual([]);
  });

  it('should not add a list limit unless the caller opts in', async () => {
    mockClusterFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(makeListResponse()),
    } as Response);

    const query = kubeObjectListQuery(
      mockClass,
      { version: 'v1', resource: 'pods' },
      undefined,
      'default',
      {}
    );

    await (query.queryFn as any)();

    expect(mockClusterFetch).toHaveBeenCalledWith('api/v1/pods', {
      cluster: 'default',
    });
  });

  it('should not fetch when no endpoint is available', async () => {
    const query = kubeObjectListQuery(mockClass, undefined as any, undefined, 'default', {});

    await expect((query.queryFn as any)()).resolves.toBeUndefined();
    expect(mockClusterFetch).not.toHaveBeenCalled();
  });

  it('should remove managed fields from listed objects', async () => {
    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [
              {
                ...makePod('pod-with-managed-fields', '1'),
                metadata: {
                  ...makePod('pod-with-managed-fields', '1').metadata,
                  managedFields: [{ manager: 'kubectl' }],
                },
              },
            ],
          })
        ),
    } as Response);

    const query = kubeObjectListQuery(
      mockClass,
      { version: 'v1', resource: 'pods' },
      undefined,
      'default',
      {}
    );
    const response = await (query.queryFn as any)();

    expect(response.list.items[0].jsonData.metadata.managedFields).toBeUndefined();
  });

  it('should strip only the List suffix from item kind', async () => {
    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            kind: 'EventListenerList',
            items: [makePod('listener-1', '1')],
          })
        ),
    } as Response);

    const query = kubeObjectListQuery(
      mockClass,
      { version: 'v1', resource: 'pods' },
      undefined,
      'default',
      {}
    );

    const response = await (query.queryFn as any)();

    expect(response.list.items[0].jsonData.kind).toBe('EventListener');
  });

  it('should append the next page and start watching when all pages are loaded', async () => {
    const queryClient = new QueryClient();
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '1')],
              resourceVersion: '1',
              continueToken: 'token-1',
              remainingItemCount: 1,
            })
          ),
      } as Response)
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              kind: 'EventListenerList',
              items: [makePod('pod-2', '2')],
              resourceVersion: '2',
            })
          ),
      } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default' }],
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => expect(result.result.current.items?.length).toBe(1));

    expect(mockClusterFetch.mock.calls[0][0]).toBe('api/v1/pods?limit=1000');
    expect(result.result.current.hasMore).toBe(true);
    expect(result.result.current.remainingItemCount).toBe(1);
    expect(result.result.current.loadMore).toEqual(expect.any(Function));
    expect(mockUseWebSockets.mock.calls.at(-1)?.[0].connections).toEqual([]);

    await act(async () => {
      await result.result.current.loadMore?.();
    });

    await waitFor(() => expect(result.result.current.items?.length).toBe(2));
    expect(result.result.current.items?.map(item => item.jsonData.metadata.name)).toEqual([
      'pod-1',
      'pod-2',
    ]);
    expect(result.result.current.items?.[1].jsonData.kind).toBe('EventListener');
    expect(mockClusterFetch.mock.calls[1][0]).toBe('api/v1/pods?limit=1000&continue=token-1');
    expect(result.result.current.hasMore).toBe(false);
    expect(result.result.current.loadMore).toBeUndefined();
    await waitFor(() =>
      expect(
        mockUseWebSockets.mock.calls.some(
          ([call]) => call.connections[0]?.url === 'api/v1/pods?watch=1&resourceVersion=2'
        )
      ).toBe(true)
    );
  });

  it('should refresh list resourceVersions when watching resumes after a query change', async () => {
    const queryClient = new QueryClient();
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ resourceVersion: '1' })),
      } as Response)
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ resourceVersion: '2' })),
      } as Response);

    const result = renderHook(
      (props: { queryParams: Record<string, number> }) =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default' }],
          queryParams: props.queryParams,
        }),
      {
        wrapper: queryClientWrapper(queryClient),
        initialProps: {
          queryParams: {},
        },
      }
    );

    await waitFor(() =>
      expect(
        mockUseWebSockets.mock.calls.some(
          ([call]) => call.connections[0]?.url === 'api/v1/pods?watch=1&resourceVersion=1'
        )
      ).toBe(true)
    );

    result.rerender({ queryParams: { limit: DEFAULT_LIST_LIMIT } });

    await waitFor(() =>
      expect(
        mockUseWebSockets.mock.calls.some(
          ([call]) => call.connections[0]?.url === 'api/v1/pods?watch=1&resourceVersion=2'
        )
      ).toBe(true)
    );
  });

  it('should split an opt-in limit across namespace requests', async () => {
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-a', '1')] })),
      } as Response)
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-b', '1')] })),
      } as Response);

    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b'] }],
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));

    expect(mockClusterFetch.mock.calls[0][0]).toBe('api/v1/namespaces/a/pods?limit=500');
    expect(mockClusterFetch.mock.calls[1][0]).toBe('api/v1/namespaces/b/pods?limit=500');
  });

  it('should keep every namespace in clusterResults when a cluster has several', async () => {
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-a', '1')] })),
      } as Response)
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-b', '1')] })),
      } as Response);

    const { result } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b'] }],
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));

    const names = (items: any[] | null | undefined) =>
      items?.map(item => item.jsonData.metadata.name);
    expect(names(result.current.items)).toEqual(['pod-a', 'pod-b']);
    expect(names(result.current.clusterResults?.default.items)).toEqual(['pod-a', 'pod-b']);
    expect(result.current.clusterResults?.default.isSuccess).toBe(true);
    expect(result.current.clusterResults?.default.status).toBe('success');
  });

  it('should report a namespace that failed in clusterResults', async () => {
    const error = new ApiError('Forbidden', { status: 403 });
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-a', '1')] })),
      } as Response)
      .mockRejectedValueOnce(error);

    const { result } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b'] }],
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    await waitFor(() => expect(result.current.clusterResults?.default.isError).toBe(true));

    const clusterResult = result.current.clusterResults!.default;
    expect(clusterResult.items?.map(item => item.jsonData.metadata.name)).toEqual(['pod-a']);
    expect(clusterResult.errors).toEqual([error]);
    expect(clusterResult.isSuccess).toBe(false);
    expect(clusterResult.status).toBe('error');
  });

  it('should report a namespace that is still loading in clusterResults', async () => {
    const namespaceB = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-a', '1')] })),
      } as Response)
      .mockReturnValueOnce(namespaceB.promise);

    const { result } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b'] }],
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    await waitFor(() => expect(result.current.clusterResults?.default.items).toHaveLength(1));
    expect(result.current.clusterResults?.default.isLoading).toBe(true);
    expect(result.current.clusterResults?.default.isSuccess).toBe(false);
    expect(result.current.clusterResults?.default.status).toBe('pending');

    namespaceB.resolve({
      json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-b', '1')] })),
    } as Response);

    await waitFor(() => expect(result.current.clusterResults?.default.items).toHaveLength(2));
    expect(result.current.clusterResults?.default.isLoading).toBe(false);
    expect(result.current.clusterResults?.default.status).toBe('success');
  });

  it('should leave a cluster out of clusterResults until one of its namespaces has data', async () => {
    const namespaceA = deferred<Response>();
    const namespaceB = deferred<Response>();
    mockClusterFetch
      .mockReturnValueOnce(namespaceA.promise)
      .mockReturnValueOnce(namespaceB.promise);

    const { result } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b'] }],
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    // Home shows a cluster without an entry as still loading.
    await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
    expect(result.current.clusterResults?.default).toBeUndefined();

    namespaceA.resolve({
      json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-a', '1')] })),
    } as Response);

    await waitFor(() => expect(result.current.clusterResults?.default.items).toHaveLength(1));
  });

  it('should not issue more initial namespace requests than the opt-in limit', async () => {
    const nextNamespace = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-a', '1')] })),
      } as Response)
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-b', '1')] })),
      } as Response)
      .mockReturnValueOnce(nextNamespace.promise);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b', 'c'] }],
          queryParams: { limit: 2 },
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));

    expect(mockClusterFetch.mock.calls[0][0]).toBe('api/v1/namespaces/a/pods?limit=1');
    expect(mockClusterFetch.mock.calls[1][0]).toBe('api/v1/namespaces/b/pods?limit=1');
    expect(result.result.current.hasMore).toBe(true);
    expect(result.result.current.remainingItemCount).toBeUndefined();

    await act(async () => {
      let loadMoreSettled = false;
      const loadMorePromise = result.result.current.loadMore?.().then(() => {
        loadMoreSettled = true;
      });

      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(3));
      expect(loadMoreSettled).toBe(false);

      nextNamespace.resolve({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-c', '1')] })),
      } as Response);
      await loadMorePromise;
      expect(loadMoreSettled).toBe(true);
    });

    expect(mockClusterFetch.mock.calls[2][0]).toBe('api/v1/namespaces/c/pods?limit=1');
  });

  it('should leave remainingItemCount unset when the server does not report it', async () => {
    const queryClient = new QueryClient();
    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '1')],
            resourceVersion: '1',
            continueToken: 'token-1',
          })
        ),
    } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default' }],
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => expect(result.result.current.hasMore).toBe(true));

    expect(result.result.current.remainingItemCount).toBeUndefined();
  });

  it('should expose loadMore errors through the list response', async () => {
    const queryClient = new QueryClient();
    const loadMoreError = new ApiError('expired continue token', { status: 410 });
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '1')],
              resourceVersion: '1',
              continueToken: 'token-1',
            })
          ),
      } as Response)
      .mockRejectedValueOnce(loadMoreError);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default' }],
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => expect(result.result.current.loadMore).toEqual(expect.any(Function)));

    await act(async () => {
      await result.result.current.loadMore?.();
    });

    await waitFor(() =>
      expect(result.result.current.error?.message).toBe('expired continue token')
    );
    expect(result.result.current.isError).toBe(true);
    expect(result.result.current.errors).toContainEqual(
      expect.objectContaining({ message: 'expired continue token', status: 410 })
    );
  });

  it('should normalize pending list request rejections to ApiError', async () => {
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve(makeListResponse({ items: [makePod('pod-a', '1')] })),
      } as Response)
      .mockRejectedValueOnce(new SyntaxError('invalid list response'));

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b'] }],
          queryParams: { limit: 1 },
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    await waitFor(() => expect(result.result.current.loadMore).toEqual(expect.any(Function)));

    await act(async () => {
      await result.result.current.loadMore?.();
    });

    expect(result.result.current.error).toBeInstanceOf(ApiError);
    expect(result.result.current.error).toMatchObject({
      message: 'invalid list response',
      cluster: 'default',
      namespace: 'b',
    });
  });

  it('should normalize unexpected page processing errors to ApiError', async () => {
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '1')],
              continueToken: 'token-1',
            })
          ),
      } as Response)
      .mockResolvedValueOnce({ json: () => Promise.resolve({}) } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a'] }],
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(new QueryClient()),
      }
    );

    await waitFor(() => expect(result.result.current.loadMore).toEqual(expect.any(Function)));

    await act(async () => {
      await result.result.current.loadMore?.();
    });

    expect(result.result.current.error).toBeInstanceOf(ApiError);
    expect(result.result.current.error).toMatchObject({
      cluster: 'default',
      namespace: 'a',
    });
  });

  it('should clear loadMore errors when request inputs change', async () => {
    const queryClient = new QueryClient();
    const loadMoreError = new ApiError('expired continue token', { status: 410 });
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '1')],
              resourceVersion: '1',
              continueToken: 'token-1',
            })
          ),
      } as Response)
      .mockRejectedValueOnce(loadMoreError)
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-2', '1')],
              resourceVersion: '1',
            })
          ),
      } as Response);

    const result = renderHook(
      (props: { requests: Array<{ cluster: string; namespaces?: string[] }> }) =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: props.requests,
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(queryClient),
        initialProps: {
          requests: [{ cluster: 'default', namespaces: ['a'] }],
        },
      }
    );

    await waitFor(() => expect(result.result.current.loadMore).toEqual(expect.any(Function)));

    await act(async () => {
      await result.result.current.loadMore?.();
    });

    await waitFor(() =>
      expect(result.result.current.error?.message).toBe('expired continue token')
    );

    result.rerender({ requests: [{ cluster: 'default', namespaces: ['b'] }] });

    await waitFor(() => expect(result.result.current.error).toBeNull());
  });

  it('should ignore duplicate loadMore calls while a page is already loading', async () => {
    const queryClient = new QueryClient();
    const nextPage = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '1')],
              resourceVersion: '1',
              continueToken: 'token-1',
            })
          ),
      } as Response)
      .mockReturnValueOnce(nextPage.promise);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default' }],
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => expect(result.result.current.loadMore).toEqual(expect.any(Function)));

    await act(async () => {
      const firstLoad = result.result.current.loadMore?.();
      const secondLoad = result.result.current.loadMore?.();

      expect(mockClusterFetch).toHaveBeenCalledTimes(2);

      nextPage.resolve({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-2', '2')],
              resourceVersion: '2',
            })
          ),
      } as Response);

      await Promise.all([firstLoad, secondLoad]);
    });

    await waitFor(() => expect(result.result.current.items?.length).toBe(2));
    expect(mockClusterFetch.mock.calls[1][0]).toBe('api/v1/pods?limit=1000&continue=token-1');
  });

  it('should call useKubeObjectList with 1 namespace after reducing amount of namespaces', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'a', {}], {
      list: { items: [], metadata: { resourceVersion: '0' } },
      cluster: 'default',
      namespace: 'a',
    });
    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'b', {}], {
      list: { items: [], metadata: { resourceVersion: '0' } },
      cluster: 'default',
      namespace: 'b',
    });

    const result = renderHook(
      (props: {}) =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['a', 'b'] }],
          ...props,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    result.rerender({ requests: [{ cluster: 'default', namespaces: ['a'] }] });

    await waitFor(() => expect(spy.mock.calls.at(-1)?.[0].connections.length).toBe(1));
    expect(spy.mock.calls.at(-1)?.[0].connections[0].url).toContain('/namespaces/a/');
  });

  it('should clean up cluster-scoped resources when cluster is removed', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'nodes', 'cluster-1', '', {}], {
      list: { items: [], metadata: { resourceVersion: '0' } },
      cluster: 'cluster-1',
    });
    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'nodes', 'cluster-2', '', {}], {
      list: { items: [], metadata: { resourceVersion: '0' } },
      cluster: 'cluster-2',
    });

    const result = renderHook(
      (props: { requests: Array<{ cluster: string; namespaces?: string[] }> }) =>
        useKubeObjectList({
          kubeObjectClass: mockNodeClass,
          requests: props.requests,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
        initialProps: {
          requests: [{ cluster: 'cluster-1' }, { cluster: 'cluster-2' }],
        },
      }
    );

    expect(spy.mock.calls[1][0].connections.length).toBe(2);

    result.rerender({ requests: [{ cluster: 'cluster-1' }] });

    expect(spy.mock.calls[3][0].connections.length).toBe(1);
    expect(spy.mock.calls[3][0].connections[0].cluster).toBe('cluster-1');
  });
});

describe('useWatchKubeObjectLists (Multiplexer)', () => {
  beforeEach(() => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    vi.clearAllMocks();
    mockClusterFetch.mockReset();
  });

  it('should subscribe using WebSocketManager when multiplexer is enabled', () => {
    const lists = [{ cluster: 'cluster-a', namespace: 'namespace-a', resourceVersion: '1' }];

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint: { version: 'v1', resource: 'pods' },
          lists,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
      }
    );

    expect(mockSubscribe).toHaveBeenCalledWith(
      'cluster-a',
      expect.stringContaining('/api/v1/namespaces/namespace-a/pods'),
      'watch=1&resourceVersion=1',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('refreshes a configured namespace selector after its multiplexed watch is rejected', async () => {
    const cluster = 'restricted-namespace-watch';
    const labelSelector = 'team=frontend';
    const settingsKey = `cluster_settings.${cluster}`;
    localStorage.setItem(settingsKey, JSON.stringify({ allowedNamespacesSelector: labelSelector }));
    focusManager.setFocused(true);
    mockClusterFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeListResponse({
              kind: 'NamespaceList',
              items: [{ metadata: { name: 'team-a', resourceVersion: '1' } }],
            })
          )
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeListResponse({
              kind: 'NamespaceList',
              resourceVersion: '2',
              items: [],
            })
          )
        )
      );
    const { result, unmount } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: Namespace,
          requests: [{ cluster }],
          queryParams: { labelSelector },
        }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );

    try {
      await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
      expect(result.current.items?.map(item => item.metadata.name)).toEqual(['team-a']);
      vi.useFakeTimers({
        toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      });
      act(() => mockSubscribe.mock.calls[0][4](new Error('Watch forbidden')));
      await act(async () => vi.advanceTimersByTimeAsync(2));
      expect(result.current.errors?.[0].message).toBe('Watch forbidden');
      await act(async () => vi.advanceTimersByTimeAsync(29_950));
      expect(mockClusterFetch).toHaveBeenCalledTimes(1);

      await act(async () => vi.advanceTimersByTimeAsync(100));
      expect(mockClusterFetch).toHaveBeenCalledTimes(2);
      expect(mockClusterFetch.mock.calls[1][0]).toBe(
        'api/v1/namespaces?labelSelector=team%3Dfrontend'
      );
      expect(mockClusterFetch.mock.calls[1][1].headers).toEqual({ 'Cache-Control': 'no-cache' });
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(result.current.items).toEqual([]);
    } finally {
      unmount();
      vi.useRealTimers();
      focusManager.setFocused(undefined);
      localStorage.removeItem(settingsKey);
    }
  });

  it.each(['the next event', 'a replacement subscription'] as const)(
    'keeps a multiplexed watch error separate from LIST and clears it on %s',
    async recovery => {
      mockClusterFetch.mockResolvedValueOnce(podListPage('pod-1', '1'));
      const client = new QueryClient();
      const requests = [{ cluster: 'ordinary' }];
      const wrapper = queryClientWrapper(client);
      const watching = renderHook(
        () => useKubeObjectList({ kubeObjectClass: mockClass, requests }),
        {
          wrapper,
        }
      );
      const listing = renderHook(
        () => useKubeObjectList({ kubeObjectClass: mockClass, requests, watch: false }),
        { wrapper }
      );

      await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
      const onMessage = mockSubscribe.mock.calls[0][3];
      act(() => onMessage({ type: 'ERROR', object: { code: 403, message: 'Forbidden' } }));
      await waitFor(() => expect(watching.result.current.errors?.[0].status).toBe(403));
      expect(listing.result.current.errors).toBeNull();
      expect(listing.result.current.items?.[0].metadata.name).toBe('pod-1');

      if (recovery === 'the next event') {
        act(() => onMessage({ type: 'MODIFIED', object: makePod('pod-1', '2') }));
      } else {
        mockClusterFetch.mockResolvedValueOnce(podListPage('pod-1', '2'));
        await act(async () => client.invalidateQueries());
        await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(2));
      }
      await waitFor(() => expect(watching.result.current.errors).toBeNull());
      expect(listing.result.current.items?.[0].metadata.resourceVersion).toBe('2');
    }
  );

  it('unsubscribes a pinned multiplexed watch when its cursor expires', async () => {
    mockClusterFetch.mockResolvedValueOnce(podListPage('pod-1', '1'));
    const unsubscribe = vi.fn();
    mockSubscribe.mockResolvedValueOnce(unsubscribe);
    const requests = [{ cluster: 'ordinary' }];
    const { result } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests,
          queryParams: { resourceVersion: '1', resourceVersionMatch: 'Exact' },
        }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    act(() => mockSubscribe.mock.calls[0][3]({ type: 'ERROR', object: { code: 410 } }));
    await waitFor(() => expect(result.current.errors?.[0].status).toBe(410));
    expect(result.current.items?.[0].metadata.name).toBe('pod-1');
    expect(mockClusterFetch).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  function registerDiscoveredCluster(connectionRevision?: string) {
    const previous = store.getState().config.clusters;
    store.dispatch(
      setConfig({
        clusters: {
          ...previous,
          discovered: {
            name: 'discovered',
            auth_type: 'oidc',
            server: 'https://old-discovery.example.com',
            meta_data: {
              discoveryConnectionRevision: connectionRevision,
              discoveryOrigin: {
                cluster: 'management',
                resource: {
                  apiVersion: 'cluster.x-k8s.io/v1beta2',
                  kind: 'Cluster',
                  namespace: 'default',
                  name: 'workload',
                  uid: 'workload-uid',
                },
              },
            },
          },
        },
      })
    );
    return () => store.dispatch(setConfig({ clusters: previous }));
  }

  it('keeps a discovered cluster watch open on updates and relists when its version expires', async () => {
    const restoreClusters = registerDiscoveredCluster('route-a');
    const queryClient = new QueryClient();
    mockClusterFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(makeListResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeListResponse({ resourceVersion: '10' })))
      );
    const requests = [{ cluster: 'discovered' }];
    try {
      const result = renderHook(() => useKubeObjectList({ kubeObjectClass: mockClass, requests }), {
        wrapper: queryClientWrapper(queryClient),
      });
      const connections = () => mockUseWebSockets.mock.lastCall?.[0].connections;

      await waitFor(() => expect(connections()).toHaveLength(1));
      const initialConnections = connections();
      const [connection] = initialConnections;
      expect(connection.url).toBe(
        'api/v1/pods?watch=1&resourceVersion=1&__headlamp_connection_revision=route-a'
      );

      act(() => connection.onMessage({ type: 'ADDED', object: makePod('pod-1', '2') }));
      await waitFor(() => expect(result.result.current.items).toHaveLength(1));
      expect(connections()).toBe(initialConnections);
      const [resource] = result.result.current.items!;
      expect(resource.cluster).toBe('discovered');
      expect(getResourceDiscoveryConnection(resource)).toEqual({
        cluster: 'discovered',
        revision: getDiscoveredConnectionRevision('discovered'),
      });
      await expect(connection.getWatchUrl(false)).resolves.toBe(
        'api/v1/pods?watch=1&resourceVersion=2&__headlamp_connection_revision=route-a'
      );

      act(() => connection.onMessage({ type: 'ERROR', object: { kind: 'Status', code: 410 } }));
      await waitFor(() => expect(result.result.current.items).toHaveLength(0));
      expect(connections()).toBe(initialConnections);
      await expect(connection.getWatchUrl(true)).resolves.toBe(
        'api/v1/pods?watch=1&resourceVersion=10&__headlamp_connection_revision=route-a'
      );
      expect(mockClusterFetch.mock.calls[1][1].headers).toEqual({ 'Cache-Control': 'no-cache' });
      expect(mockClusterFetch).toHaveBeenCalledTimes(2);
    } finally {
      restoreClusters();
    }
  });

  it('keeps watch updates when an older background list response arrives', async () => {
    const restoreClusters = registerDiscoveredCluster();
    const queryClient = new QueryClient();
    const delayedList = deferred<Response>();
    const staleList = JSON.stringify(makeListResponse());
    mockClusterFetch
      .mockResolvedValueOnce(new Response(staleList))
      .mockReturnValueOnce(delayedList.promise);
    const requests = [{ cluster: 'discovered' }];
    const { result, unmount } = renderHook(
      () => useKubeObjectList({ kubeObjectClass: mockClass, requests }),
      { wrapper: queryClientWrapper(queryClient) }
    );
    try {
      const connections = () => mockUseWebSockets.mock.lastCall?.[0].connections;

      await waitFor(() => expect(connections()).toHaveLength(1));
      const [connection] = connections();
      const refetch = queryClient.invalidateQueries();
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      const signal = mockClusterFetch.mock.calls[1][1].signal;

      act(() => connection.onMessage({ type: 'ADDED', object: makePod('pod-1', '2') }));
      await waitFor(() => expect(result.current.items).toHaveLength(1));

      await act(async () => {
        delayedList.resolve(new Response(staleList));
        await refetch;
      });
      const cached = queryClient.getQueryData<ListResponse<any>>([
        'kubeObject',
        'list',
        'v1',
        'pods',
        'discovered',
        '',
        {},
      ]);
      expect(cached?.list.items).toHaveLength(1);
      expect(signal?.aborted).toBe(true);
    } finally {
      unmount();
      restoreClusters();
    }
  });

  it('resumes from the cached cursor and periodically relists after rejected upgrades', async () => {
    const restoreClusters = registerDiscoveredCluster();
    mockClusterFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(makeListResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeListResponse({ resourceVersion: '10' })))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeListResponse({ resourceVersion: '20' })))
      );
    const requests = [{ cluster: 'discovered' }];
    const clock = vi.spyOn(Date, 'now');
    try {
      renderHook(() => useKubeObjectList({ kubeObjectClass: mockClass, requests }), {
        wrapper: queryClientWrapper(new QueryClient()),
      });
      const connections = () => mockUseWebSockets.mock.lastCall?.[0].connections;

      await waitFor(() => expect(connections()).toHaveLength(1));
      const [connection] = connections();
      expect(connection.url).toBe('api/v1/pods?watch=1&resourceVersion=1');

      act(() => connection.onMessage({ type: 'ADDED', object: makePod('new-pod', '2') }));
      await expect(connection.getWatchUrl(true)).resolves.toBe(
        'api/v1/pods?watch=1&resourceVersion=2'
      );
      expect(mockClusterFetch).toHaveBeenCalledTimes(1);
      const failureAt = Date.now();
      clock.mockReturnValue(failureAt);
      act(() => connection.onOpenFailure());
      await expect(connection.getWatchUrl(true)).resolves.toBe(
        'api/v1/pods?watch=1&resourceVersion=10'
      );
      act(() => connection.onOpenFailure());
      await expect(connection.getWatchUrl(true)).resolves.toBe(
        'api/v1/pods?watch=1&resourceVersion=10'
      );
      expect(mockClusterFetch).toHaveBeenCalledTimes(2);
      clock.mockReturnValue(failureAt + 30_000);
      act(() => connection.onOpenFailure());
      await expect(connection.getWatchUrl(true)).resolves.toBe(
        'api/v1/pods?watch=1&resourceVersion=20'
      );
      expect(mockClusterFetch).toHaveBeenCalledTimes(3);
    } finally {
      clock.mockRestore();
      restoreClusters();
    }
  });

  it.each(['a rejected upgrade', 'an expired watch'])(
    'restores a complete paginated snapshot after %s',
    async reason => {
      const restoreClusters = registerDiscoveredCluster();
      const lastPage = deferred<Response>();
      mockClusterFetch
        .mockResolvedValueOnce(podListPage('old-first', '1', 'old-next'))
        .mockResolvedValueOnce(podListPage('old-last', '1'))
        .mockResolvedValueOnce(podListPage('new-first', '10', 'new-next'))
        .mockReturnValueOnce(lastPage.promise);

      const requests = [{ cluster: 'discovered' }];
      const { result, unmount } = renderHook(
        () =>
          useKubeObjectList({ kubeObjectClass: mockClass, requests, queryParams: { limit: 1 } }),
        { wrapper: queryClientWrapper(new QueryClient()) }
      );
      const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections?.[0];
      const names = () => result.current.items?.map(item => item.metadata.name);
      let reopening: Promise<string | null> | undefined;

      try {
        await waitFor(() => expect(result.current.loadMore).toBeDefined());
        await act(async () => result.current.loadMore?.());
        await waitFor(() => expect(watch()?.url).toBe('api/v1/pods?watch=1&resourceVersion=1'));
        expect(names()).toEqual(['old-first', 'old-last']);

        const previousWatch = watch();
        if (reason === 'an expired watch') {
          act(() => previousWatch.onMessage({ type: 'ERROR', object: { code: 410 } }));
        } else {
          act(() => previousWatch.onOpenFailure());
        }
        reopening = previousWatch.getWatchUrl(true);
        await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(4));
        expect(mockClusterFetch.mock.calls[3][0]).toBe('api/v1/pods?limit=1&continue=new-next');
        expect(result.current.hasMore).toBe(false);
        expect(names()).toEqual(['old-first', 'old-last']);

        await act(async () => lastPage.resolve(podListPage('new-last', '10')));
        await expect(reopening).resolves.toBe('api/v1/pods?watch=1&resourceVersion=10');
        await waitFor(() => expect(names()).toEqual(['new-first', 'new-last']));
        expect(watch()).toBe(previousWatch);
        expect(result.current.loadMore).toBeUndefined();

        act(() => watch().onMessage({ type: 'ADDED', object: makePod('live-pod', '11') }));
        await waitFor(() => expect(names()).toEqual(['new-first', 'new-last', 'live-pod']));
      } finally {
        unmount();
        lastPage.resolve(podListPage('new-last', '10'));
        try {
          await reopening;
        } finally {
          restoreClusters();
        }
      }
    }
  );

  it('keeps a complete list when another observer refreshes during Load More', async () => {
    const queryClient = new QueryClient();
    const oldLastPage = deferred<Response>();
    const replacementFirstPage = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('old-first', '1', 'old-next'))
      .mockReturnValueOnce(oldLastPage.promise)
      .mockReturnValueOnce(replacementFirstPage.promise)
      .mockResolvedValueOnce(podListPage('new-last', '10'));

    const options = {
      kubeObjectClass: mockClass,
      requests: [{ cluster: 'default' }],
      queryParams: { limit: 1 },
    };
    const wrapper = queryClientWrapper(queryClient);
    const watching = renderHook(() => useKubeObjectList(options), { wrapper });
    const snapshot = renderHook(() => useKubeObjectList({ ...options, watch: false }), { wrapper });

    await waitFor(() => expect(snapshot.result.current.loadMore).toBeDefined());
    const loadingMore = snapshot.result.current.loadMore!();
    const refreshing = queryClient.invalidateQueries();
    await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(3));

    await act(async () => {
      oldLastPage.resolve(podListPage('old-last', '1'));
      await loadingMore;
    });
    await waitFor(() => expect(watching.result.current.hasMore).toBe(false));

    await act(async () => {
      replacementFirstPage.resolve(podListPage('new-first', '10', 'new-next'));
      await refreshing;
    });
    await waitFor(() =>
      expect(snapshot.result.current.items?.map(item => item.metadata.name)).toEqual([
        'new-first',
        'new-last',
      ])
    );
    expect(watching.result.current.hasMore).toBe(false);
    expect(mockClusterFetch.mock.calls[3][0]).toBe('api/v1/pods?limit=1&continue=new-next');
  });

  it('retains the page boundary when the list has no watch observers', async () => {
    const queryClient = new QueryClient();
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('old-only', '1'))
      .mockResolvedValueOnce(podListPage('new-first', '10', 'new-next'));
    const { result } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default' }],
          queryParams: { limit: 1 },
          watch: false,
        }),
      { wrapper: queryClientWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('old-only'));
    await act(async () => queryClient.invalidateQueries());
    await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('new-first'));
    expect(result.current.hasMore).toBe(true);
    expect(mockClusterFetch).toHaveBeenCalledTimes(2);
  });

  it('returns the first page when the last watch observer unmounts during refresh', async () => {
    const queryClient = new QueryClient();
    const pendingPage = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('old-only', '1'))
      .mockResolvedValueOnce(podListPage('new-first', '10', 'new-next'))
      .mockReturnValueOnce(pendingPage.promise);
    const options = {
      kubeObjectClass: mockClass,
      requests: [{ cluster: 'default' }],
      queryParams: { limit: 1 },
    };
    const wrapper = queryClientWrapper(queryClient);
    const watching = renderHook(() => useKubeObjectList(options), { wrapper });
    const snapshot = renderHook(() => useKubeObjectList({ ...options, watch: false }), { wrapper });

    await waitFor(() => expect(watching.result.current.items?.[0].metadata.name).toBe('old-only'));
    const refreshing = queryClient.invalidateQueries();
    await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(3));
    watching.unmount();

    await act(async () => {
      pendingPage.resolve(podListPage('new-second', '10', 'new-third'));
      await refreshing;
    });
    await waitFor(() => expect(snapshot.result.current.items?.[0].metadata.name).toBe('new-first'));
    expect(snapshot.result.current.items).toHaveLength(1);
    expect(snapshot.result.current.hasMore).toBe(true);
    expect(mockClusterFetch).toHaveBeenCalledTimes(3);
  });

  it.each(['page', 'expiry error'])(
    'loads the replacement snapshot before an outdated continuation %s settles',
    async outcome => {
      const queryClient = new QueryClient();
      const previousPage = deferred<void>();
      mockClusterFetch
        .mockResolvedValueOnce(podListPage('old-first', '1', 'old-next'))
        .mockReturnValueOnce(
          previousPage.promise.then(() => {
            if (outcome === 'expiry error')
              throw new ApiError('Old token expired', { status: 410 });
            return podListPage('old-last', '1');
          })
        )
        .mockResolvedValueOnce(podListPage('new-first', '10', 'new-next'))
        .mockResolvedValueOnce(podListPage('new-last', '10'));
      const { result } = renderHook(
        () =>
          useKubeObjectList({
            kubeObjectClass: mockClass,
            requests: [{ cluster: 'default' }],
            queryParams: { limit: 1 },
          }),
        { wrapper: queryClientWrapper(queryClient) }
      );

      await waitFor(() => expect(result.current.loadMore).toBeDefined());
      const loadingMore = result.current.loadMore!();
      await act(async () => queryClient.invalidateQueries());
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('new-first'));

      await act(async () => result.current.loadMore?.());
      await waitFor(() =>
        expect(result.current.items?.map(item => item.metadata.name)).toEqual([
          'new-first',
          'new-last',
        ])
      );
      expect(mockClusterFetch.mock.calls[3][0]).toBe('api/v1/pods?limit=1&continue=new-next');
      await act(async () => {
        previousPage.resolve();
        await loadingMore;
      });
      expect(result.current.error).toBeNull();
      expect(result.current.hasMore).toBe(false);
      expect(result.current.items).toHaveLength(2);
    }
  );

  function updateDiscoveredConnection(server: string, discoveryConnectionRevision: string) {
    act(() => {
      const clusters = store.getState().config.clusters!;
      const cluster = clusters.discovered;
      store.dispatch(
        setConfig({
          clusters: {
            ...clusters,
            discovered: {
              ...cluster,
              server,
              meta_data: { ...cluster.meta_data, discoveryConnectionRevision },
            },
          },
        })
      );
    });
  }

  it('replaces list data and watches when the discovery connection changes', async () => {
    const restoreClusters = registerDiscoveredCluster('connection-a');
    const replacementList = deferred<Response>();
    const returnedList = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeListResponse({ items: [makePod('old-pod', '1')] })))
      )
      .mockReturnValueOnce(replacementList.promise)
      .mockReturnValueOnce(returnedList.promise);
    const requests = [{ cluster: 'discovered' }];
    const { result, unmount } = renderHook(
      () => useKubeObjectList({ kubeObjectClass: mockClass, requests }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );
    const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections?.[0];
    try {
      await waitFor(() => expect(watch()?.cacheEntry).toBeDefined());
      const previousWatch = watch();
      expect(previousWatch.url).toContain('__headlamp_connection_revision=connection-a');
      expect(result.current.items?.[0].metadata.name).toBe('old-pod');

      updateDiscoveredConnection('https://new-discovery.example.com', 'connection-b');

      await waitFor(() => expect(watch()).toBeUndefined());
      expect(result.current.items).toBeNull();
      act(() => previousWatch.onMessage({ type: 'ADDED', object: makePod('late-old-pod', '2') }));

      await act(async () =>
        replacementList.resolve(
          new Response(JSON.stringify(makeListResponse({ items: [makePod('new-pod', '1')] })))
        )
      );
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('new-pod'));
      await waitFor(() => expect(watch()?.cacheEntry).toBeDefined());
      expect(watch().cacheEntry).not.toBe(previousWatch.cacheEntry);
      expect(watch().url).toContain('__headlamp_connection_revision=connection-b');
      expect(result.current.items).toHaveLength(1);

      updateDiscoveredConnection('https://old-discovery.example.com', 'connection-a');
      await waitFor(() => expect(watch()).toBeUndefined());
      expect(result.current.items).toBeNull();
      await act(async () =>
        returnedList.resolve(
          new Response(JSON.stringify(makeListResponse({ items: [makePod('returned-pod', '1')] })))
        )
      );
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('returned-pod'));
      expect(mockClusterFetch).toHaveBeenCalledTimes(3);
    } finally {
      unmount();
      restoreClusters();
    }
  });

  it('refreshes a list when the connection changes and returns while no list is mounted', async () => {
    const restoreClusters = registerDiscoveredCluster('connection-a');
    const freshList = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('old-pod', '1'))
      .mockReturnValueOnce(freshList.promise);
    const requests = [{ cluster: 'discovered' }];
    const wrapper = queryClientWrapper(new QueryClient());
    const mountList = () =>
      renderHook(() => useKubeObjectList({ kubeObjectClass: mockClass, requests }), { wrapper });
    const original = mountList();

    try {
      await waitFor(() => expect(original.result.current.items?.[0].metadata.name).toBe('old-pod'));
      original.unmount();
      updateDiscoveredConnection('https://new-discovery.example.com', 'connection-b');
      updateDiscoveredConnection('https://old-discovery.example.com', 'connection-a');
      expect(mockClusterFetch).toHaveBeenCalledTimes(1);

      const remounted = mountList();
      try {
        await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
        expect(remounted.result.current.items).toBeNull();

        await act(async () => freshList.resolve(podListPage('fresh-pod', '1')));
        await waitFor(() =>
          expect(remounted.result.current.items?.[0].metadata.name).toBe('fresh-pod')
        );
      } finally {
        remounted.unmount();
      }
    } finally {
      original.unmount();
      freshList.resolve(podListPage('fresh-pod', '1'));
      restoreClusters();
    }
  });

  it('ignores old pagination failures and keeps the replacement page request pending', async () => {
    const restoreClusters = registerDiscoveredCluster('connection-a');
    const oldPage = deferred<void>();
    const newPage = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeListResponse({
              items: [makePod('old-pod', '1')],
              continueToken: 'old-page',
            })
          )
        )
      )
      .mockReturnValueOnce(
        oldPage.promise.then(() => {
          throw new ApiError('Previous connection failed', { status: 503 });
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeListResponse({
              items: [makePod('new-pod', '1')],
              continueToken: 'new-page',
            })
          )
        )
      )
      .mockReturnValueOnce(newPage.promise);

    const requests = [{ cluster: 'discovered' }];
    const { result, unmount } = renderHook(
      () => useKubeObjectList({ kubeObjectClass: mockClass, requests, queryParams: { limit: 1 } }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );
    try {
      await waitFor(() => expect(result.current.loadMore).toBeDefined());
      const oldOperation = result.current.loadMore!();
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      expect(mockClusterFetch.mock.calls[1][0]).toContain(
        '__headlamp_connection_revision=connection-a'
      );

      updateDiscoveredConnection('https://new-discovery.example.com', 'connection-b');
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('new-pod'));
      const newOperation = result.current.loadMore!();
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(4));
      expect(mockClusterFetch.mock.calls[3][0]).toContain(
        '__headlamp_connection_revision=connection-b'
      );

      await act(async () => {
        oldPage.resolve();
        await oldOperation;
      });
      expect(result.current.error).toBeNull();
      expect(result.current.items).toHaveLength(1);
      const duplicate = result.current.loadMore!();
      expect(mockClusterFetch).toHaveBeenCalledTimes(4);

      await act(async () => {
        newPage.resolve(
          new Response(JSON.stringify(makeListResponse({ items: [makePod('new-page-pod', '1')] })))
        );
        await Promise.all([newOperation, duplicate]);
      });
      await waitFor(() =>
        expect(result.current.items?.map(item => item.metadata.name)).toEqual([
          'new-pod',
          'new-page-pod',
        ])
      );
      expect(result.current.error).toBeNull();
    } finally {
      unmount();
      restoreClusters();
    }
  });

  it('uses the direct watch for discovered clusters in a mixed list', () => {
    const restoreClusters = registerDiscoveredCluster();

    const lists = [
      { cluster: 'ordinary', resourceVersion: '1' },
      { cluster: 'discovered', resourceVersion: '2' },
    ];
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };
    try {
      const { rerender, unmount } = renderHook(
        ({ activeLists }) =>
          useWatchKubeObjectLists({ kubeObjectClass: mockClass, endpoint, lists: activeLists }),
        {
          initialProps: { activeLists: lists },
          wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          ),
        }
      );

      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockSubscribe.mock.calls[0][0]).toBe('ordinary');
      expect(mockUseWebSockets).toHaveBeenLastCalledWith({
        enabled: true,
        connections: [expect.objectContaining({ cluster: 'discovered' })],
      });

      rerender({ activeLists: [lists[0]] });
      expect(mockUseWebSockets).toHaveBeenLastCalledWith({ enabled: false, connections: [] });
      unmount();
    } finally {
      restoreClusters();
    }
  });

  it('keeps pending reads guarded until a replacement registration is observed', async () => {
    const restoreClusters = registerDiscoveredCluster('connection-a');
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('before', '1'))
      .mockRejectedValueOnce(new ApiError('Discovered cluster connection changed', { status: 409 }))
      .mockResolvedValueOnce(podListPage('replacement', '1'));
    const requests = [{ cluster: 'discovered' }];
    const { result, unmount } = renderHook(
      () => useKubeObjectList({ kubeObjectClass: mockClass, requests }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );

    try {
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('before'));
      act(restoreClusters);
      await waitFor(() => expect(result.current.errors?.[0].status).toBe(409));
      expect(mockClusterFetch.mock.calls[1][0]).toContain('__headlamp_connection_revision=removed');
      expect(result.current.items).toEqual([]);

      act(() => {
        registerDiscoveredCluster('connection-b');
      });
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('replacement'));
      expect(mockClusterFetch.mock.calls[2][0]).toContain(
        '__headlamp_connection_revision=connection-b'
      );
    } finally {
      unmount();
      restoreClusters();
    }
  });

  it('keeps late multiplexed messages in the connection that subscribed', () => {
    const client = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };
    const previous = store.getState().config.clusters;
    store.dispatch(
      setConfig({
        clusters: { ...previous, discovered: { name: 'discovered', auth_type: 'oidc' } },
      })
    );
    const lists = [{ cluster: 'discovered', resourceVersion: '1' }];
    const snapshot = {
      list: { items: [], metadata: { resourceVersion: '1' } },
      cluster: 'discovered',
    };
    const oldKey = kubeObjectListQuery(mockClass, endpoint, '', 'discovered', {}).queryKey;
    client.setQueryData(oldKey, snapshot);
    const { unmount } = renderHook(
      () => useWatchKubeObjectLists({ kubeObjectClass: mockClass, endpoint, lists }),
      { wrapper: queryClientWrapper(client) }
    );
    const onMessage = mockSubscribe.mock.calls[0][3];
    let restoreClusters = () => {};
    try {
      act(() => {
        restoreClusters = registerDiscoveredCluster('replacement');
        const replacementKey = kubeObjectListQuery(
          mockClass,
          endpoint,
          '',
          'discovered',
          {}
        ).queryKey;
        client.setQueryData(replacementKey, snapshot);
        onMessage({ type: 'ADDED', object: makePod('late-old-pod', '2') });
        expect(client.getQueryData(replacementKey)).toEqual(snapshot);
        expect(client.getQueryData(oldKey)).not.toEqual(snapshot);
      });
    } finally {
      unmount();
      restoreClusters();
      store.dispatch(setConfig({ clusters: previous }));
    }
  });

  it('keeps a direct watch error and the list until the watch is accepted again', async () => {
    const restoreClusters = registerDiscoveredCluster();
    const snapshot = () => podListPage('pod-1', '1');
    mockClusterFetch.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot());
    const { result, unmount } = renderHook(
      () =>
        useKubeObjectList({ kubeObjectClass: mockClass, requests: [{ cluster: 'discovered' }] }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );
    const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections[0];

    try {
      await waitFor(() => expect(watch()).toBeDefined());
      const connection = watch();
      act(() =>
        connection.onMessage({
          type: 'ERROR',
          object: { kind: 'Status', code: 403, message: 'Forbidden' },
        })
      );
      await waitFor(() => expect(result.current.errors?.[0].status).toBe(403));
      await act(async () => {
        await connection.getWatchUrl(true);
      });
      expect(result.current.errors?.[0].message).toBe('Forbidden');
      expect(result.current.items?.map(item => item.metadata.name)).toEqual(['pod-1']);

      act(() => connection.onOpen());
      await waitFor(() => expect(result.current.errors).toBeNull());
    } finally {
      unmount();
      restoreClusters();
    }
  });

  it('refreshes a configured namespace selector after an accepted direct watch fails', async () => {
    const cluster = 'discovered';
    const labelSelector = 'team=frontend';
    const settingsKey = `cluster_settings.${cluster}`;
    const restoreClusters = registerDiscoveredCluster('namespace-origin');
    localStorage.setItem(settingsKey, JSON.stringify({ allowedNamespacesSelector: labelSelector }));
    focusManager.setFocused(true);
    mockClusterFetch
      .mockResolvedValueOnce(
        Response.json(
          makeListResponse({
            kind: 'NamespaceList',
            items: [{ metadata: { name: 'team-a', resourceVersion: '1' } }],
          })
        )
      )
      .mockResolvedValueOnce(
        Response.json(makeListResponse({ kind: 'NamespaceList', resourceVersion: '2', items: [] }))
      );
    const { result, unmount } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: Namespace,
          requests: [{ cluster }],
          queryParams: { labelSelector },
        }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );
    const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections[0];
    const sendWatchError = () => {
      watch().onOpen();
      watch().onMessage({
        type: 'ERROR',
        object: { kind: 'Status', code: 403, message: 'Forbidden' },
      });
    };

    try {
      await waitFor(() => expect(watch()).toBeDefined());
      expect(result.current.items?.map(item => item.metadata.name)).toEqual(['team-a']);
      vi.useFakeTimers({
        toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      });
      act(sendWatchError);
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      act(sendWatchError);
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      act(sendWatchError);
      await act(async () => vi.advanceTimersByTimeAsync(9_950));
      expect(mockClusterFetch).toHaveBeenCalledTimes(1);

      await act(async () => vi.advanceTimersByTimeAsync(100));
      expect(mockClusterFetch).toHaveBeenCalledTimes(2);
      expect(mockClusterFetch.mock.calls[1]).toEqual([
        'api/v1/namespaces?labelSelector=team%3Dfrontend&__headlamp_connection_revision=namespace-origin',
        expect.objectContaining({ cluster, headers: { 'Cache-Control': 'no-cache' } }),
      ]);
      expect(result.current.items).toEqual([]);
      expect(result.current.error?.status).toBe(403);

      act(() =>
        watch().onMessage({
          type: 'ADDED',
          object: {
            kind: 'Namespace',
            metadata: { name: 'team-b', uid: 'team-b', resourceVersion: '3' },
          },
        })
      );
      await act(async () => vi.advanceTimersByTimeAsync(30_100));
      expect(result.current.error).toBeNull();
      expect(result.current.items?.map(item => item.metadata.name)).toEqual(['team-b']);
      expect(mockClusterFetch).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      vi.useRealTimers();
      focusManager.setFocused(undefined);
      localStorage.removeItem(settingsKey);
      restoreClusters();
    }
  });

  it('preserves a background LIST failure when the watch fails and recovers', async () => {
    const restoreClusters = registerDiscoveredCluster();
    const client = new QueryClient();
    const forbidden = new ApiError('LIST is forbidden', { status: 403 });
    mockClusterFetch.mockResolvedValueOnce(podListPage('pod-1', '1'));
    const requests = [{ cluster: 'discovered' }];
    const wrapper = queryClientWrapper(client);
    const watching = renderHook(() => useKubeObjectList({ kubeObjectClass: mockClass, requests }), {
      wrapper,
    });
    const listing = renderHook(
      () => useKubeObjectList({ kubeObjectClass: mockClass, requests, watch: false }),
      { wrapper }
    );
    const watch = () =>
      mockUseWebSockets.mock.calls.findLast(([options]) => options.connections.length > 0)?.[0]
        .connections[0];

    try {
      await waitFor(() => expect(watch()).toBeDefined());
      const connection = watch();
      mockClusterFetch.mockRejectedValueOnce(forbidden);
      await act(async () => client.invalidateQueries());
      await waitFor(() => expect(listing.result.current.errors?.[0]).toBe(forbidden));

      act(() => connection.onOpenFailure());
      expect(connection.cacheEntry.state.data.watchError?.message).toBe(
        'Unable to open the resource watch'
      );
      expect(connection.cacheEntry.state.status).toBe('error');
      expect(watching.result.current.errors?.[0]).toBe(forbidden);
      expect(listing.result.current.errors?.[0]).toBe(forbidden);

      act(() => {
        connection.onOpen();
        connection.onMessage({ type: 'ADDED', object: makePod('pod-2', '2') });
      });
      expect(connection.cacheEntry.state.data.watchError).toBeUndefined();
      expect(connection.cacheEntry.state.status).toBe('error');
      expect(listing.result.current.errors?.[0]).toBe(forbidden);
    } finally {
      listing.unmount();
      watching.unmount();
      restoreClusters();
    }
  });

  it('starts a recovery LIST after a rejected upgrade while an ordinary refetch is pending', async () => {
    const restoreClusters = registerDiscoveredCluster();
    const client = new QueryClient();
    const oldRefetch = deferred<Response>();
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('pod-old', '1'))
      .mockReturnValueOnce(oldRefetch.promise)
      .mockResolvedValueOnce(podListPage('pod-new', '10'));
    const { result, unmount } = renderHook(
      () =>
        useKubeObjectList({ kubeObjectClass: mockClass, requests: [{ cluster: 'discovered' }] }),
      { wrapper: queryClientWrapper(client) }
    );
    const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections[0];

    try {
      await waitFor(() => expect(watch()).toBeDefined());
      const connection = watch();
      const pending = client.invalidateQueries();
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      expect(mockClusterFetch.mock.calls[1][1].headers).toBeUndefined();

      await act(async () => {
        connection.onOpenFailure();
        await expect(connection.getWatchUrl(true)).resolves.toBe(
          'api/v1/pods?watch=1&resourceVersion=10'
        );
      });
      expect(mockClusterFetch.mock.calls[1][1].signal?.aborted).toBe(true);
      expect(mockClusterFetch.mock.calls[2][1].headers).toEqual({ 'Cache-Control': 'no-cache' });
      await act(async () => {
        oldRefetch.resolve(podListPage('pod-old', '1'));
        await pending;
      });
      expect(connection.cacheEntry.state.data.list.items[0].metadata.name).toBe('pod-new');
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('pod-new'));
    } finally {
      oldRefetch.resolve(podListPage('pod-old', '1'));
      unmount();
      restoreClusters();
    }
  });

  it('waits for the replacement LIST while the query is offline', async () => {
    const restoreClusters = registerDiscoveredCluster();
    const client = new QueryClient();
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('pod-old', '1'))
      .mockResolvedValueOnce(podListPage('pod-new', '10'));
    const { unmount } = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'discovered' }],
        }),
      { wrapper: queryClientWrapper(client) }
    );
    const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections[0];

    try {
      await waitFor(() => expect(watch()).toBeDefined());
      const connection = watch();
      onlineManager.setOnline(false);
      act(() => connection.onMessage({ type: 'ERROR', object: { code: 410 } }));
      const reopened = vi.fn();
      const reconnecting = connection.getWatchUrl(true).then(reopened);
      await waitFor(() =>
        expect(
          client
            .getQueryCache()
            .getAll()
            .some(query => query.state.fetchStatus === 'paused')
        ).toBe(true)
      );
      expect(reopened).not.toHaveBeenCalled();
      expect(mockClusterFetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        onlineManager.setOnline(true);
        await reconnecting;
      });
      expect(reopened).toHaveBeenCalledWith('api/v1/pods?watch=1&resourceVersion=10');
      expect(mockClusterFetch.mock.calls[1][1].headers).toEqual({ 'Cache-Control': 'no-cache' });
    } finally {
      onlineManager.setOnline(true);
      unmount();
      restoreClusters();
    }
  });

  it('does not reopen from a stale version when the expiration relist fails', async () => {
    const restoreClusters = registerDiscoveredCluster();
    const unavailable = new ApiError('Unavailable', { status: 503 });
    mockClusterFetch
      .mockResolvedValueOnce(podListPage('pod-old', '1'))
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(podListPage('pod-new', '10'));
    const { result, unmount } = renderHook(
      () =>
        useKubeObjectList({ kubeObjectClass: mockClass, requests: [{ cluster: 'discovered' }] }),
      { wrapper: queryClientWrapper(new QueryClient()) }
    );
    const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections[0];

    try {
      await waitFor(() => expect(watch()).toBeDefined());
      const connection = watch();
      act(() => connection.onMessage({ type: 'ERROR', object: { code: 410 } }));
      await expect(connection.getWatchUrl(true)).rejects.toBe(unavailable);
      await expect(connection.getWatchUrl(true)).resolves.toBe(
        'api/v1/pods?watch=1&resourceVersion=10'
      );
      await waitFor(() => expect(result.current.items?.[0].metadata.name).toBe('pod-new'));
      expect(watch()).toBe(connection);
      for (const [, options] of mockClusterFetch.mock.calls.slice(1)) {
        expect(options.headers).toEqual({ 'Cache-Control': 'no-cache' });
      }
    } finally {
      unmount();
      restoreClusters();
    }
  });

  it.each([{ resourceVersionMatch: 'Exact' }, { limit: 1 }])(
    'reports expiration of a list explicitly pinned to a resource version (%o)',
    async match => {
      const restoreClusters = registerDiscoveredCluster();
      mockClusterFetch.mockResolvedValueOnce(podListPage('pod-1', '1'));
      const { result, unmount } = renderHook(
        () =>
          useKubeObjectList({
            kubeObjectClass: mockClass,
            requests: [{ cluster: 'discovered' }],
            queryParams: { resourceVersion: '1', ...match },
          }),
        { wrapper: queryClientWrapper(new QueryClient()) }
      );
      const watch = () => mockUseWebSockets.mock.lastCall?.[0].connections[0];

      try {
        await waitFor(() => expect(watch()).toBeDefined());
        const connection = watch();
        expect(connection.url).toBe('api/v1/pods?resourceVersion=1&watch=1');
        act(() => connection.onMessage({ type: 'ADDED', object: makePod('pod-2', '2') }));
        await expect(connection.getWatchUrl(true)).resolves.toBe(
          'api/v1/pods?resourceVersion=2&watch=1'
        );
        expect(mockClusterFetch).toHaveBeenCalledTimes(1);
        act(() => connection.onMessage({ type: 'ERROR', object: { code: 410 } }));
        await expect(connection.getWatchUrl(true)).resolves.toBeNull();
        await waitFor(() => expect(result.current.errors?.[0].status).toBe(410));
        expect(result.current.items?.[0].metadata.name).toBe('pod-1');
        expect(mockClusterFetch).toHaveBeenCalledTimes(1);
      } finally {
        unmount();
        restoreClusters();
      }
    }
  );

  it('should subscribe to multiple clusters', () => {
    const lists = [
      { cluster: 'cluster-a', namespace: 'namespace-a', resourceVersion: '1' },
      { cluster: 'cluster-b', namespace: 'namespace-b', resourceVersion: '2' },
    ];

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint: { version: 'v1', resource: 'pods' },
          lists,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
      }
    );

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenNthCalledWith(
      1,
      'cluster-a',
      expect.stringContaining('/api/v1/namespaces/namespace-a/pods'),
      'watch=1&resourceVersion=1',
      expect.any(Function),
      expect.any(Function)
    );
    expect(mockSubscribe).toHaveBeenNthCalledWith(
      2,
      'cluster-b',
      expect.stringContaining('/api/v1/namespaces/namespace-b/pods'),
      'watch=1&resourceVersion=2',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('should handle non-namespaced resources', () => {
    const lists = [{ cluster: 'cluster-a', resourceVersion: '1' }];

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint: { version: 'v1', resource: 'pods' },
          lists,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
      }
    );

    expect(mockSubscribe).toHaveBeenCalledWith(
      'cluster-a',
      expect.stringContaining('/api/v1/pods'),
      'watch=1&resourceVersion=1',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('should not call legacy useWebSockets with connections when multiplexer is enabled', () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'cluster-a', namespace: 'namespace-a', resourceVersion: '1' }],
          endpoint: { version: 'v1', resource: 'pods' },
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
      }
    );

    expect(spy).toHaveBeenCalledWith({ enabled: false, connections: [] });
  });

  it('should relist when the watch resource version expires', () => {
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };
    const queryKey = kubeObjectListQuery(mockClass, endpoint, 'a', 'default', {}).queryKey;
    queryClient.setQueryData(queryKey, {
      list: { items: [], metadata: { resourceVersion: '1' } },
      cluster: 'default',
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint,
          lists: [{ cluster: 'default', namespace: 'a', resourceVersion: '1' }],
        }),
      { wrapper: queryClientWrapper(queryClient) }
    );

    const onMessage = mockSubscribe.mock.calls[0][3];
    onMessage({
      type: 'ERROR',
      object: { kind: 'Status', metadata: {}, reason: 'Expired', code: 410 },
    });

    // The watch cannot report what changed since, such as deletions, so the list is fetched again.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey, exact: true });
  });

  it('should omit pagination query params after loading all pages', async () => {
    const queryClient = new QueryClient();
    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '1')],
              resourceVersion: '1',
              continueToken: 'token-1',
            })
          ),
      } as Response)
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-2', '2')],
              resourceVersion: '2',
            })
          ),
      } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default' }],
          queryParams: { limit: DEFAULT_LIST_LIMIT },
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => expect(result.result.current.loadMore).toEqual(expect.any(Function)));

    await act(async () => {
      await result.result.current.loadMore?.();
    });

    await waitFor(() =>
      expect(
        mockSubscribe.mock.calls.some(
          ([cluster, pathname, query]) =>
            cluster === 'default' &&
            pathname === '/api/v1/pods' &&
            query === 'watch=1&resourceVersion=2'
        )
      ).toBe(true)
    );
  });
});
