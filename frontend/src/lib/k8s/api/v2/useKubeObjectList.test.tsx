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
  getResourceIdentity,
  getWatchQueryParamsKey,
  isResourceVersionExpiredError,
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
const mockSubscribeCleanup = vi.fn();
const mockSubscribe = vi.fn().mockImplementation(() => Promise.resolve(mockSubscribeCleanup));
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
    return this.jsonData?.metadata;
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

  get metadata() {
    return this.jsonData?.metadata;
  }
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

describe('getWatchQueryParamsKey', () => {
  it('returns empty string when query parameters are undefined or empty', () => {
    expect(getWatchQueryParamsKey(undefined)).toBe('');
    expect(getWatchQueryParamsKey({})).toBe('');
  });

  it('sorts query parameter keys alphabetically for order-independent identity', () => {
    const key1 = getWatchQueryParamsKey({
      labelSelector: 'app=frontend',
      fieldSelector: 'status.phase=Running',
    });
    const key2 = getWatchQueryParamsKey({
      fieldSelector: 'status.phase=Running',
      labelSelector: 'app=frontend',
    });

    expect(key1).toBe('fieldSelector=status.phase%3DRunning&labelSelector=app%3Dfrontend');
    expect(key1).toBe(key2);
  });

  it('excludes pagination and watch transport parameters from cursor identity', () => {
    const key = getWatchQueryParamsKey({
      labelSelector: 'app=frontend',
      limit: 100,
      continue: 'token-123',
      watch: '1',
      resourceVersion: '500',
    });

    expect(key).toBe('labelSelector=app%3Dfrontend');
  });

  it('excludes undefined and empty string values', () => {
    const key = getWatchQueryParamsKey({
      labelSelector: 'app=frontend',
      fieldSelector: undefined,
      dryRun: '',
    });

    expect(key).toBe('labelSelector=app%3Dfrontend');
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

  it('reconnects using the starting resourceVersion when idle watch disconnects without watch events', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'a' }],
          endpoint: { version: 'v1', resource: 'pods' },
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];
    connection.onClose?.();

    expect(onReconnect).toHaveBeenCalledWith('default', 'a', '100');
  });

  it('reconnects using the latest watch event resourceVersion after updates arrive', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'a' }],
          endpoint: { version: 'v1', resource: 'pods' },
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];
    connection.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-1', namespace: 'a', resourceVersion: '105' } },
    });

    connection.onClose?.();

    expect(onReconnect).toHaveBeenCalledWith('default', 'a', '105');
  });

  it('maintains separate cursors across multiple namespaces', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [
            { cluster: 'default', resourceVersion: '100', namespace: 'ns-a' },
            { cluster: 'default', resourceVersion: '200', namespace: 'ns-b' },
          ],
          endpoint: { version: 'v1', resource: 'pods' },
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connectionA = useWebSocketSpy.mock.calls[0][0].connections[0];
    const connectionB = useWebSocketSpy.mock.calls[0][0].connections[1];

    connectionA.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-a', namespace: 'ns-a', resourceVersion: '108' } },
    });

    connectionA.onClose?.();
    expect(onReconnect).toHaveBeenCalledWith('default', 'ns-a', '108');

    connectionB.onClose?.();
    expect(onReconnect).toHaveBeenCalledWith('default', 'ns-b', '200');
  });

  it('isolates cursors when watch query parameters change on the same cluster and namespace', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();

    const { rerender } = renderHook(
      ({ watchQueryParams, lists }) =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists,
          endpoint: { version: 'v1', resource: 'pods' },
          watchQueryParams,
          onReconnect,
        }),
      {
        initialProps: {
          watchQueryParams: { labelSelector: 'app=frontend' },
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'a' }],
        },
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection1 = useWebSocketSpy.mock.calls.at(-1)?.[0].connections[0];
    expect(connection1?.url).toContain('labelSelector=app%3Dfrontend');
    expect(connection1?.url).toContain('resourceVersion=100');

    // Frontend watch receives event advancing its cursor to 150
    connection1?.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-1', namespace: 'a', resourceVersion: '150' } },
    });

    // Re-render with backend selector and list resourceVersion 200
    rerender({
      watchQueryParams: { labelSelector: 'app=backend' },
      lists: [{ cluster: 'default', resourceVersion: '200', namespace: 'a' }],
    });

    const connection2 = useWebSocketSpy.mock.calls.at(-1)?.[0].connections[0];
    expect(connection2?.url).toContain('labelSelector=app%3Dbackend');
    // Backend watch must use 200, never 150
    expect(connection2?.url).toContain('resourceVersion=200');
    expect(connection2?.url).not.toContain('resourceVersion=150');

    // When connection2 closes, onReconnect must carry the backend watchQueryKey
    connection2?.onClose?.();
    expect(onReconnect).toHaveBeenCalledWith('default', 'a', '200', 'labelSelector=app%3Dbackend');
  });

  it('falls back to cached React Query metadata.resourceVersion when idle watch disconnects and resourceVersion was missing', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    const cacheKey = kubeObjectListQuery(mockClass, endpoint, 'ns-cached', 'default', {}).queryKey;
    queryClient.setQueryData(cacheKey, {
      list: {
        metadata: { resourceVersion: '350' },
        items: [],
      },
    });

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '', namespace: 'ns-cached' }],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];
    connection.onClose?.();

    expect(onReconnect).toHaveBeenCalledWith('default', 'ns-cached', '350');
  });

  it('reconnects using the refetched cache resourceVersion when idle watch disconnects after watch events', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    const cacheKey = kubeObjectListQuery(mockClass, endpoint, 'a', 'default', {}).queryKey;
    queryClient.setQueryData(cacheKey, {
      list: {
        metadata: { resourceVersion: '100' },
        items: [],
      },
    });

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'a' }],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];

    // Watch receives event with resourceVersion 105
    connection.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-1', namespace: 'a', resourceVersion: '105' } },
    });

    // REST refetch updates cache to 200
    queryClient.setQueryData(cacheKey, {
      list: {
        metadata: { resourceVersion: '200' },
        items: [],
      },
    });

    // Watch disconnects (idle disconnect)
    connection.onClose?.();

    // Reconnect must use 200, NOT 105
    expect(onReconnect).toHaveBeenCalledWith('default', 'a', '200');
  });

  it('reconnects using newer watch event resourceVersion arriving after a refetch', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    const cacheKey = kubeObjectListQuery(mockClass, endpoint, 'a', 'default', {}).queryKey;
    queryClient.setQueryData(cacheKey, {
      list: {
        metadata: { resourceVersion: '100' },
        items: [],
      },
    });

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'a' }],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];

    // Watch receives event with resourceVersion 105
    connection.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-1', namespace: 'a', resourceVersion: '105' } },
    });

    // REST refetch updates cache to 200
    queryClient.setQueryData(cacheKey, {
      list: {
        metadata: { resourceVersion: '200' },
        items: [],
      },
    });

    // Watch receives newer event 205 after refetch
    connection.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-1', namespace: 'a', resourceVersion: '205' } },
    });

    // Watch disconnects
    connection.onClose?.();

    // Reconnect must use 205 (not 200)
    expect(onReconnect).toHaveBeenCalledWith('default', 'a', '205');
  });

  it('maintains independent cursors across multiple namespaces during refetches and events', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    const cacheKeyA = kubeObjectListQuery(mockClass, endpoint, 'ns-a', 'default', {}).queryKey;
    const cacheKeyB = kubeObjectListQuery(mockClass, endpoint, 'ns-b', 'default', {}).queryKey;

    queryClient.setQueryData(cacheKeyA, {
      list: { metadata: { resourceVersion: '100' }, items: [] },
    });
    queryClient.setQueryData(cacheKeyB, {
      list: { metadata: { resourceVersion: '200' }, items: [] },
    });

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [
            { cluster: 'default', resourceVersion: '100', namespace: 'ns-a' },
            { cluster: 'default', resourceVersion: '200', namespace: 'ns-b' },
          ],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connectionA = useWebSocketSpy.mock.calls[0][0].connections[0];
    const connectionB = useWebSocketSpy.mock.calls[0][0].connections[1];

    // ns-a receives watch event 105
    connectionA.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-a', namespace: 'ns-a', resourceVersion: '105' } },
    });

    // ns-a refetches to 300
    queryClient.setQueryData(cacheKeyA, {
      list: { metadata: { resourceVersion: '300' }, items: [] },
    });

    // ns-b receives watch event 210 without refetch
    connectionB.onMessage({
      type: 'MODIFIED',
      object: { metadata: { name: 'pod-b', namespace: 'ns-b', resourceVersion: '210' } },
    });

    connectionA.onClose?.();
    expect(onReconnect).toHaveBeenCalledWith('default', 'ns-a', '300');

    connectionB.onClose?.();
    expect(onReconnect).toHaveBeenCalledWith('default', 'ns-b', '210');
  });

  it('passes canonical watch query key (including empty string) when query params are provided', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'default' }],
          endpoint,
          watchQueryParams: {},
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];
    connection.onClose?.();
    expect(onReconnect).toHaveBeenCalledWith('default', 'default', '100', '');
  });

  it('handles missing resourceVersion gracefully without crashing or reconnecting with invalid string', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '', namespace: 'ns-empty' }],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];
    connection.onClose?.();

    expect(onReconnect).toHaveBeenCalledWith('default', 'ns-empty', '');
  });

  it('relists and clears cursor when watch receives an expired 410 ERROR', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    const cacheKey = kubeObjectListQuery(
      mockClass,
      endpoint as any,
      'default',
      'default',
      {}
    ).queryKey;
    queryClient.setQueryData(cacheKey, {
      list: { metadata: { resourceVersion: '100' }, items: [] },
    });

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'default' }],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];

    // Simulate expired watch error (HTTP 410)
    connection.onMessage({
      type: 'ERROR',
      object: {
        kind: 'Status',
        status: 'Failure',
        message: 'too old resource version: 100 (200)',
        code: 410,
        reason: 'Expired',
      },
    });

    // Cache must be invalidated and onReconnect called with empty resourceVersion to trigger relist
    expect(onReconnect).toHaveBeenCalledWith('default', 'default', '');
  });

  it('relists when watch connection fails with handshake failure code 1002', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'default' }],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];

    // Simulate persistent handshake failure closing with code 1002
    connection.onClose?.(
      new CloseEvent('close', { code: 1002, reason: 'Handshake failed repeatedly' })
    );

    // onReconnect must be called with empty resourceVersion to relist
    expect(onReconnect).toHaveBeenCalledWith('default', 'default', '');
  });

  it('does not clear cursor or relist on non-410 errors (e.g. 503)', () => {
    const useWebSocketSpy = vi.spyOn(websocket, 'useWebSockets');
    const onReconnect = vi.fn();
    const queryClient = new QueryClient();
    const endpoint = { version: 'v1', resource: 'pods' };

    const cacheKey = kubeObjectListQuery(
      mockClass,
      endpoint as any,
      'default',
      'default',
      {}
    ).queryKey;
    queryClient.setQueryData(cacheKey, {
      list: { metadata: { resourceVersion: '100' }, items: [] },
    });

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          lists: [{ cluster: 'default', resourceVersion: '100', namespace: 'default' }],
          endpoint,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    const connection = useWebSocketSpy.mock.calls[0][0].connections[0];

    // Simulate transient server error (HTTP 503)
    connection.onMessage({
      type: 'ERROR',
      object: {
        kind: 'Status',
        status: 'Failure',
        message: 'Service Unavailable',
        code: 503,
        reason: 'ServiceUnavailable',
      },
    });

    // Should NOT call onReconnect to reset cursor
    expect(onReconnect).not.toHaveBeenCalled();
    // Cache should NOT be invalidated or cleared
    expect(queryClient.getQueryData(cacheKey)).toBeDefined();
  });
});

describe('isResourceVersionExpiredError', () => {
  it('identifies Kubernetes 410 Gone / Expired status errors', () => {
    expect(
      isResourceVersionExpiredError({
        type: 'ERROR',
        object: { code: 410, reason: 'Expired', message: 'too old resource version: 100 (200)' },
      })
    ).toBe(true);
    expect(
      isResourceVersionExpiredError({
        type: 'ERROR',
        object: { code: 410, reason: 'Gone' },
      })
    ).toBe(true);
    expect(
      isResourceVersionExpiredError({
        type: 'ERROR',
        object: { message: 'too old resource version' },
      })
    ).toBe(true);
    expect(
      isResourceVersionExpiredError({
        type: 'ERROR',
        object: { message: 'resource version has expired' },
      })
    ).toBe(true);
  });

  it('returns false for non-410 errors and normal events', () => {
    expect(
      isResourceVersionExpiredError({
        type: 'ERROR',
        object: { code: 503, reason: 'ServiceUnavailable', message: 'backend unavailable' },
      })
    ).toBe(false);
    expect(
      isResourceVersionExpiredError({
        type: 'ERROR',
        object: { code: 500, reason: 'InternalServerError' },
      })
    ).toBe(false);
    expect(
      isResourceVersionExpiredError({
        type: 'ERROR',
        object: { code: 403, reason: 'Forbidden' },
      })
    ).toBe(false);
    expect(
      isResourceVersionExpiredError({
        type: 'ADDED',
        object: { metadata: { resourceVersion: '100' } },
      })
    ).toBe(false);
    expect(isResourceVersionExpiredError(null)).toBe(false);
    expect(isResourceVersionExpiredError(undefined)).toBe(false);
    expect(isResourceVersionExpiredError('not an object')).toBe(false);
  });
});

describe('getResourceIdentity', () => {
  it('formats endpoint identifiers correctly without leading slash for core group', () => {
    expect(getResourceIdentity({ group: '', version: 'v1', resource: 'pods' } as any)).toBe(
      'v1/pods'
    );
    expect(
      getResourceIdentity({ group: 'apps', version: 'v1', resource: 'deployments' } as any)
    ).toBe('apps/v1/deployments');
  });

  it('formats kubeObjectClass identifiers matching endpoint format', () => {
    expect(getResourceIdentity(undefined, { apiVersion: 'v1', apiName: 'pods' } as any)).toBe(
      'v1/pods'
    );
    expect(
      getResourceIdentity(undefined, { apiVersion: 'apps/v1', apiName: 'deployments' } as any)
    ).toBe('apps/v1/deployments');
  });

  it('matches between endpoint and kubeObjectClass for both core and named groups', () => {
    const coreEndpoint = { group: '', version: 'v1', resource: 'pods' };
    const coreClass = { apiVersion: 'v1', apiName: 'pods' };
    expect(getResourceIdentity(coreEndpoint as any)).toBe(
      getResourceIdentity(undefined, coreClass as any)
    );

    const appsEndpoint = { group: 'apps', version: 'v1', resource: 'deployments' };
    const appsClass = { apiVersion: 'apps/v1', apiName: 'deployments' };
    expect(getResourceIdentity(appsEndpoint as any)).toBe(
      getResourceIdentity(undefined, appsClass as any)
    );
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

  it('does not recreate WebSocket connections when incoming watch events update resourceVersion', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(initialConnection?.url).toContain('resourceVersion=100');

    // Deliver incoming watch event that updates resourceVersion to 101
    act(() => {
      initialConnection?.onMessage({
        type: 'MODIFIED',
        object: makePod('pod-1', '101'),
      });
    });

    // The cache and rendered items reflect the updated pod and resourceVersion
    await waitFor(() => {
      expect(result.result.current.items?.[0]?.jsonData?.metadata?.resourceVersion).toBe('101');
    });

    // But useWebSockets was not called with a new connection URL containing resourceVersion=101
    const latestCall = spy.mock.calls.at(-1)?.[0];
    expect(latestCall?.connections[0]?.url).toContain('resourceVersion=100');
    expect(latestCall?.connections[0]?.url).not.toContain('resourceVersion=101');
  });

  it('preserves the latest resourceVersion from cache when establishing a new watch on remount', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    const hook1 = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const activeConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(activeConnection?.url).toContain('resourceVersion=100');

    // Receive watch event updating resourceVersion to 105
    act(() => {
      activeConnection?.onMessage({
        type: 'MODIFIED',
        object: makePod('pod-1', '105'),
      });
    });

    await waitFor(() => {
      expect(hook1.result.current.items?.[0]?.jsonData?.metadata?.resourceVersion).toBe('105');
    });

    // Unmount the first hook
    hook1.unmount();

    // Now remount useKubeObjectList with the same QueryClient (simulating view remount / return)
    spy.mockClear();
    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    // The new watch connection must start with resourceVersion=105, not the stale 100
    const remountConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(remountConnection?.url).toContain('resourceVersion=105');
  });

  it('reconnects using the latest resourceVersion when an active WebSocket disconnects', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(initialConnection?.url).toContain('resourceVersion=100');

    // Deliver incoming watch event that updates resourceVersion to 105
    act(() => {
      initialConnection?.onMessage({
        type: 'MODIFIED',
        object: makePod('pod-1', '105'),
      });
    });

    await waitFor(() => {
      expect(result.result.current.items?.[0]?.jsonData?.metadata?.resourceVersion).toBe('105');
    });

    // Simulate unexpected WebSocket disconnect via onClose callback
    act(() => {
      initialConnection?.onClose?.();
    });

    // Reconnection MUST use the updated resourceVersion 105 from the cache
    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      expect(latestCall?.connections[0]?.url).toContain('resourceVersion=105');
    });
  });

  it('reconnects when an idle watch disconnects even if resourceVersion is unchanged', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const callsBeforeDisconnect = spy.mock.calls.length;
    const initialConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(initialConnection?.url).toContain('resourceVersion=100');

    // Simulate unexpected WebSocket disconnect on an IDLE watch (no events arrived, RV unchanged at 100)
    act(() => {
      initialConnection?.onClose?.();
    });

    // An idle disconnect MUST still trigger reconnection and re-invoke useWebSockets
    await waitFor(() => {
      expect(spy.mock.calls.length).toBeGreaterThan(callsBeforeDisconnect);
      const latestCall = spy.mock.calls.at(-1)?.[0];
      expect(latestCall?.connections[0]?.url).toContain('resourceVersion=100');
    });
  });

  it('reconnects with newest resourceVersion when disconnect occurs immediately after a watch event', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConnection = spy.mock.calls.at(-1)?.[0].connections[0];

    // Watch event updates RV to 110 and close event fires immediately in the same tick
    act(() => {
      initialConnection?.onMessage({
        type: 'MODIFIED',
        object: makePod('pod-1', '110'),
      });
      initialConnection?.onClose?.();
    });

    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      expect(latestCall?.connections[0]?.url).toContain('resourceVersion=110');
    });
  });

  it('reconnects with refetched resourceVersion when refetch occurred after watch events', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(initialConnection?.url).toContain('resourceVersion=100');

    // Deliver watch event 105
    act(() => {
      initialConnection?.onMessage({
        type: 'MODIFIED',
        object: makePod('pod-1', '105'),
      });
    });

    await waitFor(() => {
      expect(result.result.current.items?.[0]?.jsonData?.metadata?.resourceVersion).toBe('105');
    });

    // Mock next fetch returning resourceVersion 200
    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '200')],
            resourceVersion: '200',
          })
        ),
    } as Response);

    // Refetch the list query
    await act(async () => {
      await queryClient.refetchQueries();
    });

    await waitFor(() => {
      expect(result.result.current.items?.[0]?.jsonData?.metadata?.resourceVersion).toBe('200');
    });

    // Watch disconnects (idle disconnect)
    act(() => {
      const activeCall = spy.mock.calls.at(-1)?.[0];
      activeCall?.connections[0]?.onClose?.();
    });

    // Reconnection must use 200, NOT 105
    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      expect(latestCall?.connections[0]?.url).toContain('resourceVersion=200');
    });
  });

  it('invalidates watch state and does not reuse cursors when resource identity changes on mounted hook', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    // Cache for pods in default namespace
    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'default', {}], {
      list: { items: [makePod('pod-1', '100')], metadata: { resourceVersion: '100' } },
      cluster: 'default',
    });
    // Cache for nodes
    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'nodes', 'default', '', {}], {
      list: { items: [], metadata: { resourceVersion: '200' } },
      cluster: 'default',
    });

    const result = renderHook(
      (props: {
        kubeObjectClass: any;
        requests: Array<{ cluster: string; namespaces?: string[] }>;
      }) =>
        useKubeObjectList({
          kubeObjectClass: props.kubeObjectClass,
          requests: props.requests,
        }),
      {
        wrapper: queryClientWrapper(queryClient),
        initialProps: {
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }] as Array<{
            cluster: string;
            namespaces?: string[];
          }>,
        },
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const podConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(podConnection?.url).toContain('/pods');
    expect(podConnection?.url).toContain('resourceVersion=100');

    // Switch resource class to nodes on the mounted hook with same cluster
    result.rerender({
      kubeObjectClass: mockNodeClass,
      requests: [{ cluster: 'default' }],
    });

    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      const nodeConnection = latestCall?.connections[0];
      expect(nodeConnection?.url).toContain('/nodes');
      // Must use nodes resourceVersion 200, NOT inherit pods resourceVersion 100
      expect(nodeConnection?.url).toContain('resourceVersion=200');
    });
  });

  it('isolates watch cursors across query parameter changes and ignores delayed callbacks from old subscriptions', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    // 1. Seed initial list data for app=frontend (RV 100)
    queryClient.setQueryData(
      ['kubeObject', 'list', 'v1', 'pods', 'default', 'default', { labelSelector: 'app=frontend' }],
      {
        list: { items: [makePod('pod-front', '100')], metadata: { resourceVersion: '100' } },
        cluster: 'default',
        namespace: 'default',
      }
    );

    const result = renderHook(
      ({ queryParams }: { queryParams: any }) =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
          queryParams,
        }),
      {
        initialProps: { queryParams: { labelSelector: 'app=frontend' } },
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const frontendConn = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(frontendConn?.url).toContain('labelSelector=app%3Dfrontend');
    expect(frontendConn?.url).toContain('resourceVersion=100');

    // 2. Deliver watch event advancing frontend cursor to 150
    act(() => {
      frontendConn?.onMessage({
        type: 'MODIFIED',
        object: {
          metadata: {
            name: 'pod-front',
            namespace: 'default',
            resourceVersion: '150',
            uid: 'pod-front',
          },
        },
      });
    });

    // 3. Seed list data for app=backend (RV 200)
    queryClient.setQueryData(
      ['kubeObject', 'list', 'v1', 'pods', 'default', 'default', { labelSelector: 'app=backend' }],
      {
        list: { items: [makePod('pod-back', '200')], metadata: { resourceVersion: '200' } },
        cluster: 'default',
        namespace: 'default',
      }
    );

    // 4. Change query parameters to app=backend
    result.rerender({ queryParams: { labelSelector: 'app=backend' } });

    // 5. Backend watch starts at 200, never 150
    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      const backendConn = latestCall?.connections[0];
      expect(backendConn?.url).toContain('labelSelector=app%3Dbackend');
      expect(backendConn?.url).toContain('resourceVersion=200');
      expect(backendConn?.url).not.toContain('resourceVersion=150');
    });

    // 6. Simulate delayed close/reconnect callback from the old frontend connection
    act(() => {
      frontendConn?.onClose?.();
    });

    // 7. Verify backend watch remains healthy and active at RV 200, never overwritten by 150
    await waitFor(() => {
      const activeCall = spy.mock.calls.at(-1)?.[0];
      const activeBackendConn = activeCall?.connections[0];
      expect(activeBackendConn?.url).toContain('labelSelector=app%3Dbackend');
      expect(activeBackendConn?.url).toContain('resourceVersion=200');
      expect(activeBackendConn?.url).not.toContain('resourceVersion=150');
    });
  });

  it('isolates watch cursors when transitioning from unparameterized query to parameterized query and ignores delayed unparameterized close', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    // 1. Seed initial unparameterized list data (RV 100)
    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'default', {}], {
      list: { items: [makePod('pod-unparam', '100')], metadata: { resourceVersion: '100' } },
      cluster: 'default',
      namespace: 'default',
    });

    const result = renderHook(
      ({ queryParams }: { queryParams?: Record<string, any> }) =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
          queryParams,
        }),
      {
        initialProps: { queryParams: undefined as Record<string, any> | undefined },
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const unparamConn = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(unparamConn?.url).toContain('resourceVersion=100');
    expect(unparamConn?.url).not.toContain('labelSelector');

    // 2. Deliver watch event advancing unparameterized cursor to 150
    act(() => {
      unparamConn?.onMessage({
        type: 'MODIFIED',
        object: {
          metadata: {
            name: 'pod-unparam',
            namespace: 'default',
            resourceVersion: '150',
            uid: 'pod-unparam',
          },
        },
      });
    });

    // 3. Seed list data for app=backend (RV 200)
    queryClient.setQueryData(
      ['kubeObject', 'list', 'v1', 'pods', 'default', 'default', { labelSelector: 'app=backend' }],
      {
        list: { items: [makePod('pod-back', '200')], metadata: { resourceVersion: '200' } },
        cluster: 'default',
        namespace: 'default',
      }
    );

    // 4. Change query parameters to app=backend
    result.rerender({ queryParams: { labelSelector: 'app=backend' } });

    // 5. Backend watch starts at 200, never 150
    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      const backendConn = latestCall?.connections[0];
      expect(backendConn?.url).toContain('labelSelector=app%3Dbackend');
      expect(backendConn?.url).toContain('resourceVersion=200');
      expect(backendConn?.url).not.toContain('resourceVersion=150');
    });

    // 6. Simulate delayed close/reconnect callback from the old unparameterized connection
    act(() => {
      unparamConn?.onClose?.();
    });

    // 7. Verify backend watch remains healthy and active at RV 200, never overwritten by 150
    await waitFor(() => {
      const activeCall = spy.mock.calls.at(-1)?.[0];
      const activeBackendConn = activeCall?.connections[0];
      expect(activeBackendConn?.url).toContain('labelSelector=app%3Dbackend');
      expect(activeBackendConn?.url).toContain('resourceVersion=200');
      expect(activeBackendConn?.url).not.toContain('resourceVersion=150');
    });
  });

  it('preserves existing watch subscription for equivalent query parameters with different property ordering', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    queryClient.setQueryData(
      [
        'kubeObject',
        'list',
        'v1',
        'pods',
        'default',
        'default',
        { labelSelector: 'app=web', fieldSelector: 'status.phase=Running' },
      ],
      {
        list: { items: [makePod('pod-web', '100')], metadata: { resourceVersion: '100' } },
        cluster: 'default',
        namespace: 'default',
      }
    );

    const result = renderHook(
      ({ queryParams }: { queryParams: any }) =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
          queryParams,
        }),
      {
        initialProps: {
          queryParams: { labelSelector: 'app=web', fieldSelector: 'status.phase=Running' },
        },
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConn = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(initialConn?.url).toContain('labelSelector=app%3Dweb');
    expect(initialConn?.url).toContain('fieldSelector=status.phase%3DRunning');

    // Re-render with inverted property ordering in queryParams object
    result.rerender({
      queryParams: { fieldSelector: 'status.phase=Running', labelSelector: 'app=web' },
    });

    // Wait a tick to ensure no connection recreation occurred
    await new Promise(resolve => setTimeout(resolve, 50));

    const latestCall = spy.mock.calls.at(-1)?.[0];
    const latestConn = latestCall?.connections[0];
    expect(latestConn?.url).toContain('labelSelector=app%3Dweb');
    expect(latestConn?.url).toContain('fieldSelector=status.phase%3DRunning');
    // Ensure the connection URL and reference remain stable
    expect(latestConn?.url).toBe(initialConn?.url);
  });

  it('refreshes cursors for all namespaces when one namespace disconnects and connections restart', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'ns-a', {}], {
      list: { items: [makePod('pod-a', '100')], metadata: { resourceVersion: '100' } },
      cluster: 'default',
      namespace: 'ns-a',
    });
    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'ns-b', {}], {
      list: { items: [makePod('pod-b', '200')], metadata: { resourceVersion: '200' } },
      cluster: 'default',
      namespace: 'ns-b',
    });

    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['ns-a', 'ns-b'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length === 2);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConnections = spy.mock.calls.at(-1)?.[0].connections;
    const connA = initialConnections?.find((c: any) => c.url.includes('ns-a'));
    const connB = initialConnections?.find((c: any) => c.url.includes('ns-b'));
    expect(connA?.url).toContain('resourceVersion=100');
    expect(connB?.url).toContain('resourceVersion=200');

    // ns-b receives a watch event advancing its cursor to 250
    act(() => {
      connB?.onMessage({
        type: 'MODIFIED',
        object: {
          metadata: { name: 'pod-b', namespace: 'ns-b', resourceVersion: '250', uid: 'pod-b' },
        },
      });
    });

    // Now ns-a disconnects
    act(() => {
      connA?.onClose?.();
    });

    // When connections restart, ns-b MUST reconnect with its advanced cursor 250, not initial 200
    await waitFor(() => {
      const latestConnections = spy.mock.calls.at(-1)?.[0].connections;
      const restartedB = latestConnections?.find((c: any) => c.url.includes('ns-b'));
      expect(restartedB?.url).toContain('resourceVersion=250');
    });
  });

  it('suspends watch during in-flight HTTP relist after 410 error and resumes with refreshed resourceVersion', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();
    const relistDeferred = deferred<Response>();

    mockClusterFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '100')],
              resourceVersion: '100',
            })
          ),
      } as Response)
      .mockReturnValueOnce(relistDeferred.promise);

    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConnection = spy.mock.calls.at(-1)?.[0].connections[0];
    expect(initialConnection?.url).toContain('resourceVersion=100');

    // Deliver 410 Gone error
    act(() => {
      initialConnection?.onMessage({
        type: 'ERROR',
        object: {
          kind: 'Status',
          apiVersion: 'v1',
          status: 'Failure',
          message: 'too old resource version: 100 (150)',
          reason: 'Expired',
          code: 410,
        },
      });
    });

    // While HTTP relist is in flight, watch must be suspended (connections empty)
    // and must NOT attempt to reconnect with the stale resourceVersion=100
    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      expect(latestCall?.connections.length).toBe(0);
    });

    // Resolve the HTTP relist with fresh resourceVersion 200
    await act(async () => {
      relistDeferred.resolve({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-1', '200')],
              resourceVersion: '200',
            })
          ),
      } as Response);
    });

    // Watch resumes with refreshed resourceVersion 200
    await waitFor(() => {
      const latestCall = spy.mock.calls.at(-1)?.[0];
      expect(latestCall?.connections[0]?.url).toContain('resourceVersion=200');
    });
  });

  it('does not reset sibling namespace cursor when one namespace undergoes 410 relist', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    const relistDeferred = deferred<Response>();

    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'ns-a', {}], {
      list: { items: [makePod('pod-a', '100')], metadata: { resourceVersion: '100' } },
      cluster: 'default',
      namespace: 'ns-a',
    });
    queryClient.setQueryData(['kubeObject', 'list', 'v1', 'pods', 'default', 'ns-b', {}], {
      list: { items: [makePod('pod-b', '200')], metadata: { resourceVersion: '200' } },
      cluster: 'default',
      namespace: 'ns-b',
    });

    // ns-a relist fetch returns relistDeferred
    mockClusterFetch.mockReturnValueOnce(relistDeferred.promise);

    renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['ns-a', 'ns-b'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length === 2);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    const initialConnections = spy.mock.calls.at(-1)?.[0].connections;
    const connA = initialConnections?.find((c: any) => c.url.includes('ns-a'));
    const connB = initialConnections?.find((c: any) => c.url.includes('ns-b'));

    // ns-b receives a watch event advancing its cursor to 250
    act(() => {
      connB?.onMessage({
        type: 'MODIFIED',
        object: {
          metadata: { name: 'pod-b', namespace: 'ns-b', resourceVersion: '250', uid: 'pod-b' },
        },
      });
    });

    // ns-a receives 410 Gone
    act(() => {
      connA?.onMessage({
        type: 'ERROR',
        object: {
          kind: 'Status',
          apiVersion: 'v1',
          status: 'Failure',
          message: 'too old resource version',
          reason: 'Expired',
          code: 410,
        },
      });
    });

    // While ns-a is relisting, ns-a watch is suspended and ns-b remains watching
    await waitFor(() => {
      const active = spy.mock.calls.at(-1)?.[0].connections ?? [];
      expect(active.length).toBe(1);
      expect(active[0].url).toContain('ns-b');
      expect(active[0].url).toContain('resourceVersion=250');
    });

    // Complete ns-a relist with fresh resourceVersion 300
    await act(async () => {
      relistDeferred.resolve({
        json: () =>
          Promise.resolve(
            makeListResponse({
              items: [makePod('pod-a', '300')],
              resourceVersion: '300',
            })
          ),
      } as Response);
    });

    // Both namespaces now watch: ns-a with fresh 300, ns-b retaining its advanced 250
    await waitFor(() => {
      const active = spy.mock.calls.at(-1)?.[0].connections ?? [];
      expect(active.length).toBe(2);
      const activeA = active.find((c: any) => c.url.includes('ns-a'));
      const activeB = active.find((c: any) => c.url.includes('ns-b'));
      expect(activeA?.url).toContain('resourceVersion=300');
      expect(activeB?.url).toContain('resourceVersion=250');
    });
  });

  it('stops watching when watch is disabled', async () => {
    const spy = vi.spyOn(websocket, 'useWebSockets');
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    const hook = renderHook(
      ({ watch }: { watch: boolean }) =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'default', namespaces: ['default'] }],
          watch,
        }),
      {
        wrapper: queryClientWrapper(queryClient),
        initialProps: { watch: true },
      }
    );

    await waitFor(() => {
      const activeCalls = spy.mock.calls.filter(call => call[0].connections.length > 0);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    // Disable watch
    hook.rerender({ watch: false });

    await waitFor(() => {
      const lastCall = spy.mock.calls.at(-1)?.[0];
      expect(lastCall?.connections.length === 0).toBe(true);
    });
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

  it('does not re-subscribe when incoming watch events update resourceVersion', async () => {
    const queryClient = new QueryClient();

    mockClusterFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve(
          makeListResponse({
            items: [makePod('pod-1', '100')],
            resourceVersion: '100',
          })
        ),
    } as Response);

    const result = renderHook(
      () =>
        useKubeObjectList({
          kubeObjectClass: mockClass,
          requests: [{ cluster: 'cluster-a', namespaces: ['namespace-a'] }],
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith(
        'cluster-a',
        expect.stringContaining('/api/v1/namespaces/namespace-a/pods'),
        'watch=1&resourceVersion=100',
        expect.any(Function),
        expect.any(Function)
      );
    });

    const initialSubscribeCalls = mockSubscribe.mock.calls.length;
    // Extract the onMessage callback passed to WebSocketManager.subscribe
    const onMessageCallback = mockSubscribe.mock.calls[0][3];

    // Deliver watch event with incremented resourceVersion
    act(() => {
      onMessageCallback({
        type: 'MODIFIED',
        object: makePod('pod-1', '101'),
      });
    });

    await waitFor(() => {
      expect(result.result.current.items?.[0]?.jsonData?.metadata?.resourceVersion).toBe('101');
    });

    // WebSocketManager.subscribe should NOT have been called again with resourceVersion=101
    expect(mockSubscribe.mock.calls.length).toBe(initialSubscribeCalls);
    expect(
      mockSubscribe.mock.calls.some(([, , query]) => query.includes('resourceVersion=101'))
    ).toBe(false);
  });

  it('cleans up multiplexer subscription on unmount', async () => {
    const queryClient = new QueryClient();
    const lists = [{ cluster: 'cluster-a', namespace: 'namespace-a', resourceVersion: '1' }];

    const hook = renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint: { version: 'v1', resource: 'pods' },
          lists,
        }),
      {
        wrapper: queryClientWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    hook.unmount();

    expect(mockSubscribeCleanup).toHaveBeenCalled();
  });

  it('notifies onReconnect with empty string when receiving expired 410 error in multiplexer mode', async () => {
    const onReconnect = vi.fn();
    const lists = [{ cluster: 'cluster-a', namespace: 'namespace-a', resourceVersion: '100' }];

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint: { version: 'v1', resource: 'pods' },
          lists,
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
      }
    );

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const onMessageCallback = mockSubscribe.mock.calls[0][3];

    // Deliver 410 Gone error
    act(() => {
      onMessageCallback({
        type: 'ERROR',
        object: {
          kind: 'Status',
          apiVersion: 'v1',
          code: 410,
          reason: 'Expired',
          message: 'too old resource version: 100',
        },
      });
    });

    expect(onReconnect).toHaveBeenCalledWith('cluster-a', 'namespace-a', '');
  });

  it('passes canonical watch query key (including empty string) to onReconnect in multiplexer mode', async () => {
    const onReconnect = vi.fn();
    const lists = [{ cluster: 'cluster-a', namespace: 'namespace-a', resourceVersion: '100' }];

    renderHook(
      () =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint: { version: 'v1', resource: 'pods' },
          lists,
          watchQueryParams: {},
          onReconnect,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
      }
    );

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const onMessageCallback = mockSubscribe.mock.calls[0][3];

    // Deliver 410 Gone error
    act(() => {
      onMessageCallback({
        type: 'ERROR',
        object: {
          kind: 'Status',
          apiVersion: 'v1',
          code: 410,
          reason: 'Expired',
          message: 'too old resource version: 100',
        },
      });
    });

    expect(onReconnect).toHaveBeenCalledWith('cluster-a', 'namespace-a', '', '');
  });

  it('preserves latest resourceVersion across updates when lists re-renders in multiplexer mode', async () => {
    const lists = [
      { cluster: 'cluster-a', namespace: 'ns-a', resourceVersion: '10' },
      { cluster: 'cluster-a', namespace: 'ns-b', resourceVersion: '20' },
    ];

    const hook = renderHook(
      ({ listsProp }) =>
        useWatchKubeObjectLists({
          kubeObjectClass: mockClass,
          endpoint: { version: 'v1', resource: 'pods' },
          lists: listsProp,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
        ),
        initialProps: { listsProp: lists },
      }
    );

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledTimes(2);
    });

    // ns-b message callback is the 2nd subscribe call's onMessage
    const onMessageB = mockSubscribe.mock.calls.find(call => call[1].includes('ns-b'))?.[3];

    // ns-b receives event advancing its cursor to 25
    act(() => {
      onMessageB({
        type: 'MODIFIED',
        object: makePod('pod-b', '25'),
      });
    });

    mockSubscribe.mockClear();

    // ns-a cursor updates to 12 in lists prop, ns-b prop remains starting 20
    hook.rerender({
      listsProp: [
        { cluster: 'cluster-a', namespace: 'ns-a', resourceVersion: '12' },
        { cluster: 'cluster-a', namespace: 'ns-b', resourceVersion: '20' },
      ],
    });

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    // ns-b must subscribe with advanced cursor 25, not stale 20
    const subscribeB = mockSubscribe.mock.calls.find(call => call[1].includes('ns-b'));
    expect(subscribeB?.[2]).toContain('resourceVersion=25');
  });
});
