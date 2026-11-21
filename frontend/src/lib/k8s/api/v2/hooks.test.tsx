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
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import WS from 'vitest-websocket-mock';
import { setConfig } from '../../../../redux/configSlice';
import store from '../../../../redux/stores/store';
import type { QueryParameters } from '../v1/queryParameters';
import { ApiError } from './ApiError';
import { getResourceDiscoveryConnection } from './discoveryConnection';
import { clusterFetch } from './fetch';
import { kubeObjectQueryKey, useEndpoints, useKubeObject } from './hooks';
import type { KubeObjectEndpoint } from './KubeObjectEndpoint';

vi.mock('./fetch', () => ({
  clusterFetch: vi.fn(),
}));

const mockUseWebSocket = vi.fn();
const mockUseWebSockets = vi.fn();

vi.mock('./multiplexer', () => ({
  useWebSocket: (...args: any[]) => mockUseWebSocket(...args),
  WebSocketManager: {
    subscribe: vi.fn().mockImplementation(() => Promise.resolve(() => {})),
  },
}));

vi.mock('./webSocket', () => ({
  useWebSockets: (...args: any[]) => mockUseWebSockets(...args),
  BASE_WS_URL: 'http://localhost:3000',
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn().mockResolvedValue(null),
}));

const mockClusterFetch = clusterFetch as MockedFunction<typeof clusterFetch>;

const mockJsonResponse = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response);

const createWrapper = (providedQueryClient?: QueryClient) => {
  const queryClient =
    providedQueryClient ??
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnMount: false,
          refetchOnReconnect: false,
        },
      },
    });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useEndpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a single endpoint without probing', () => {
    const endpoint: KubeObjectEndpoint = { version: 'v1', resource: 'pods' };

    const { result } = renderHook(() => useEndpoints([endpoint], 'cluster-a', 'default', 'pod-a'), {
      wrapper: createWrapper(),
    });

    expect(result.current.endpoint).toEqual(endpoint);
    expect(result.current.error).toBeNull();
    expect(mockClusterFetch).not.toHaveBeenCalled();
  });

  it('uses name-based GET probing in endpoint priority order', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'extensions', version: 'v1beta1', resource: 'ingresses' },
      { group: 'networking.k8s.io', version: 'v1', resource: 'ingresses' },
    ];

    mockClusterFetch.mockImplementation(url => {
      if (url === 'apis/extensions/v1beta1/namespaces/default/ingresses/demo') {
        return Promise.reject(new ApiError('Not Found', { status: 404 }));
      }
      if (url === 'apis/networking.k8s.io/v1/namespaces/default/ingresses/demo') {
        return Promise.resolve(mockJsonResponse({}));
      }

      return Promise.reject(new Error(`Unexpected URL: ${String(url)}`));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', 'default', 'demo'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.endpoint).toEqual(endpoints[1]);
    });

    const calledUrls = mockClusterFetch.mock.calls.map(([url]) => String(url));
    expect(calledUrls).toEqual([
      'apis/extensions/v1beta1/namespaces/default/ingresses/demo',
      'apis/networking.k8s.io/v1/namespaces/default/ingresses/demo',
    ]);
    expect(calledUrls).not.toContain('apis/extensions/v1beta1/namespaces/default/ingresses');
  });

  it.each([false, true])(
    'finds a served version with GET denied (LIST allowed: %s)',
    async listAllowed => {
      const endpoints: KubeObjectEndpoint[] = [
        { group: 'networking.k8s.io', version: 'v1beta1', resource: 'ingresses' },
        { group: 'networking.k8s.io', version: 'v1', resource: 'ingresses' },
      ];
      mockClusterFetch.mockImplementation(rawUrl => {
        const url = new URL(rawUrl, 'https://headlamp.test/');
        if (!listAllowed && url.pathname === '/apis/networking.k8s.io/v1') {
          return Promise.resolve(mockJsonResponse({ resources: [{ name: 'ingresses' }] }));
        }
        if (url.pathname === '/apis/networking.k8s.io/v1beta1') {
          return Promise.reject(new ApiError('Version not found', { status: 404 }));
        }
        if (
          listAllowed &&
          url.pathname === '/apis/networking.k8s.io/v1/namespaces/default/ingresses' &&
          url.searchParams.get('fieldSelector') === 'metadata.name=demo'
        ) {
          return Promise.resolve(mockJsonResponse({ items: [] }));
        }
        return Promise.reject(new ApiError('Forbidden', { status: 403 }));
      });

      const { result } = renderHook(
        () => useEndpoints(endpoints, 'cluster-a', 'default', 'demo', true),
        { wrapper: createWrapper() }
      );
      await waitFor(() => expect(result.current.endpoint).toEqual(endpoints[1]));
      expect(result.current.error).toBeNull();
      if (listAllowed) {
        const calls = mockClusterFetch.mock.calls.map(
          ([url]) => new URL(url, 'https://headlamp.test/')
        );
        expect(
          calls.some(url => url.searchParams.get('fieldSelector') === 'metadata.name=demo')
        ).toBe(true);
        expect(calls.map(url => url.pathname)).not.toContain('/apis/networking.k8s.io/v1');
      }
    }
  );

  it('handles cluster-scoped GET-by-name probing without namespace', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      {
        group: 'gateway.networking.k8s.io',
        version: 'v1',
        resource: 'gatewayclasses',
      },
    ];
    mockClusterFetch.mockImplementation(url => {
      if (url === 'apis/gateway.networking.k8s.io/v1/gatewayclasses/test-gc') {
        return Promise.resolve(
          mockJsonResponse({
            apiVersion: 'gateway.networking.k8s.io/v1',
            kind: 'GatewayClass',
            metadata: { name: 'test-gc' },
          })
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${String(url)}`));
    });

    const { result } = renderHook(
      () => useEndpoints(endpoints, 'cluster-a', undefined, 'test-gc'),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.endpoint).toEqual(endpoints[0]);
      expect(result.current.error).toBeNull();
    });
  });

  it('continues probing after forbidden and resolves next endpoint', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'extensions', version: 'v1beta1', resource: 'ingresses' },
      { group: 'networking.k8s.io', version: 'v1', resource: 'ingresses' },
    ];

    mockClusterFetch.mockImplementation(url => {
      if (url === 'apis/extensions/v1beta1/namespaces/default/ingresses/demo') {
        return Promise.reject(new ApiError('Forbidden', { status: 403 }));
      }
      if (url === 'apis/networking.k8s.io/v1/namespaces/default/ingresses/demo') {
        return Promise.resolve(mockJsonResponse({}));
      }

      return Promise.reject(new Error(`Unexpected URL: ${String(url)}`));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', 'default', 'demo'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.endpoint).toEqual(endpoints[1]);
    });
  });

  it('returns error when all get probes fail', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'apps', version: 'v1', resource: 'deployments' },
      { group: 'extensions', version: 'v1beta1', resource: 'deployments' },
    ];

    mockClusterFetch.mockImplementation(url => {
      if (url === 'apis/apps/v1/namespaces/default/deployments/demo') {
        return Promise.reject(new ApiError('Not Found', { status: 404 }));
      }
      if (url === 'apis/extensions/v1beta1/namespaces/default/deployments/demo') {
        return Promise.reject(new ApiError('Forbidden', { status: 403 }));
      }

      return Promise.reject(new Error(`Unexpected URL: ${String(url)}`));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', 'default', 'demo'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.endpoint).toBeUndefined();
  });

  it('keeps collection probing behavior when name is not provided', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'batch', version: 'v1', resource: 'jobs' },
      { group: 'batch', version: 'v1beta1', resource: 'jobs' },
    ];

    mockClusterFetch.mockImplementation(url => {
      if (url === 'apis/batch/v1/namespaces/default/jobs') {
        return Promise.reject(new ApiError('Forbidden', { status: 403 }));
      }
      if (url === 'apis/batch/v1beta1/namespaces/default/jobs') {
        return Promise.resolve(mockJsonResponse({}));
      }

      return Promise.reject(new Error(`Unexpected URL: ${String(url)}`));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', 'default'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.endpoint).toEqual(endpoints[1]);
    });

    const calledUrls = mockClusterFetch.mock.calls.map(([url]) => String(url));
    expect(calledUrls).toEqual([
      'apis/batch/v1/namespaces/default/jobs',
      'apis/batch/v1beta1/namespaces/default/jobs',
    ]);
  });

  it('returns error when all list probes fail', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'batch', version: 'v1', resource: 'jobs' },
      { group: 'batch', version: 'v1beta1', resource: 'jobs' },
    ];

    mockClusterFetch.mockImplementation(url => {
      if (url === 'apis/batch/v1/namespaces/default/jobs') {
        return Promise.reject(new ApiError('Not Found', { status: 404 }));
      }
      if (url === 'apis/batch/v1beta1/namespaces/default/jobs') {
        return Promise.reject(new ApiError('Forbidden', { status: 403 }));
      }

      return Promise.reject(new Error(`Unexpected URL: ${String(url)}`));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', 'default'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.endpoint).toBeUndefined();
  });

  it('handles non-ok response in list probing', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'batch', version: 'v1', resource: 'jobs' },
      { group: 'batch', version: 'v1beta1', resource: 'jobs' },
    ];

    mockClusterFetch.mockImplementation(url => {
      if (url === 'apis/batch/v1/namespaces/default/jobs') {
        return Promise.reject(new ApiError('Forbidden', { status: 403 }));
      }
      if (url === 'apis/batch/v1beta1/namespaces/default/jobs') {
        return Promise.resolve(mockJsonResponse({}));
      }

      return Promise.reject(new Error(`Unexpected URL: ${String(url)}`));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', 'default'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.endpoint).toEqual(endpoints[1]);
    });
  });
});

const MockPod = class {
  static apiEndpoint = {
    apiInfo: [{ version: 'v1', resource: 'pods' }] as KubeObjectEndpoint[],
  };
  constructor(public jsonData: any, public cluster?: string) {}

  get metadata() {
    return this.jsonData.metadata;
  }
} as any;

describe('useKubeObject watch wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClusterFetch.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('seeds a stale cached query with explicitly provided initial data', async () => {
    const endpoint: KubeObjectEndpoint = { version: 'v1', resource: 'pods' };
    const queryClient = new QueryClient();
    const queryKey = kubeObjectQueryKey({
      cluster: 'test',
      endpoint,
      namespace: 'my-ns',
      name: 'my-pod',
      queryParams: {},
    });
    const cachedPod = new MockPod(
      { metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '1' } },
      'test'
    );
    const initialPod = new MockPod(
      { metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '2' } },
      'test'
    );
    queryClient.setQueryData(queryKey, cachedPod);

    const { result } = renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'test',
          initialData: initialPod,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.data).toBe(initialPod);
    await waitFor(() => expect(queryClient.getQueryData(queryKey)).toBe(initialPod));
    expect(mockClusterFetch).not.toHaveBeenCalled();
  });

  it('disables multiplexer WebSocket when feature flag is off', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'my-pod', namespace: 'my-ns' },
      })
    );

    renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'test',
        }),
      { wrapper: createWrapper() }
    );

    // Wait until legacy sockets become enabled (data has loaded, flag is off)
    await waitFor(() => {
      const calls = mockUseWebSockets.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.enabled).toBe(true);
    });

    // Multiplexer hook must stay disabled regardless
    const wsLastCall = mockUseWebSocket.mock.calls[mockUseWebSocket.mock.calls.length - 1][0];
    expect(wsLastCall.enabled).toBe(false);
  });

  it('disables legacy WebSockets when feature flag is on', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'my-pod', namespace: 'my-ns' },
      })
    );

    renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'test',
        }),
      { wrapper: createWrapper() }
    );

    // Wait until multiplexer becomes enabled (data has loaded, flag is on)
    await waitFor(() => {
      const calls = mockUseWebSocket.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.enabled).toBe(true);
    });

    // Legacy hook must stay disabled regardless
    const wsLastCall = mockUseWebSockets.mock.calls[mockUseWebSockets.mock.calls.length - 1][0];
    expect(wsLastCall.enabled).toBe(false);
  });

  it('includes namespace in multiplexer watch URL when data is loaded', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'my-pod', namespace: 'my-ns' },
      })
    );

    renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'test',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      const calls = mockUseWebSocket.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.enabled).toBe(true);
      expect(lastCall.url()).toContain('namespaces/my-ns');
    });
  });

  const pod = (resourceVersion: string) => ({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion },
  });

  async function renderDiscoveredPodWatch(
    connectionRevision?: string,
    initialData?: InstanceType<typeof MockPod>,
    kubeObjectClass = MockPod,
    verifyClient?: () => boolean,
    queryParams?: QueryParameters
  ) {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    const cluster = 'discovered';
    const { getBaseWsUrl, useWebSockets } = await vi.importActual<typeof import('./webSocket')>(
      './webSocket'
    );
    mockUseWebSockets.mockImplementation(useWebSockets);
    const server = new WS(
      `${getBaseWsUrl().replace(/\/$/, '')}/clusters/${cluster}/api/v1/namespaces/my-ns/pods`,
      { verifyClient }
    );
    const connected = vi.fn();
    server.on('connection', connected);

    const previousClusters = store.getState().config.clusters;
    store.dispatch(
      setConfig({
        clusters: {
          ...previousClusters,
          [cluster]: {
            name: cluster,
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

    const { result, rerender, unmount } = renderHook(
      ({ initialData }: { initialData?: InstanceType<typeof MockPod> }) =>
        useKubeObject({
          kubeObjectClass,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster,
          initialData,
          queryParams,
        }),
      { wrapper: createWrapper(), initialProps: { initialData } }
    );
    return {
      result,
      rerender,
      connected,
      server,
      cleanup() {
        unmount();
        WS.clean();
        mockUseWebSockets.mockReset();
        store.dispatch(setConfig({ clusters: previousClusters }));
      },
    };
  }

  it('revalidates before reconnecting and recovers an expired resource version', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockResolvedValueOnce(mockJsonResponse(pod('2')))
      .mockResolvedValueOnce(mockJsonResponse(pod('3')))
      .mockResolvedValueOnce(mockJsonResponse(pod('3')));
    const { result, connected, server, cleanup } = await renderDiscoveredPodWatch(
      'route-a',
      undefined,
      MockPod,
      undefined,
      { allowWatchBookmarks: 'true' }
    );

    try {
      const original = await server.connected;
      expect(new URL(original.url).searchParams.get('resourceVersion')).toBe('1');
      expect(new URL(original.url).searchParams.get('allowWatchBookmarks')).toBe('true');
      server.send(JSON.stringify({ type: 'MODIFIED', object: pod('2') }));
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('2'));
      server.send(
        JSON.stringify({ type: 'BOOKMARK', object: { metadata: { resourceVersion: '3' } } })
      );
      expect(result.current.data?.metadata.resourceVersion).toBe('2');

      original.close();
      await waitFor(() => expect(connected).toHaveBeenCalledTimes(2), { timeout: 3500 });
      const resumed = connected.mock.calls[1][0];
      expect(new URL(resumed.url).searchParams.get('resourceVersion')).toBe('3');
      expect(result.current.data?.metadata.resourceVersion).toBe('2');

      server.send(JSON.stringify({ type: 'ERROR', object: { kind: 'Status', code: 410 } }));
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(3));
      resumed.close();
      await waitFor(() => expect(connected).toHaveBeenCalledTimes(3), { timeout: 4500 });
      expect(new URL(connected.mock.calls[2][0].url).searchParams.has('resourceVersion')).toBe(
        false
      );

      server.send(JSON.stringify({ type: 'ADDED', object: pod('10') }));
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('10'));
      expect(mockClusterFetch).toHaveBeenCalledTimes(4);
    } finally {
      cleanup();
    }
  }, 10000);

  it('ignores a delayed bookmark from before a background object refresh', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockResolvedValueOnce(mockJsonResponse(pod('5')))
      .mockResolvedValueOnce(mockJsonResponse(pod('5')));
    const { result, connected, server, cleanup } = await renderDiscoveredPodWatch('route-a');
    try {
      const original = await server.connected;
      server.send(JSON.stringify({ type: 'MODIFIED', object: pod('2') }));
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('2'));

      const connection = mockUseWebSockets.mock.lastCall?.[0].connections[0];
      await act(async () => {
        await connection.cacheEntry.fetch();
      });
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('5'));
      server.send(
        JSON.stringify({ type: 'BOOKMARK', object: { metadata: { resourceVersion: '3' } } })
      );

      original.close();
      await waitFor(() => expect(connected).toHaveBeenCalledTimes(2), { timeout: 3500 });
      expect(new URL(connected.mock.calls[1][0].url).searchParams.get('resourceVersion')).toBe('5');
    } finally {
      cleanup();
    }
  }, 6000);

  it('keeps reading the object when successive watch upgrades fail', async () => {
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockResolvedValueOnce(mockJsonResponse(pod('2')))
      .mockResolvedValueOnce(mockJsonResponse(pod('3')));
    const { result, server, cleanup } = await renderDiscoveredPodWatch();

    try {
      await server.connected;
      const connection = mockUseWebSockets.mock.lastCall?.[0].connections[0];
      await act(async () => {
        await connection.getWatchUrl(true);
      });
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('2'));

      await act(async () => {
        connection.onOpenFailure();
        await connection.getWatchUrl(true);
      });
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('3'));
      expect(mockClusterFetch.mock.calls[2][1].headers).toEqual({ 'Cache-Control': 'no-cache' });
    } finally {
      cleanup();
    }
  });

  it('reconciles an object deleted just before a versionless watch resumes', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockRejectedValueOnce(new ApiError('Not found', { status: 404 }));
    const { result, connected, server, cleanup } = await renderDiscoveredPodWatch(
      'route-a',
      undefined,
      MockPod,
      undefined,
      { resourceVersion: '0' }
    );

    try {
      const original = await server.connected;
      original.close();
      await waitFor(() => expect(connected).toHaveBeenCalledTimes(2), { timeout: 3500 });
      expect(new URL(connected.mock.calls[1][0].url).searchParams.has('resourceVersion')).toBe(
        false
      );
      await waitFor(() => expect(result.current.error?.status).toBe(404));
      expect(result.current.data).toBeNull();
      const readUrls = mockClusterFetch.mock.calls.map(
        ([url]) => new URL(url, 'https://headlamp.test/')
      );
      expect(readUrls[0].searchParams.get('resourceVersion')).toBe('0');
      expect(readUrls.slice(1).every(url => !url.searchParams.has('resourceVersion'))).toBe(true);
      expect(
        readUrls.every(url => url.searchParams.get('__headlamp_connection_revision') === 'route-a')
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('starts a new read on expiration while an older GET is pending', async () => {
    let resolveOldRead!: (response: Response) => void;
    const oldRead = new Promise<Response>(resolve => {
      resolveOldRead = resolve;
    });
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockReturnValueOnce(oldRead)
      .mockRejectedValueOnce(new ApiError('Not found', { status: 404 }));
    const { result, server, cleanup } = await renderDiscoveredPodWatch();

    try {
      await server.connected;
      const cacheEntry = mockUseWebSockets.mock.lastCall?.[0].connections[0].cacheEntry;
      const pending = cacheEntry.fetch().catch(() => {});
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));

      act(() => server.send(JSON.stringify({ type: 'ERROR', object: { code: 410 } })));
      await waitFor(() => expect(result.current.error?.status).toBe(404));
      await act(async () => {
        resolveOldRead(mockJsonResponse(pod('1')));
        await pending;
      });
      expect(mockClusterFetch.mock.calls[1][1].signal?.aborted).toBe(true);
      expect(result.current.error?.status).toBe(404);
      expect(result.current.data).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('retries a failed read after observing a deletion with no cached object', async () => {
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockRejectedValueOnce(new ApiError('Unavailable', { status: 503 }))
      .mockResolvedValueOnce(mockJsonResponse(pod('3')));
    const { result, server, cleanup } = await renderDiscoveredPodWatch();

    try {
      await server.connected;
      act(() => server.send(JSON.stringify({ type: 'DELETED', object: pod('2') })));
      await waitFor(() => expect(result.current.error?.status).toBe(503));
      expect(result.current.data).toBeNull();
      expect(mockUseWebSockets.mock.lastCall?.[0].enabled).toBe(true);
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('3'), {
        timeout: 4000,
      });
    } finally {
      cleanup();
    }
  }, 6500);

  it('retries the reconnect read and reports an object deleted before the watch restarted', async () => {
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockRejectedValueOnce(new ApiError('Service unavailable', { status: 503 }))
      .mockRejectedValueOnce(new ApiError('Not found', { status: 404 }));
    const { result, connected, server, cleanup } = await renderDiscoveredPodWatch();

    try {
      const original = await server.connected;
      original.close();
      await waitFor(() => expect(connected).toHaveBeenCalledTimes(2), { timeout: 4000 });
      const resumed = connected.mock.calls[1][0];
      expect(new URL(resumed.url).searchParams.has('resourceVersion')).toBe(false);

      await waitFor(() => expect(result.current.error?.status).toBe(503));
      expect(result.current.data?.metadata.resourceVersion).toBe('1');
      expect(mockUseWebSockets.mock.lastCall?.[0].enabled).toBe(true);
      await waitFor(() => expect(result.current.error?.status).toBe(404), { timeout: 4000 });
      expect(mockUseWebSockets.mock.lastCall?.[0].enabled).toBe(false);
      expect(result.current.data).toBeNull();
      expect(mockClusterFetch).toHaveBeenCalledTimes(3);
    } finally {
      cleanup();
    }
  }, 10000);

  it.each([
    [401, 'Unauthorized'],
    [409, 'Discovered cluster connection changed'],
  ])(
    'clears cached data after a terminal reconnect error (%s)',
    async (status, message) => {
      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(pod('1')))
        .mockRejectedValueOnce(new ApiError(message, { status }))
        .mockRejectedValueOnce(new ApiError('Temporary error', { status: 503 }));
      const { result, server, cleanup } = await renderDiscoveredPodWatch();

      try {
        const socket = await server.connected;
        await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('1'));
        const cacheEntry = mockUseWebSockets.mock.lastCall?.[0].connections[0].cacheEntry;
        socket.close();
        await waitFor(() => expect(result.current.error?.status).toBe(status), { timeout: 4000 });
        expect(result.current.data).toBeNull();
        expect(mockUseWebSockets.mock.lastCall?.[0].enabled).toBe(false);

        await act(async () => {
          await cacheEntry.fetch().catch(() => {});
        });
        await waitFor(() => expect(result.current.error?.status).toBe(503));
        expect(result.current.data).toBeNull();
      } finally {
        cleanup();
      }
    },
    6500
  );

  it.each([false, true])(
    'hides an unverified object while reconnecting (watch authorized: %s)',
    async allowWatch => {
      const verifyClient = vi.fn(() => true);
      mockClusterFetch
        .mockResolvedValueOnce(mockJsonResponse(pod('1')))
        .mockRejectedValueOnce(new ApiError('GET is forbidden', { status: 403 }))
        .mockRejectedValueOnce(new ApiError('LIST is forbidden', { status: 403 }));
      const { result, connected, server, cleanup } = await renderDiscoveredPodWatch(
        'route-a',
        undefined,
        MockPod,
        verifyClient
      );

      try {
        const original = await server.connected;
        verifyClient.mockReturnValue(allowWatch);
        original.close();
        await waitFor(() => expect(verifyClient).toHaveBeenCalledTimes(2), { timeout: 4000 });
        expect(mockClusterFetch.mock.calls[2][0]).toContain('fieldSelector=metadata.name%3Dmy-pod');
        expect(mockClusterFetch.mock.calls[2][0]).toContain(
          '__headlamp_connection_revision=route-a'
        );
        await waitFor(() => expect(result.current.error?.status).toBe(403));
        expect(result.current.data).toBeNull();

        if (allowWatch) {
          const replacement = new URL(connected.mock.calls[1][0].url);
          expect(replacement.searchParams.has('resourceVersion')).toBe(false);

          server.send(JSON.stringify({ type: 'ADDED', object: pod('2') }));
          await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('2'));
          expect(result.current.error).toBeNull();

          mockClusterFetch
            .mockRejectedValueOnce(new ApiError('GET is forbidden', { status: 403 }))
            .mockRejectedValueOnce(new ApiError('LIST is forbidden', { status: 403 }));
          const { cacheEntry } = mockUseWebSockets.mock.lastCall?.[0].connections[0];
          await act(async () => {
            await cacheEntry.fetch();
          });
          expect(result.current.data?.metadata.resourceVersion).toBe('2');
          expect(result.current.error).toBeNull();

          mockClusterFetch
            .mockRejectedValueOnce(new ApiError('GET is forbidden', { status: 403 }))
            .mockRejectedValueOnce(new ApiError('LIST is forbidden', { status: 403 }));
          server.send(
            JSON.stringify({
              type: 'ERROR',
              object: { kind: 'Status', code: 403, message: 'Denied' },
            })
          );
          await waitFor(() => expect(result.current.error?.message).toBe('Denied'));
          expect(result.current.data).toBeNull();
        }
      } finally {
        cleanup();
      }
    },
    6500
  );

  it('continues showing an object when only its watch is forbidden', async () => {
    const revalidation = Promise.withResolvers<Response>();
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockReturnValueOnce(revalidation.promise);
    const { result, server, cleanup } = await renderDiscoveredPodWatch();

    try {
      await server.connected;
      server.send(JSON.stringify({ type: 'ERROR', object: { kind: 'Status', code: 403 } }));
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      expect(result.current.data?.metadata.resourceVersion).toBe('1');
      expect(result.current.error).toBeNull();
      await act(async () => {
        revalidation.resolve(mockJsonResponse(pod('2')));
      });
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('2'));
      expect(result.current.error).toBeNull();
    } finally {
      cleanup();
      revalidation.resolve(mockJsonResponse(pod('2')));
    }
  });

  it.each([false, true])(
    'uses the name-filtered list to verify existence (found: %s)',
    async found => {
      const listedPod = { metadata: pod('2').metadata };
      mockClusterFetch
        .mockRejectedValueOnce(new ApiError('GET is forbidden', { status: 403 }))
        .mockResolvedValueOnce(
          mockJsonResponse({
            kind: 'PodList',
            apiVersion: 'v1',
            items: found ? [listedPod] : [],
          })
        );
      const { result, server, cleanup } = await renderDiscoveredPodWatch();

      try {
        if (found) {
          await waitFor(() => expect(result.current.data?.jsonData).toEqual(pod('2')));
          expect(result.current.error).toBeNull();
          const watch = await server.connected;
          expect(new URL(watch.url).searchParams.get('fieldSelector')).toBe('metadata.name=my-pod');
        } else {
          await waitFor(() => expect(result.current.error?.status).toBe(404));
          expect(result.current.data).toBeNull();
        }
        const url = new URL(mockClusterFetch.mock.calls[1][0], 'https://headlamp.test/');
        expect(url.searchParams.get('fieldSelector')).toBe('metadata.name=my-pod');
        expect(url.searchParams.has('labelSelector')).toBe(false);
      } finally {
        cleanup();
      }
    }
  );

  it('keeps a selector-filtered object hidden until it rejoins the watch', async () => {
    const list = (items: ReturnType<typeof pod>[]) =>
      mockJsonResponse({
        items,
        apiVersion: 'v1',
        kind: 'PodList',
      });
    mockClusterFetch.mockResolvedValueOnce(list([pod('1')])).mockResolvedValueOnce(list([]));
    const { result, server, cleanup } = await renderDiscoveredPodWatch(
      'route-a',
      undefined,
      MockPod,
      undefined,
      { fieldSelector: 'status.phase=Pending', labelSelector: 'app=sample' }
    );
    try {
      await server.connected;
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('1'));
      act(() => server.send(JSON.stringify({ type: 'DELETED', object: pod('2') })));
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(result.current.data).toBeNull());
      expect(result.current.error).toBeNull();
      for (const [path] of mockClusterFetch.mock.calls) {
        const url = new URL(path, 'https://headlamp.test/');
        expect(url.pathname).toBe('/api/v1/namespaces/my-ns/pods');
        expect(url.searchParams.get('fieldSelector')).toBe(
          'status.phase=Pending,metadata.name=my-pod'
        );
        expect(url.searchParams.get('labelSelector')).toBe('app=sample');
        expect(url.searchParams.get('__headlamp_connection_revision')).toBe('route-a');
      }

      act(() => server.send(JSON.stringify({ type: 'ADDED', object: pod('3') })));
      await waitFor(() => expect(result.current.data?.metadata.resourceVersion).toBe('3'));
    } finally {
      cleanup();
    }
  });

  it.each([false, true])('reconciles a deleted resource (recreated: %s)', async recreated => {
    let resolveOldRead!: (response: Response) => void;
    const oldRead = new Promise<Response>(resolve => {
      resolveOldRead = resolve;
    });
    const replacement = { ...pod('3'), metadata: { ...pod('3').metadata, uid: 'replacement' } };
    mockClusterFetch.mockResolvedValueOnce(mockJsonResponse(pod('1'))).mockReturnValueOnce(oldRead);
    if (recreated) mockClusterFetch.mockResolvedValueOnce(mockJsonResponse(replacement));
    else mockClusterFetch.mockRejectedValueOnce(new ApiError('Not found', { status: 404 }));
    const { result, server, cleanup } = await renderDiscoveredPodWatch();

    try {
      await server.connected;
      const cacheEntry = mockUseWebSockets.mock.lastCall?.[0].connections[0].cacheEntry;
      let reading!: Promise<unknown>;
      act(() => {
        reading = cacheEntry.fetch().catch(() => {});
      });
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));

      act(() => {
        server.send(JSON.stringify({ type: 'DELETED', object: pod('2') }));
      });
      if (recreated) {
        await waitFor(() => expect(result.current.data?.metadata.uid).toBe('replacement'));
      } else {
        await waitFor(() => expect(result.current.error?.status).toBe(404));
        expect(result.current.data).toBeNull();
      }
      await act(async () => {
        resolveOldRead(mockJsonResponse(pod('1')));
        await reading;
      });
      expect(mockClusterFetch).toHaveBeenCalledTimes(3);
      if (recreated) {
        expect(result.current.data?.metadata.uid).toBe('replacement');
      } else {
        expect(result.current.error?.status).toBe(404);
        expect(result.current.data).toBeNull();
      }
    } finally {
      cleanup();
    }
  });

  function replaceDiscoveredConnection() {
    act(() => {
      const clusters = store.getState().config.clusters!;
      const cluster = clusters.discovered;
      store.dispatch(
        setConfig({
          clusters: {
            ...clusters,
            discovered: {
              ...cluster,
              server: 'https://new-discovery.example.com',
              meta_data: { ...cluster.meta_data, discoveryConnectionRevision: 'connection-b' },
            },
          },
        })
      );
    });
  }

  it('drops cached and seeded objects when the discovery connection changes', async () => {
    let resolveReplacement!: (response: Response) => void;
    mockClusterFetch.mockReturnValueOnce(
      new Promise<Response>(resolve => {
        resolveReplacement = resolve;
      })
    );
    const seed = new MockPod({ ...pod('1'), spec: { nodeName: 'old-node' } }, 'discovered');
    const { result, connected, server, cleanup } = await renderDiscoveredPodWatch(
      'connection-a',
      seed
    );

    try {
      const previous = await server.connected;
      expect(result.current.data?.jsonData.spec.nodeName).toBe('old-node');

      replaceDiscoveredConnection();

      await waitFor(() => expect(previous.readyState).toBe(WebSocket.CLOSED));
      expect(result.current.data).toBeNull();
      await act(async () =>
        resolveReplacement(mockJsonResponse({ ...pod('1'), spec: { nodeName: 'new-node' } }))
      );
      await waitFor(() => expect(result.current.data?.jsonData.spec.nodeName).toBe('new-node'));
      await waitFor(() => expect(connected).toHaveBeenCalledTimes(2));
      expect(mockClusterFetch).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('drops an old object seed when the connection changes during endpoint probing', async () => {
    const VersionedPod = class extends MockPod {
      static apiEndpoint = {
        apiInfo: [
          { version: 'v1', resource: 'pods' },
          { version: 'v2', resource: 'pods' },
        ],
      };
    };
    let resolveOldProbe!: (response: Response) => void;
    const oldProbe = new Promise<Response>(resolve => {
      resolveOldProbe = resolve;
    });
    let resolveNewProbe!: (response: Response) => void;
    const newProbe = new Promise<Response>(resolve => {
      resolveNewProbe = resolve;
    });
    mockClusterFetch
      .mockReturnValueOnce(oldProbe)
      .mockReturnValueOnce(oldProbe)
      .mockReturnValueOnce(newProbe)
      .mockRejectedValueOnce(new ApiError('Not found', { status: 404 }))
      .mockResolvedValueOnce(mockJsonResponse({ ...pod('1'), spec: { nodeName: 'new-node' } }));
    const seed = new MockPod({ ...pod('1'), spec: { nodeName: 'old-node' } }, 'discovered');
    const { result, cleanup } = await renderDiscoveredPodWatch('connection-a', seed, VersionedPod);

    try {
      expect(result.current.data?.jsonData.spec.nodeName).toBe('old-node');
      expect(getResourceDiscoveryConnection(seed)).toEqual({
        cluster: 'discovered',
        revision: expect.stringMatching(/^connection-a:/),
      });
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      expect(mockClusterFetch.mock.calls[0][0]).toContain(
        '__headlamp_connection_revision=connection-a'
      );

      replaceDiscoveredConnection();
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(4));
      expect(mockClusterFetch.mock.calls[2][0]).toContain(
        '__headlamp_connection_revision=connection-b'
      );
      expect(result.current.data).toBeNull();
      expect(getResourceDiscoveryConnection(seed)?.revision).toMatch(/^connection-a:/);

      await act(async () => {
        resolveNewProbe(mockJsonResponse({}));
        resolveOldProbe(mockJsonResponse({}));
      });
      await waitFor(() => expect(result.current.data?.jsonData.spec.nodeName).toBe('new-node'));
      expect(mockClusterFetch).toHaveBeenCalledTimes(5);
      expect(mockClusterFetch.mock.calls[4][0]).toContain(
        '__headlamp_connection_revision=connection-b'
      );
    } finally {
      cleanup();
    }
  });

  it('retains the connection revision of a temporarily absent seed', async () => {
    let resolveReplacement!: (response: Response) => void;
    const replacement = new Promise<Response>(resolve => {
      resolveReplacement = resolve;
    });
    const oldObject = { ...pod('1'), spec: { nodeName: 'old-node' } };
    const newObject = { ...pod('1'), spec: { nodeName: 'new-node' } };
    const seed = new MockPod(oldObject, 'discovered');
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(oldObject))
      .mockReturnValue(replacement);
    const { result, rerender, cleanup } = await renderDiscoveredPodWatch('connection-a', seed);

    try {
      expect(result.current.data?.jsonData.spec.nodeName).toBe('old-node');
      rerender({ initialData: undefined });
      replaceDiscoveredConnection();
      rerender({ initialData: seed });
      expect(result.current.data).toBeNull();

      rerender({ initialData: new MockPod(newObject, 'discovered') });
      expect(result.current.data?.jsonData.spec.nodeName).toBe('new-node');
    } finally {
      cleanup();
      resolveReplacement(mockJsonResponse(newObject));
    }
  });

  it('keeps the requested cluster when a watch update replaces the object', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '1' },
      })
    );

    const { result } = renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'owner-cluster',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data?.cluster).toBe('owner-cluster');
      expect(mockUseWebSockets.mock.calls.length).toBeGreaterThan(0);
    });

    const { connections } =
      mockUseWebSockets.mock.calls[mockUseWebSockets.mock.calls.length - 1][0];
    const onMessage = connections[0].onMessage;

    // A MODIFIED event rebuilds the object. It has to carry the cluster the hook
    // was asked for; otherwise it falls back to getCluster(), which reads the URL
    // and does not know about the cluster passed in explicitly here.
    onMessage({
      type: 'MODIFIED',
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '2' },
      },
    });

    await waitFor(() => {
      expect(result.current.data?.jsonData?.metadata?.resourceVersion).toBe('2');
    });
    expect(result.current.data?.cluster).toBe('owner-cluster');
  });

  it('re-subscribes to the new resource when navigating between resources of the same kind', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'pod-a', namespace: 'my-ns' },
      })
    );

    const { rerender } = renderHook(
      ({ name }: { name: string }) =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name,
          namespace: 'my-ns',
          cluster: 'test',
        }),
      { wrapper: createWrapper(), initialProps: { name: 'pod-a' } }
    );

    // Same endpoint ("pods") is used for both resources, so only the watch
    // connection's fieldSelector should change between renders.
    await waitFor(() => {
      const calls = mockUseWebSockets.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.connections[0]?.url).toContain('metadata.name%3Dpod-a');
    });

    rerender({ name: 'pod-b' });

    await waitFor(() => {
      const calls = mockUseWebSockets.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.connections[0]?.url).toContain('metadata.name%3Dpod-b');
      expect(lastCall.connections[0]?.url).not.toContain('metadata.name%3Dpod-a');
    });
  });
});
