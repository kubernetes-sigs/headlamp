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

import '../../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { clusterFetch } from '../../../lib/k8s/api/v2/fetch';
import { kubeObjectQueryKey } from '../../../lib/k8s/api/v2/hooks';
import ConfigMap from '../../../lib/k8s/configMap';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import { DetailsGrid } from './Resource';

const { mockUseWebSocket } = vi.hoisted(() => ({ mockUseWebSocket: vi.fn() }));

vi.mock('../../../lib/k8s/api/v2/fetch', () => ({ clusterFetch: vi.fn() }));
vi.mock('../../../lib/k8s/api/v2/multiplexer', () => ({
  useWebSocket: mockUseWebSocket,
  WebSocketManager: { subscribe: vi.fn().mockResolvedValue(() => {}) },
}));
vi.mock('../../../lib/k8s/api/v2/webSocket', () => ({
  useWebSockets: vi.fn(),
  BASE_WS_URL: 'http://localhost:3000',
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it('keeps loaded resource details visible beside a watch recovery error', async () => {
  vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
  const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'my-cm',
      namespace: 'default',
      resourceVersion: '1',
      creationTimestamp: '2026-11-19T12:00:00Z',
    },
    data: { setting: 'retained-setting' },
  };
  vi.mocked(clusterFetch).mockResolvedValue({
    json: async () => configMap,
  } as Response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createMuiTheme({ base: 'light', name: 'light' })}>
        <TestContext>
          <DetailsGrid
            resourceType={ConfigMap}
            name="my-cm"
            namespace="default"
            cluster="test"
            noDefaultActions
            headerSection={item => <span>{item?.data?.setting}</span>}
          />
        </TestContext>
      </ThemeProvider>
    </QueryClientProvider>
  );
  try {
    await screen.findByText('retained-setting');
    const forbidden = new ApiError('User cannot list configmaps in namespace default', {
      status: 403,
    });
    vi.mocked(clusterFetch).mockRejectedValue(forbidden);
    act(() => {
      mockUseWebSocket.mock.calls.at(-1)![0].onMessage({
        type: 'ERROR',
        object: { code: 410 },
      });
    });
    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(forbidden.message);
    expect(screen.getByText('retained-setting')).toBeInTheDocument();
    expect(mockUseWebSocket.mock.calls.at(-1)![0].enabled).toBe(false);

    vi.mocked(clusterFetch).mockResolvedValue({
      json: async () => ({ items: [configMap], metadata: { resourceVersion: '20' } }),
    } as Response);
    await act(async () => {
      await client.invalidateQueries({
        queryKey: kubeObjectQueryKey({
          cluster: 'test',
          endpoint: ConfigMap.apiEndpoint.apiInfo[0],
          name: 'my-cm',
          namespace: 'default',
        }),
        exact: true,
      });
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('retained-setting')).toBeInTheDocument();
    expect(mockUseWebSocket.mock.calls.at(-1)![0].enabled).toBe(true);
  } finally {
    view.unmount();
    await client.cancelQueries();
    client.clear();
  }
});
