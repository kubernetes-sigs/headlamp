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

type MultiplexerModule = typeof import('./multiplexer');
type WebSocketModule = typeof import('./webSocket');

vi.mock('./fetch', () => ({
  backendFetch: vi.fn().mockResolvedValue({}),
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
  getBaseWsUrl: () => 'ws://localhost:3000/',
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

  it('tries the next candidate namespace when probing is forbidden in the first', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'gateway.networking.k8s.io', version: 'v1', resource: 'httproutes' },
      { group: 'gateway.networking.k8s.io', version: 'v1beta1', resource: 'httproutes' },
    ];

    mockClusterFetch.mockImplementation(url => {
      if (String(url).includes('/namespaces/a/')) {
        return Promise.reject(new ApiError('Forbidden', { status: 403 }));
      }
      if (url === 'apis/gateway.networking.k8s.io/v1/namespaces/b/httproutes') {
        return Promise.resolve(mockJsonResponse({}));
      }

      return Promise.reject(new ApiError('Not Found', { status: 404 }));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', ['a', 'b']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.endpoint).toEqual(endpoints[0]);
    });
  });

  it('stops candidate namespace fallback when probing is unauthorized', async () => {
    const endpoints: KubeObjectEndpoint[] = [
      { group: 'gateway.networking.k8s.io', version: 'v1', resource: 'httproutes' },
      { group: 'gateway.networking.k8s.io', version: 'v1beta1', resource: 'httproutes' },
    ];
    mockClusterFetch.mockImplementation((url, options) => {
      const endpoint = endpoints.find(
        candidate =>
          String(url) === `apis/${candidate.group}/${candidate.version}/namespaces/a/httproutes`
      );
      if (endpoint) {
        return Promise.reject(new ApiError('Unauthorized', { status: 401 }));
      }
      return Promise.reject(new ApiError(`Unexpected ${options?.method}`, { status: 404 }));
    });

    const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', ['a', 'b']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toMatchObject({ status: 401 }));
    expect(mockClusterFetch).toHaveBeenCalledTimes(endpoints.length);
    expect(
      mockClusterFetch.mock.calls.every(([url]) => String(url).includes('/namespaces/a/'))
    ).toBe(true);
  });

  it.each([
    {
      kind: 'namespaced',
      endpoints: [
        { group: 'gateway.networking.k8s.io', version: 'v1', resource: 'httproutes' },
        { group: 'gateway.networking.k8s.io', version: 'v1beta1', resource: 'httproutes' },
      ],
      url: 'apis/gateway.networking.k8s.io/v1/httproutes',
    },
    {
      kind: 'cluster-scoped',
      endpoints: [
        { group: 'gateway.networking.k8s.io', version: 'v1', resource: 'gatewayclasses' },
        { group: 'gateway.networking.k8s.io', version: 'v1beta1', resource: 'gatewayclasses' },
      ],
      url: 'apis/gateway.networking.k8s.io/v1/gatewayclasses',
    },
  ])(
    'probes the cluster-wide URL for an unfiltered $kind list',
    async ({ endpoints, url: expectedUrl }) => {
      mockClusterFetch.mockImplementation(url =>
        url === expectedUrl
          ? Promise.resolve(mockJsonResponse({}))
          : Promise.reject(new ApiError('Not Found', { status: 404 }))
      );

      const { result } = renderHook(() => useEndpoints(endpoints, 'cluster-a', []), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.endpoint).toEqual(endpoints[0]);
      });
      expect(mockClusterFetch).toHaveBeenCalledWith(expectedUrl, expect.anything());
      expect(mockClusterFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/namespaces/'),
        expect.anything()
      );
    }
  );

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWebSocket.mockReset();
    mockUseWebSockets.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe.each([true, false])('ordered watch reconciliation (multiplexer=%s)', multiplexer => {
    const watchFor = (hook: ReturnType<typeof renderWatchedPod>) => {
      if (multiplexer) return hook.watch();
      const request = mockUseWebSockets.mock.calls.at(-1)![0];
      return { ...request.connections[0], enabled: request.enabled };
    };

    it.each(['fetched', 'cached', 'seeded'])(
      'reconciles an absent %s object after the empty-cursor watch connects',
      async source => {
        vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
        mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const object = new MockPod(watchPod('1'), 'test');
        const queryKey = kubeObjectQueryKey({
          cluster: 'test',
          endpoint: MockPod.apiEndpoint.apiInfo[0],
          namespace: 'my-ns',
          name: 'my-pod',
        });
        if (source === 'cached') client.setQueryData(queryKey, object);
        const hook = renderHook(
          () =>
            useKubeObject({
              kubeObjectClass: MockPod,
              cluster: 'test',
              namespace: 'my-ns',
              name: 'my-pod',
              initialData: source === 'seeded' ? object : undefined,
            }),
          { wrapper: createWrapper(client) }
        );
        onTestFinished(async () => {
          hook.unmount();
          await client.cancelQueries();
          client.clear();
        });
        const watch = () => {
          if (multiplexer) return mockUseWebSocket.mock.calls.at(-1)![0];
          const request = mockUseWebSockets.mock.calls.at(-1)![0];
          return { ...request.connections[0], enabled: request.enabled };
        };
        await waitFor(() => expect(watch().enabled).toBe(true));
        expect(hook.result.current.data).not.toBeNull();
        const beforeReady = mockClusterFetch.mock.calls.length;
        mockClusterFetch.mockRejectedValue(new ApiError('No longer exists', { status: 404 }));
        act(() => watch().onReady());
        await waitFor(() => expect(hook.result.current.error?.status).toBe(404));
        expect(mockClusterFetch).toHaveBeenCalledTimes(beforeReady + 1);
        expect(
          mockClusterFetch.mock.calls.every(
            ([url]) => url === 'multiplexer-auth' || String(url).endsWith('/pods/my-pod')
          )
        ).toBe(true);
        expect(client.getQueryState(queryKey)?.status).toBe('success');
        expect(hook.result.current.data).toBeNull();
        expect(watch().enabled).toBe(true);
        act(() => watch().onMessage({ type: 'ADDED', object: watchPod('3') }));
        await waitFor(() =>
          expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('3')
        );
        expect(hook.result.current.error).toBeNull();
      }
    );

    it.each(['DELETED', 'MODIFIED'])(
      'does not let a successful GET overwrite an intervening %s event',
      async type => {
        vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
        mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
        const hook = renderWatchedPod();
        const watch = () => watchFor(hook);
        await waitFor(() => expect(watch().enabled).toBe(true));
        let finishGet!: (response: Response) => void;
        mockClusterFetch.mockImplementationOnce(
          () =>
            new Promise(resolve => {
              finishGet = resolve;
            })
        );
        let refetch!: Promise<void>;
        act(() => {
          refetch = hook.client.invalidateQueries({ queryKey: ['object'] });
        });
        await waitFor(() => expect(finishGet).toBeDefined());
        act(() => watch().onMessage({ type, object: watchPod('2') }));
        await waitFor(() =>
          type === 'DELETED'
            ? expect(hook.result.current.error?.status).toBe(404)
            : expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('2')
        );
        const current = hook.result.current.data;
        const cursor = multiplexer ? watch().url() : watch().reconnectUrl();
        await act(async () => {
          finishGet(mockJsonResponse(watchPod('1')));
          await refetch;
        });
        expect(
          hook.client.getQueryCache().find({ queryKey: ['object'], exact: false })?.state.data
        ).toBe(current);
        expect(hook.result.current.data).toBe(current);
        expect(hook.result.current.error?.status).toBe(type === 'DELETED' ? 404 : undefined);
        expect(watch().enabled).toBe(true);
        expect(multiplexer ? watch().url() : watch().reconnectUrl()).toBe(cursor);
        act(() => watch().onMessage({ type: 'ADDED', object: watchPod('3') }));
        await waitFor(() =>
          expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('3')
        );
      }
    );

    it('keeps a deletion authoritative across BOOKMARK events', async () => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => watchFor(hook);
      await waitFor(() => expect(watch().enabled).toBe(true));

      act(() => watch().onMessage({ type: 'DELETED', object: watchPod('2') }));
      await waitFor(() => expect(hook.result.current.error?.status).toBe(404));
      act(() =>
        watch().onMessage({
          type: 'BOOKMARK',
          object: { metadata: { resourceVersion: '3' } },
        })
      );

      expect(hook.result.current.data).toBeNull();
      expect(hook.result.current.error?.status).toBe(404);
      if (!multiplexer) expect(watch().reconnectUrl()).toContain('resourceVersion=3');
    });

    it('does not let BOOKMARK discard an in-flight full GET', async () => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => watchFor(hook);
      await waitFor(() => expect(watch().enabled).toBe(true));
      let finishGet!: (response: Response) => void;
      mockClusterFetch.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishGet = resolve;
          })
      );
      let refetch!: Promise<void>;
      act(() => {
        refetch = hook.client.invalidateQueries({ queryKey: ['object'] });
      });
      await waitFor(() => expect(finishGet).toBeDefined());
      act(() =>
        watch().onMessage({
          type: 'BOOKMARK',
          object: { metadata: { resourceVersion: '9' } },
        })
      );
      await act(async () => {
        finishGet(mockJsonResponse(watchPod('2')));
        await refetch;
      });

      await waitFor(() =>
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('2')
      );
      expect(hook.result.current.error).toBeNull();
    });

    it('retains the cached object and surfaces a failed post-watch check', async () => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => watchFor(hook);
      await waitFor(() => expect(watch().enabled).toBe(true));
      const loaded = hook.result.current.data;
      const forbidden = new ApiError('Cannot check the object', { status: 403 });
      mockClusterFetch.mockRejectedValue(forbidden);
      act(() => watch().onReady());
      await waitFor(() => expect(hook.result.current.error).toBe(forbidden));
      expect(hook.result.current.data).toBe(loaded);
      expect(watch().enabled).toBe(false);
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('3')));
      await act(async () => {
        await hook.client.invalidateQueries({ queryKey: ['object'] });
      });
      await waitFor(() => expect(hook.result.current.error).toBeNull());
      expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('3');
      expect(watch().enabled).toBe(true);
    });

    it('keeps an initialized watch after GET reports 404 before DELETED arrives', async () => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => watchFor(hook);
      await waitFor(() => expect(watch().enabled).toBe(true));
      act(() => watch().onReady());
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hook.result.current.error).toBeNull());

      mockClusterFetch.mockRejectedValue(
        new ApiError('GET missing before watch event', { status: 404 })
      );
      await act(async () => {
        await hook.client.invalidateQueries({ queryKey: ['object'] });
      });
      await waitFor(() => expect(hook.result.current.error?.status).toBe(404));
      expect(
        hook.client.getQueryCache().find({ queryKey: ['object'], exact: false })?.state.status
      ).toBe('success');
      expect(watch().enabled).toBe(true);
      act(() => watch().onMessage({ type: 'ADDED', object: watchPod('3') }));
      await waitFor(() =>
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('3')
      );
      expect(hook.result.current.error).toBeNull();
    });

    it.each(['ADDED', 'MODIFIED'])(
      'retires queued %s after a newly absent GET without renewing repeated absence',
      async type => {
        vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
        mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('opaque-before')));
        const hook = renderWatchedPod();
        const watch = () => watchFor(hook);
        await waitFor(() => expect(watch().enabled).toBe(true));
        const retired = watch();
        mockClusterFetch.mockRejectedValue(new ApiError('Missing', { status: 404 }));
        await act(async () => {
          await hook.client.invalidateQueries({ queryKey: ['object'] });
        });
        await waitFor(() => expect(hook.result.current.error?.status).toBe(404));
        const missing = hook.result.current.error;
        const ready = watch().onReady;
        act(() => retired.onMessage({ type, object: watchPod('queued-old') }));
        expect(hook.client.getQueriesData({ queryKey: ['object'] })[0][1]).toBeNull();
        expect(hook.result.current.error).toBe(missing);
        act(() => watch().onReady());
        await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
        expect(watch().onReady).toBe(ready);
        expect(hook.result.current.error).toBe(missing);
        act(() => watch().onMessage({ type: 'ADDED', object: watchPod('real-recreation') }));
        await waitFor(() =>
          expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe(
            'real-recreation'
          )
        );
        expect(hook.result.current.error).toBeNull();
      }
    );

    it.each(['cached', 'seeded'])(
      'renews a changed %s post-connect snapshot without watching its compacted last-write RV',
      async source => {
        vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const queryKey = kubeObjectQueryKey({
          cluster: 'test',
          endpoint: MockPod.apiEndpoint.apiInfo[0],
          namespace: 'my-ns',
          name: 'my-pod',
        });
        const seed = new MockPod(watchPod('opaque-seed'), 'test');
        if (source === 'cached') client.setQueryData(queryKey, seed);
        mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('compacted-last-write')));
        const hook = renderHook(
          () =>
            useKubeObject({
              kubeObjectClass: MockPod,
              cluster: 'test',
              namespace: 'my-ns',
              name: 'my-pod',
              initialData: source === 'seeded' ? seed : undefined,
            }),
          { wrapper: createWrapper(client) }
        );
        onTestFinished(async () => {
          hook.unmount();
          await client.cancelQueries();
          client.clear();
        });
        const watch = () =>
          watchFor({ ...hook, client, watch: () => mockUseWebSocket.mock.calls.at(-1)![0] });
        await waitFor(() => expect(watch().enabled).toBe(true));
        const retired = watch();
        act(() => retired.onReady());
        await waitFor(() =>
          expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe(
            'compacted-last-write'
          )
        );
        const url = multiplexer ? watch().url() : watch().url;
        expect(new URL(url, 'http://localhost').searchParams.get('resourceVersion')).toBe('');
        act(() => retired.onMessage({ type: 'ADDED', object: watchPod('opaque-seed') }));
        expect(client.getQueryData(queryKey)).toBe(hook.result.current.data);
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe(
          'compacted-last-write'
        );
        expect(
          mockClusterFetch.mock.calls.every(([url]) => String(url).endsWith('/pods/my-pod'))
        ).toBe(true);
      }
    );

    it.each(['pending', 'failed'])(
      'does not let a joining seed overwrite a %s post-connect check',
      async phase => {
        vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
        mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('loaded')));
        const first = renderWatchedPod();
        const watch = () => watchFor(first);
        await waitFor(() => expect(watch().enabled).toBe(true));
        const loaded = first.result.current.data;
        const forbidden = new ApiError('Cannot reconcile', { status: 403 });
        let finish!: (response: Response) => void;
        mockClusterFetch.mockImplementation(
          () =>
            new Promise(resolve => {
              finish = resolve;
            })
        );
        if (phase === 'failed') mockClusterFetch.mockRejectedValue(forbidden);
        act(() => watch().onReady());
        await waitFor(() =>
          phase === 'failed'
            ? expect(first.result.current.error).toBe(forbidden)
            : expect(finish).toBeDefined()
        );
        const seed = new MockPod(watchPod('stale-seed'), 'test');
        const second = renderHook(
          () =>
            useKubeObject({
              kubeObjectClass: MockPod,
              cluster: 'test',
              namespace: 'my-ns',
              name: 'my-pod',
              initialData: seed,
            }),
          { wrapper: createWrapper(first.client) }
        );
        onTestFinished(() => second.unmount());
        expect(first.client.getQueriesData({ queryKey: ['object'] })[0][1]).toBe(loaded);
        await waitFor(() => expect(second.result.current.data).toBe(loaded));
        expect(second.result.current.error).toBe(phase === 'failed' ? forbidden : null);
        if (phase === 'failed') expect(watch().enabled).toBe(false);
        mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('reconciled')));
        await act(async () => {
          if (phase === 'pending') finish(mockJsonResponse(watchPod('reconciled')));
          else await first.client.invalidateQueries({ queryKey: ['object'] });
        });
        await waitFor(() => expect(first.result.current.error).toBeNull());
        await waitFor(() =>
          expect(second.result.current.data?.jsonData.metadata.resourceVersion).toBe('reconciled')
        );
      }
    );

    it.each(['absent', 'changed'])(
      'fences real transport sessions after an empty-cursor GET is %s',
      async snapshot => {
        vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
        const realMultiplexer = await vi.importActual<MultiplexerModule>('./multiplexer');
        const realLegacy = await vi.importActual<WebSocketModule>('./webSocket');
        mockUseWebSocket.mockImplementation(realMultiplexer.useWebSocket);
        mockUseWebSockets.mockImplementation(realLegacy.useWebSockets);
        const created: ControlledSocket[] = [];
        const expiredCursors: string[] = [];
        class ControlledSocket extends EventTarget {
          static OPEN = 1;
          readyState = 0;
          binaryType = '';
          protocol = 'headlamp.multiplexer.v2.k8s.io';
          onopen: (() => void) | null = null;
          onclose: ((event: CloseEvent) => void) | null = null;
          onmessage: ((event: MessageEvent) => void) | null = null;
          sent: Array<{ type: string; clusterId: string; path: string; query: string }> = [];
          constructor(public url: string) {
            super();
            created.push(this);
          }
          open() {
            this.readyState = 1;
            this.onopen?.();
            this.dispatchEvent(new Event('open'));
            if (!multiplexer) this.checkCursor(new URL(this.url).searchParams);
          }
          close() {
            this.readyState = 3;
            const event = new CloseEvent('close', { code: 1000 });
            this.onclose?.(event);
            this.dispatchEvent(event);
          }
          send(message: string) {
            const request = JSON.parse(message);
            this.sent.push(request);
            if (request.type === 'REQUEST') this.checkCursor(new URLSearchParams(request.query));
          }
          checkCursor(query: URLSearchParams) {
            if (query.get('resourceVersion') === 'compacted-last-write') {
              expiredCursors.push('compacted-last-write');
              this.message({ type: 'ERROR', object: { code: 410 } });
            }
          }
          message(update: unknown) {
            const request = this.sent.find(it => it.type === 'REQUEST');
            const data = multiplexer
              ? { ...request, type: 'DATA', data: JSON.stringify(update) }
              : update;
            this.receive(data);
          }
          receive(data: unknown) {
            const event = new MessageEvent('message', { data: JSON.stringify(data) });
            this.onmessage?.(event);
            this.dispatchEvent(event);
          }
        }
        vi.stubGlobal('WebSocket', ControlledSocket);
        mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('seed')));
        const hook = renderWatchedPod();
        const open = async (socket: ControlledSocket) => {
          act(() => socket.open());
          if (multiplexer) {
            await waitFor(() => expect(socket.sent.some(it => it.type === 'REQUEST')).toBe(true));
            const request = socket.sent.find(it => it.type === 'REQUEST')!;
            expect(new URLSearchParams(request.query).get('resourceVersion')).toBe('');
            act(() => {
              socket.receive({ ...request, type: 'ACK' });
              socket.receive({
                ...request,
                type: 'STATUS',
                data: JSON.stringify({ state: 'connected' }),
              });
            });
          } else {
            expect(new URL(socket.url).searchParams.get('resourceVersion')).toBe('');
          }
        };
        try {
          await waitFor(() => expect(created).toHaveLength(1));
          mockClusterFetch.mockImplementation(url => {
            if (!String(url).endsWith('/pods/my-pod')) {
              return Promise.reject(new ApiError('LIST is forbidden', { status: 403 }));
            }
            return snapshot === 'absent'
              ? Promise.reject(new ApiError('Missing', { status: 404 }))
              : Promise.resolve(mockJsonResponse(watchPod('compacted-last-write')));
          });
          await open(created[0]);
          await waitFor(() => expect(created).toHaveLength(2));
          await open(created[1]);
          await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
          const accepted = hook.result.current.data;
          const error = hook.result.current.error;
          act(() => created[0].message({ type: 'MODIFIED', object: watchPod('queued-old') }));
          expect(hook.client.getQueriesData({ queryKey: ['object'] })[0][1]).toBe(accepted);
          expect(hook.result.current.error).toBe(error);
          expect(created).toHaveLength(2);
          expect(expiredCursors).toEqual([]);
          expect(
            mockClusterFetch.mock.calls.every(
              ([url]) => url === 'multiplexer-auth' || String(url).endsWith('/pods/my-pod')
            )
          ).toBe(true);
          act(() => created[1].message({ type: 'ADDED', object: watchPod('recreated') }));
          await waitFor(() =>
            expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('recreated')
          );
          expect(hook.result.current.error).toBeNull();
        } finally {
          hook.unmount();
          await hook.client.cancelQueries();
          hook.client.clear();
          await waitFor(() =>
            expect(realMultiplexer.WebSocketManager.activeSubscriptions.size).toBe(0)
          );
          realMultiplexer.WebSocketManager.handleWebSocketClose();
          for (const socket of created) socket.close();
        }
      }
    );

    it('renews a stream after GET accepts a newer snapshot during backoff', async () => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => watchFor(hook);
      await waitFor(() => expect(watch().enabled).toBe(true));
      act(() => watch().onMessage({ type: 'MODIFIED', object: watchPod('2') }));
      await waitFor(() =>
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('2')
      );
      const retired = watch();
      act(() => retired.onError(new Error('Watch is backing off')));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('4')));
      await act(async () => {
        await hook.client.invalidateQueries({ queryKey: ['object'] });
      });
      await waitFor(() =>
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('4')
      );
      const accepted = hook.result.current.data;
      act(() => retired.onMessage({ type: 'MODIFIED', object: watchPod('3') }));
      expect(
        hook.client.getQueryCache().find({ queryKey: ['object'], exact: false })?.state.data
      ).toBe(accepted);
      const url = multiplexer ? watch().url() : watch().url;
      expect(url).toContain('resourceVersion=4');
      act(() => watch().onMessage({ type: 'MODIFIED', object: watchPod('5') }));
      await waitFor(() =>
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('5')
      );
    });
  });

  it('shares an in-flight post-connect check across observers without cancelling it', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const first = renderWatchedPod();
    await waitFor(() => expect(first.watch().enabled).toBe(true));
    const firstReady = first.watch().onReady;
    const second = renderWatchedPod(first.client);
    await waitFor(() => expect(second.result.current.data).not.toBeNull());
    const secondReady = second.watch().onReady;
    const callsBefore = mockClusterFetch.mock.calls.length;
    let finishCheck!: (response: Response) => void;
    mockClusterFetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishCheck = resolve;
        })
    );
    act(() => {
      firstReady();
      secondReady();
    });
    await waitFor(() => expect(finishCheck).toBeDefined());
    expect(mockClusterFetch).toHaveBeenCalledTimes(callsBefore + 1);
    expect(mockClusterFetch.mock.calls.at(-1)![1]?.signal?.aborted).toBe(false);
    await act(async () => {
      finishCheck(mockJsonResponse(watchPod('2')));
    });
    await waitFor(() =>
      expect(first.result.current.data?.jsonData.metadata.resourceVersion).toBe('2')
    );
    expect(second.result.current.data).toBe(first.result.current.data);
  });

  it.each([false, true])(
    'recovers an opaque legacy handshake failure with a fresh LIST (failure=%s)',
    async failure => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => {
        const request = mockUseWebSockets.mock.calls.at(-1)![0];
        return { ...request.connections[0], enabled: request.enabled };
      };
      await waitFor(() => expect(watch().enabled).toBe(true));
      const loaded = hook.result.current.data;
      const forbidden = new ApiError('Cannot obtain a recovery snapshot', { status: 403 });
      if (failure) mockClusterFetch.mockRejectedValue(forbidden);
      else
        mockClusterFetch.mockResolvedValue(
          mockJsonResponse({
            kind: 'PodList',
            apiVersion: 'v1',
            items: [watchPod('1')],
            metadata: { resourceVersion: '20' },
          })
        );
      await act(async () => {
        await watch().onRecoveryNeeded();
      });
      const url = new URL(String(mockClusterFetch.mock.calls.at(-1)![0]), 'http://localhost');
      expect(url.pathname).toBe('/api/v1/namespaces/my-ns/pods');
      expect(url.searchParams.get('fieldSelector')).toBe('metadata.name=my-pod');
      if (failure) {
        await waitFor(() => expect(hook.result.current.error).toBe(forbidden));
        expect(hook.result.current.data).toBe(loaded);
        expect(watch().enabled).toBe(false);
      } else {
        await waitFor(() => expect(watch().url).toContain('resourceVersion=20'));
        expect(hook.result.current.error).toBeNull();
        act(() => watch().onMessage({ type: 'MODIFIED', object: watchPod('21') }));
        await waitFor(() =>
          expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('21')
        );
      }
    }
  );

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
    expect(watch().url()).toMatch(/resourceVersion=(?:&|$)/);
    act(() => watch().onMessage({ type: 'ADDED', object: pod('2') }));
    await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('2'));
    expect(watch().url()).toMatch(/resourceVersion=(?:&|$)/);
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
            queryParams: { limit: 1, continue: 'caller-token' },
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
      const recoveryUrl = new URL(
        String(
          mockClusterFetch.mock.calls.find(([url]) => String(url).includes('fieldSelector='))![0]
        ),
        'http://localhost'
      );
      expect(recoveryUrl.searchParams.has('limit')).toBe(false);
      expect(recoveryUrl.searchParams.has('continue')).toBe(false);
      expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('1');
      act(() =>
        retiredWatch.onMessage({
          type: 'MODIFIED',
          object: { ...pod, metadata: { ...pod.metadata, resourceVersion: '2' } },
        })
      );
      expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('1');
      await act(async () => {
        await client.refetchQueries({ queryKey: ['object'] });
      });
      expect(watch().url).toContain('resourceVersion=20');
      if (enabled === 'false') {
        act(() =>
          watch().onMessage({
            type: 'MODIFIED',
            object: { ...pod, metadata: { ...pod.metadata, resourceVersion: '21' } },
          })
        );
        await waitFor(() =>
          expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('21')
        );
        expect(watch().url).toContain('resourceVersion=20');
        expect(watch().reconnectUrl()).toContain('resourceVersion=21');
      }
      act(() => watch().onMessage({ type: 'DELETED', object: pod }));
      await waitFor(() => expect(result.current.error?.status).toBe(404));
      expect(watch().enabled).toBe(true);
      act(() => watch().onMessage({ type: 'ADDED', object: pod }));
      await waitFor(() => expect(result.current.error).toBeNull());
      mockClusterFetch.mockRejectedValue(new ApiError('Forbidden', { status: 403 }));
      const previousWatch = watch();
      await act(async () => {
        await client.refetchQueries({ queryKey: ['object'] });
      });
      await waitFor(() => expect(watch().enabled).toBe(false));
      act(() => previousWatch.onMessage({ type: 'MODIFIED', object: pod }));
      expect(result.current.error?.status).toBe(403);
      expect(result.current.data).toBeNull();
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
      expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).toMatch(/resourceVersion=(?:&|$)/)
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
    'opens fetched and seeded object watches with an empty cursor (seeded=%s)',
    async seeded => {
      const pod = new MockPod(
        { metadata: { name: 'my-pod', namespace: 'my-ns', resourceVersion: '1' } },
        'test'
      );
      mockClusterFetch.mockResolvedValue(mockJsonResponse(pod.jsonData));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { unmount, result } = renderHook(
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
      expect(legacyUrl).toMatch(/resourceVersion=(?:&|$)/);
      expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).toMatch(/resourceVersion=(?:&|$)/);
      const onMessage = mockUseWebSockets.mock.calls.at(-1)![0].connections[0].onMessage;
      act(() => onMessage({ type: 'ADDED', object: watchPod('7') }));
      await waitFor(() => expect(result.current.data?.jsonData.metadata.resourceVersion).toBe('7'));
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
    expect(
      new URL(mockUseWebSocket.mock.calls.at(-1)![0].url(), 'http://localhost').searchParams.get(
        'resourceVersion'
      )
    ).toBe('');
    unmount();
    await client.cancelQueries();
    client.clear();
  });

  it('opens at current state with cached data after all observers unmount', async () => {
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
      expect(mockUseWebSocket.mock.calls.at(-1)![0].url()).toMatch(/resourceVersion=(?:&|$)/)
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
    expect(hook.watch().url()).toMatch(/resourceVersion=(?:&|$)/);
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

  it.each(['deletion', 'empty relist'])(
    'preserves a recreation watch through a GET 404 after %s',
    async missingSource => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      await waitFor(() => expect(hook.watch().enabled).toBe(true));
      if (missingSource === 'deletion') {
        act(() => hook.watch().onMessage({ type: 'DELETED', object: watchPod('2') }));
      } else {
        mockClusterFetch.mockResolvedValue(
          mockJsonResponse({
            kind: 'PodList',
            items: [],
            metadata: { resourceVersion: '20' },
          })
        );
        act(() => hook.watch().onMessage({ type: 'ERROR', object: { code: 410 } }));
      }
      await waitFor(() => expect(hook.result.current.error?.status).toBe(404));
      const url = hook.watch().url();
      mockClusterFetch.mockRejectedValue(new ApiError('GET pod not found', { status: 404 }));
      await act(async () => {
        await hook.client.invalidateQueries({ queryKey: ['object'] });
      });
      expect(hook.watch().enabled).toBe(true);
      expect(hook.watch().url()).toBe(url);
      expect(hook.result.current.data).toBeNull();
      act(() => hook.watch().onMessage({ type: 'ADDED', object: watchPod('21') }));
      await waitFor(() =>
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('21')
      );
      expect(hook.result.current.error).toBeNull();
    }
  );

  it.each([true, false])(
    'preserves recreation when a missing-object GET settles with a late 404 (multiplexer=%s)',
    async multiplexer => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => {
        if (multiplexer) return hook.watch();
        const request = mockUseWebSockets.mock.calls.at(-1)![0];
        return { ...request.connections[0], enabled: request.enabled };
      };
      await waitFor(() => expect(watch().enabled).toBe(true));
      act(() => watch().onMessage({ type: 'DELETED', object: watchPod('2') }));
      await waitFor(() => expect(hook.result.current.error?.status).toBe(404));

      let rejectGet!: (error: ApiError) => void;
      mockClusterFetch.mockImplementationOnce(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectGet = reject;
          })
      );
      let refetch!: Promise<void>;
      act(() => {
        refetch = hook.client.invalidateQueries({ queryKey: ['object'] });
      });
      await waitFor(() => expect(rejectGet).toBeDefined());

      act(() => watch().onMessage({ type: 'ADDED', object: watchPod('3') }));
      await waitFor(() => expect(hook.result.current.error).toBeNull());
      const recreated = hook.result.current.data;
      const cursor = multiplexer ? watch().url() : watch().reconnectUrl();
      await act(async () => {
        rejectGet(new ApiError('Not found', { status: 404 }));
        await refetch;
      });

      expect(
        hook.client.getQueryCache().find({ queryKey: ['object'], exact: false })?.state.status
      ).toBe('success');
      expect(hook.result.current.error).toBeNull();
      expect(hook.result.current.data).toBe(recreated);
      expect(watch().enabled).toBe(true);
      expect(multiplexer ? watch().url() : watch().reconnectUrl()).toBe(cursor);
      act(() => watch().onMessage({ type: 'MODIFIED', object: watchPod('4') }));
      await waitFor(() =>
        expect(hook.result.current.data?.jsonData.metadata.resourceVersion).toBe('4')
      );
    }
  );

  it('keeps the shared recovery error and last object when a seeded observer joins', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('5')));
    const hook = renderWatchedPod();
    await waitFor(() => expect(hook.watch().enabled).toBe(true));
    mockClusterFetch.mockRejectedValue(new ApiError('Cannot list pods', { status: 403 }));
    act(() => hook.watch().onMessage({ type: 'ERROR', object: { code: 410 } }));
    await waitFor(() => expect(hook.result.current.error?.status).toBe(403));
    const seed = new MockPod(watchPod('1'), 'test');
    const second = renderHook(
      () =>
        useKubeObject({
          kubeObjectClass: MockPod,
          name: 'my-pod',
          namespace: 'my-ns',
          cluster: 'test',
          initialData: seed,
        }),
      { wrapper: createWrapper(hook.client) }
    );
    await waitFor(() => expect(second.result.current.error?.status).toBe(403));
    expect(second.result.current.data?.jsonData.metadata.resourceVersion).toBe('5');
    expect(hook.watch().enabled).toBe(false);
  });

  it.each([true, false])(
    'keeps a loaded object successful while reporting a stopped watch (multiplexer=%s)',
    async multiplexer => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const hook = renderWatchedPod();
      const watch = () => {
        if (multiplexer) return hook.watch();
        const request = mockUseWebSockets.mock.calls.at(-1)![0];
        return { ...request.connections[0], enabled: request.enabled };
      };
      await waitFor(() => expect(watch().enabled).toBe(true));
      const loaded = hook.result.current.data;
      act(() => watch().onError(new Error('Watch reconnect failed')));
      await waitFor(() =>
        expect(hook.result.current.error?.message).toBe('Watch reconnect failed')
      );
      expect(hook.result.current.data).toBe(loaded);
      expect(hook.result.current.isError).toBe(false);
      expect(hook.result.current.isSuccess).toBe(true);
      expect(hook.result.current.status).toBe('success');
      expect([...hook.result.current]).toEqual([loaded, hook.result.current.error]);
      act(() => watch().onReady());
      await waitFor(() => expect(hook.result.current.error).toBeNull());
      expect(hook.result.current.isSuccess).toBe(true);
    }
  );

  it('does not let a transport warning hide an authoritative deletion', async () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
    const hook = renderWatchedPod();
    await waitFor(() => expect(hook.watch().enabled).toBe(true));
    act(() => hook.watch().onError(new Error('Watch reconnect failed')));
    await waitFor(() => expect(hook.result.current.error?.message).toBe('Watch reconnect failed'));
    act(() => hook.watch().onMessage({ type: 'DELETED', object: watchPod('2') }));
    await waitFor(() => expect(hook.result.current.data).toBeNull());
    expect(hook.result.current.error?.status).toBe(404);
    expect(hook.result.current.isError).toBe(true);
    expect(hook.result.current.isSuccess).toBe(false);
    expect(hook.result.current.status).toBe('error');
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

  it.each([true, false])(
    'remounts a cached deletion without LIST permission (multiplexer=%s)',
    async multiplexer => {
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', String(multiplexer));
      mockClusterFetch.mockResolvedValue(mockJsonResponse(watchPod('1')));
      const first = renderWatchedPod();
      const watch = (hook: ReturnType<typeof renderWatchedPod>) => {
        if (multiplexer) return hook.watch();
        const request = mockUseWebSockets.mock.calls.at(-1)![0];
        return { ...request.connections[0], enabled: request.enabled };
      };
      await waitFor(() => expect(watch(first).enabled).toBe(true));
      act(() => watch(first).onMessage({ type: 'DELETED', object: watchPod('2') }));
      await waitFor(() => expect(first.result.current.error?.status).toBe(404));
      first.unmount();
      await waitFor(() =>
        expect(first.client.getQueryCache().findAll({ queryKey: ['object-watch'] })).toHaveLength(0)
      );
      mockClusterFetch.mockImplementation(url =>
        Promise.reject(
          new ApiError(
            String(url).includes('fieldSelector=')
              ? 'LIST is forbidden'
              : 'Object is still missing',
            { status: String(url).includes('fieldSelector=') ? 403 : 404 }
          )
        )
      );
      const second = renderWatchedPod(first.client);
      await waitFor(() => {
        expect(second.result.current.error?.status).toBe(404);
        expect(watch(second).enabled).toBe(true);
        const url = multiplexer ? watch(second).url() : watch(second).url;
        expect(url).toMatch(/resourceVersion=(?:&|$)/);
      });
      act(() => watch(second).onReady());
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(second.result.current.error?.status).toBe(404));
      expect(
        mockClusterFetch.mock.calls.every(([url]) => !String(url).includes('fieldSelector='))
      ).toBe(true);
      expect(watch(second).enabled).toBe(true);
      act(() => watch(second).onMessage({ type: 'ADDED', object: watchPod('21') }));
      await waitFor(() =>
        expect(second.result.current.data?.jsonData.metadata.resourceVersion).toBe('21')
      );
      expect(second.result.current.error).toBeNull();
      expect(mockClusterFetch).toHaveBeenCalledTimes(2);
    }
  );

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
