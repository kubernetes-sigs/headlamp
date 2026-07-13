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
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { ApiError } from './ApiError';
import { clusterFetch } from './fetch';
import { useEndpoints, useKubeObject } from './hooks';
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

const createWrapper = () => {
  const queryClient = new QueryClient({
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

describe('useKubeObject watch wiring', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

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
});
