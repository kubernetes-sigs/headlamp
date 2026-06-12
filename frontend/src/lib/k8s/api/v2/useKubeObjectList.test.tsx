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
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './ApiError';
import { clusterFetch } from './fetch';
import {
  DEFAULT_LIST_LIMIT,
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
