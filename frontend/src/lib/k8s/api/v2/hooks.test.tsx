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
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  onTestFinished,
  vi,
} from 'vitest';
import { ApiError } from './ApiError';
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
} as any;

const watchPod = (version: string) => ({
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: version },
});

function renderWatchedPod(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  const hook = renderHook(
    () =>
      useKubeObject({
        kubeObjectClass: MockPod,
        name: 'my-pod',
        namespace: 'my-ns',
        cluster: 'test',
      }),
    { wrapper: createWrapper(client) }
  );
  onTestFinished(async () => {
    hook.unmount();
    await client.cancelQueries();
    client.clear();
  });
  return { ...hook, client, watch: () => mockUseWebSocket.mock.calls.at(-1)![0] };
}

describe('useKubeObject watch wiring', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('pins the opening object version, reconciles snapshots/deletion, and relists on expiry', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    const pod = (version: string) => ({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: version },
    });
    mockClusterFetch.mockResolvedValue(mockJsonResponse(pod('1')));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'test',
        }),
      { wrapper: createWrapper(client) }
    );
    await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('1'));
    const watch = () => mockUseWebSocket.mock.calls.at(-1)![0];
    expect(watch().url()).toContain('resourceVersion=1');
    act(() => watch().onMessage({ type: 'ADDED', object: pod('2') }));
    await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('2'));
    expect(watch().url()).toContain('resourceVersion=1');
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({ items: [pod('5')], metadata: { resourceVersion: '10' } })
    );
    act(() => watch().onMessage({ type: 'ERROR', object: { code: 410 } }));
    await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('5'));
    expect(watch().url()).toContain('resourceVersion=10');
    act(() => watch().onMessage({ type: 'DELETED', object: pod('6') }));
    await waitFor(() => expect(result.current.data).toBeNull());
    expect(result.current.error?.status).toBe(404);
    expect(result.current.status).toBe('error');
    expect(result.current.isSuccess).toBe(false);
    expect(watch().enabled).toBe(true);
    act(() => watch().onMessage({ type: 'ADDED', object: pod('11') }));
    await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('11'));
    expect(result.current.error).toBeNull();
    unmount();
    await client.cancelQueries();
    client.clear();
  });

  it.each(['true', 'false'])(
    'recovers an expired unchanged object with a collection cursor (multiplexer=%s)',
    async enabled => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', enabled);
      const pod = { metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '1' } };
      mockClusterFetch.mockImplementation(url =>
        Promise.resolve(
          mockJsonResponse(
            String(url).includes('fieldSelector=')
              ? { items: [pod], metadata: { resourceVersion: '20' } }
              : pod
          )
        )
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { result, unmount } = renderHook(
        () =>
          useKubeObject({
            kubeObjectClass: MockPod,
            name: 'my-pod',
            namespace: 'my-ns',
            cluster: 'test',
          }),
        { wrapper: createWrapper(client) }
      );
      const watch = () =>
        enabled === 'true'
          ? {
              ...mockUseWebSocket.mock.calls.at(-1)![0],
              url: mockUseWebSocket.mock.calls.at(-1)![0].url(),
            }
          : {
              ...mockUseWebSockets.mock.calls.at(-1)![0],
              ...mockUseWebSockets.mock.calls.at(-1)![0].connections[0],
            };
      await waitFor(() => expect(watch().enabled).toBe(true));
      const retiredWatch = watch();
      act(() => retiredWatch.onMessage({ type: 'ERROR', object: { code: 410 } }));
      await waitFor(() => expect(watch().url).toContain('resourceVersion=20'));
      expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('1');
      act(() =>
        retiredWatch.onMessage({
          type: 'MODIFIED',
          object: { ...pod, metadata: { ...pod.metadata, resourceVersion: '2' } },
        })
      );
      expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('1');
      act(() => watch().onMessage({ type: 'DELETED', object: pod }));
      await waitFor(() => expect(result.current.error?.status).toBe(404));
      expect(watch().enabled).toBe(true);
      act(() => watch().onMessage({ type: 'ADDED', object: pod }));
      await waitFor(() => expect(result.current.error).toBeNull());
      unmount();
      await client.cancelQueries();
      client.clear();
    }
  );

  it('shares expiry recovery with other observers after the fetching observer unmounts', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    const pod = (version: string) => ({
      metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: version },
    });
    mockClusterFetch.mockResolvedValue(mockJsonResponse(pod('1')));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(client);
    const usePod = () =>
      useKubeObject({
        kubeObjectClass: MockPod,
        name: 'my-pod',
        namespace: 'my-ns',
        cluster: 'test',
      });
    const first = renderHook(usePod, { wrapper });
    await waitFor(() => expect(first.result.current.data).not.toBeNull());
    const second = renderHook(usePod, { wrapper });
    await waitFor(() =>
      expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).toContain('resourceVersion=1')
    );
    expect(mockClusterFetch).toHaveBeenCalledOnce();
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({ items: [pod('1')], metadata: { resourceVersion: '20' } })
    );
    act(() =>
      mockUseWebSocket.mock.calls.at(-1)![0].onMessage({
        type: 'ERROR',
        object: { code: 410 },
      })
    );
    await waitFor(() => {
      const watches = mockUseWebSocket.mock.calls.slice(-2).map(([watch]) => watch.url());
      expect(watches.every(url => url.includes('resourceVersion=20'))).toBe(true);
    });
    expect(mockClusterFetch).toHaveBeenCalledTimes(2);
    first.unmount();
    act(() =>
      mockUseWebSocket.mock.calls.at(-1)![0].onMessage({ type: 'MODIFIED', object: pod('21') })
    );
    await waitFor(() =>
      expect(second.result.current.data?.jsonData.metadata.resourceVersion).toBe('21')
    );
    expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).toContain('resourceVersion=20');
    second.unmount();
    await client.cancelQueries();
    client.clear();
  });

  it.each([false, true])(
    'normalizes missing fetched/seeded watch cursors (seeded=%s)',
    async seeded => {
      const pod = new MockPod({ metadata: { name: 'my-pod', namespace: 'my-ns' } }, 'test');
      mockClusterFetch.mockResolvedValue(mockJsonResponse(pod.jsonData));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { unmount } = renderHook(
        () =>
          useKubeObject({
            kubeObjectClass: MockPod,
            name: 'my-pod',
            namespace: 'my-ns',
            cluster: 'test',
            initialData: seeded ? pod : undefined,
          }),
        { wrapper: createWrapper(client) }
      );
      await waitFor(() => expect(mockUseWebSockets.mock.calls.at(-1)![0].enabled).toBe(true));
      const legacyUrl = mockUseWebSockets.mock.calls.at(-1)![0].connections[0].url;
      expect(legacyUrl).not.toContain('undefined');
      expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).not.toContain('undefined');
      unmount();
      await client.cancelQueries();
      client.clear();
    }
  );

  it('keeps watching when an expiry snapshot finds the object deleted', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '1' },
      })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'test',
        }),
      { wrapper: createWrapper(client) }
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({ items: [], metadata: { resourceVersion: '20' } })
    );
    act(() =>
      mockUseWebSocket.mock.calls.at(-1)![0].onMessage({ type: 'ERROR', object: { code: 410 } })
    );
    await waitFor(() => expect(result.current.error?.status).toBe(404));
    expect(result.current.data).toBeNull();
    expect(mockUseWebSocket.mock.calls.at(-1)![0].enabled).toBe(true);
    act(() =>
      mockUseWebSocket.mock.calls.at(-1)![0].onMessage({
        type: 'ADDED',
        object: { metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '21' } },
      })
    );
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('21');
    unmount();
    await client.cancelQueries();
    client.clear();
  });

  it.each(['true', 'false'])(
    'retains the last object and reports a failed recovery snapshot (multiplexer=%s)',
    async enabled => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', enabled);
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const { result, client } = renderWatchedPod();
      const watch = () =>
        enabled === 'true'
          ? mockUseWebSocket.mock.calls.at(-1)![0]
          : {
              ...mockUseWebSockets.mock.calls.at(-1)![0].connections[0],
              enabled: mockUseWebSockets.mock.calls.at(-1)![0].enabled,
            };
      await waitFor(() => expect(watch().enabled).toBe(true));
      const loaded = result.current.data;
      const onMessage = watch().onMessage;
      const forbidden = new ApiError('Cannot list pods', { status: 403 });
      mockClusterFetch.mockRejectedValue(forbidden);
      act(() => onMessage({ type: 'ERROR', object: { code: 410 } }));
      await waitFor(() => expect(result.current.error).toBe(forbidden));
      expect(result.current.data).toBe(loaded);
      expect([...result.current]).toEqual([loaded, forbidden]);
      expect(result.current.isError).toBe(true);
      expect(watch().enabled).toBe(false);
      // A late event from the expired watch must not overwrite the retained object.
      act(() => onMessage({ type: 'MODIFIED', object: watchPod('2') }));
      expect(result.current.data).toBe(loaded);

      mockClusterFetch.mockResolvedValue(
        mockJsonResponse({ items: [watchPod('3')], metadata: { resourceVersion: '20' } })
      );
      await act(async () => {
        await client.invalidateQueries({
          queryKey: kubeObjectQueryKey({
            cluster: 'test',
            endpoint: MockPod.apiEndpoint.apiInfo[0],
            name: 'my-pod',
            namespace: 'my-ns',
          }),
          exact: true,
        });
      });
      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('3');
      expect(watch().enabled).toBe(true);
    }
  );

  it('does not retain an object after a failed named GET', async () => {
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const { result, client } = renderWatchedPod();
    await waitFor(() => expect(result.current.data).not.toBeNull());
    mockClusterFetch.mockRejectedValue(new ApiError('Cannot get pod', { status: 403 }));
    await act(async () => {
      await client.invalidateQueries({
        queryKey: kubeObjectQueryKey({
          cluster: 'test',
          endpoint: MockPod.apiEndpoint.apiInfo[0],
          name: 'my-pod',
          namespace: 'my-ns',
        }),
        exact: true,
      });
    });
    await waitFor(() => expect(result.current.error?.status).toBe(403));
    expect(result.current.data).toBeNull();
    expect(mockClusterFetch.mock.calls.at(-1)![0]).toBe('api/v1/namespaces/my-ns/pods/my-pod');
  });

  it('does not repin the shared cursor when a cancelled fetch settles late', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    const pod = (version: string) => ({
      metadata: { name: 'my-pod', resourceVersion: version },
    });
    let finishCancelledFetch!: (response: Response) => void;
    mockClusterFetch
      .mockResolvedValueOnce(mockJsonResponse(pod('1')))
      .mockImplementationOnce(
        () =>
          new Promise<Response>(resolve => {
            finishCancelledFetch = resolve;
          })
      )
      .mockResolvedValueOnce(mockJsonResponse(pod('3')));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () => useKubeObject({ kubeObjectClass: MockPod, name: 'my-pod', cluster: 'test' }),
      { wrapper: createWrapper(client) }
    );
    await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('1'));
    const queryKey = kubeObjectQueryKey({
      cluster: 'test',
      endpoint: MockPod.apiEndpoint.apiInfo[0],
      name: 'my-pod',
    });
    let cancelledRefetch!: Promise<void>;
    act(() => {
      cancelledRefetch = client.invalidateQueries({ queryKey, exact: true });
    });
    await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
    await act(async () => {
      await client.invalidateQueries({ queryKey, exact: true });
    });
    await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('3'));
    await act(async () => {
      finishCancelledFetch(mockJsonResponse(pod('2')));
      await cancelledRefetch;
    });
    expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('3');
    expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).toContain('resourceVersion=3');
    unmount();
    await client.cancelQueries();
    client.clear();
  });

  it('starts a new watch from cached data after all observers unmount', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    const pod = (version: string) => ({
      metadata: { name: 'my-pod', resourceVersion: version },
    });
    mockClusterFetch.mockResolvedValue(mockJsonResponse(pod('1')));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(client);
    const usePod = () =>
      useKubeObject({ kubeObjectClass: MockPod, name: 'my-pod', cluster: 'test' });
    const first = renderHook(usePod, { wrapper });
    await waitFor(() => expect(mockUseWebSocket.mock.calls.at(-1)![0].enabled).toBe(true));
    act(() =>
      mockUseWebSocket.mock.calls.at(-1)![0].onMessage({
        type: 'MODIFIED',
        object: pod('3'),
      })
    );
    await waitFor(() =>
      expect(first.result.current.data?.jsonData.metadata.resourceVersion).toBe('3')
    );
    first.unmount();
    await waitFor(() =>
      expect(client.getQueryCache().findAll({ queryKey: ['object-watch'] })).toHaveLength(0)
    );
    const second = renderHook(usePod, { wrapper });
    await waitFor(() =>
      expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).toContain('resourceVersion=3')
    );
    expect(mockClusterFetch).toHaveBeenCalledOnce();
    second.unmount();
    await client.cancelQueries();
    client.clear();
  });

  it('accepts an event before callback replacement after an unchanged live snapshot', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const hook = renderWatchedPod();
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    const installedCallback = hook.watch().onMessage;
    await act(async () => {
      await hook.client.invalidateQueries({ queryKey: ['object'] });
      installedCallback({ type: 'MODIFIED', object: watchPod('2') });
    });
    await waitFor(() =>
      expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('2')
    );
    expect(hook.watch().url()).toContain('resourceVersion=1');
  });

  it('processes consecutive legacy updates, deletion and expiry before a render', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const hook = renderWatchedPod();
    await waitFor(() => expect(mockUseWebSockets.mock.calls.at(-1)![0].enabled).toBe(true));
    const callback = mockUseWebSockets.mock.calls.at(-1)![0].connections[0].onMessage;
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        kind: 'PodList',
        apiVersion: 'v1',
        items: [],
        metadata: { resourceVersion: '20' },
      })
    );
    act(() => {
      callback({ type: 'MODIFIED', object: watchPod('2') });
      callback({ type: 'DELETED', object: watchPod('3') });
      callback({ type: 'ERROR', object: { code: 410 } });
    });
    await waitFor(() => {
      expect(hook.result.current.error?.status).toBe(404);
      expect(mockUseWebSockets.mock.calls.at(-1)![0].connections[0].url).toContain(
        'resourceVersion=20'
      );
    });
    expect(mockClusterFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the synthesized deletion error stable across parent renders', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const hook = renderWatchedPod();
    await waitFor(() => expect(hook.watch().enabled).toBe(true));
    act(() => hook.watch().onMessage({ type: 'DELETED', object: watchPod('2') }));
    await waitFor(() => expect(hook.result.current.error?.status).toBe(404));
    const missingError = hook.result.current.error;
    hook.rerender();
    expect(hook.result.current.error).toBe(missingError);
  });

  it('restores object type metadata omitted from a recovery list item', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const hook = renderWatchedPod();
    await waitFor(() => expect(hook.watch().enabled).toBe(true));
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        kind: 'PodList',
        apiVersion: 'v1',
        metadata: { resourceVersion: '20' },
        items: [{ metadata: watchPod('1').metadata }],
      })
    );
    act(() => hook.watch().onMessage({ type: 'ERROR', object: { code: 410 } }));
    await waitFor(() => expect(hook.watch().url()).toContain('resourceVersion=20'));
    expect(hook.result.current.data?.jsonData.kind).toBe('Pod');
    expect(hook.result.current.data?.jsonData.apiVersion).toBe('v1');
  });

  it('reconciles cached-null remounts and continues watching for recreation', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const first = renderWatchedPod();
    await waitFor(() => expect(first.watch().enabled).toBe(true));
    act(() => first.watch().onMessage({ type: 'DELETED', object: watchPod('2') }));
    await waitFor(() => expect(first.result.current.error?.status).toBe(404));
    first.unmount();
    await waitFor(() =>
      expect(first.client.getQueryCache().findAll({ queryKey: ['object-watch'] })).toHaveLength(0)
    );
    mockClusterFetch.mockResolvedValue(
      mockJsonResponse({
        kind: 'PodList',
        apiVersion: 'v1',
        items: [],
        metadata: { resourceVersion: '20' },
      })
    );
    const second = renderWatchedPod(first.client);
    await waitFor(() => {
      expect(second.result.current.error?.status).toBe(404);
      expect(second.watch().enabled).toBe(true);
      expect(second.watch().url()).toContain('resourceVersion=20');
    });
    act(() => second.watch().onMessage({ type: 'ADDED', object: watchPod('21') }));
    await waitFor(() =>
      expect(second.result.current.data?.jsonData.metadata.resourceVersion).toBe('21')
    );
    expect(second.result.current.error).toBeNull();
    expect(mockClusterFetch).toHaveBeenCalledTimes(2);
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
      expect(lastCall.retryWatch).toBe(true);
    });
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
