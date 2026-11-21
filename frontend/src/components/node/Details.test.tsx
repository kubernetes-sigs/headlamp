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

import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { drainNodeStatusForResource } from '../../lib/k8s/api/v1/drainNode';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import * as discoveredRevisions from '../../lib/k8s/api/v2/discoveredConnectionRevisions';
import { recordDiscoveryConnection } from '../../lib/k8s/api/v2/discoveryConnection';
import * as fetchModule from '../../lib/k8s/api/v2/fetch';
import Node from '../../lib/k8s/node';
import { createMuiTheme } from '../../lib/themes';
import { CLUSTER_ACTION_GRACE_PERIOD } from '../../redux/clusterActionSlice';
import { setConfig } from '../../redux/configSlice';
import reducers from '../../redux/reducers/reducers';
import appStore from '../../redux/stores/store';
import { TestContext } from '../../test';
import Details from './Details';
import { NODE_DETAILED_DATA } from './storyHelper';

vi.mock('../common/Resource/AuthVisible', () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function nodeResult(node: Node) {
  const result: [Node, null] = [node, null];
  return Object.assign(result, {
    data: node,
    error: null,
    isError: false,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    status: 'success' as const,
  });
}

it('keeps the originally selected connection when confirming a drain', async () => {
  vi.useFakeTimers();
  const cluster = 'discovered';
  const originalNode = new Node(NODE_DETAILED_DATA, cluster);
  const replacementNode = new Node(NODE_DETAILED_DATA, cluster);
  const revision = vi
    .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
    .mockReturnValue('original:1');
  recordDiscoveryConnection(originalNode, cluster, 'original:1');
  recordDiscoveryConnection(replacementNode, cluster, 'original:2');

  const useGet = vi.spyOn(Node, 'useGet').mockReturnValue(nodeResult(originalNode));
  vi.spyOn(Node, 'useMetrics').mockReturnValue([null, null]);
  vi.spyOn(Node, 'useNodeSummaryStats').mockReturnValue([null, null]);
  const clusterFetch = vi
    .spyOn(fetchModule, 'clusterFetch')
    .mockRejectedValue(new ApiError('Discovered cluster connection changed', { status: 409 }));

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({ reducer: reducers });
  const theme = createMuiTheme({ base: 'light', name: 'light' });
  const page = () => (
    <QueryClientProvider client={queryClient}>
      <TestContext store={store}>
        <ThemeProvider theme={theme}>
          <Details cluster={cluster} name={originalNode.getName()} />
        </ThemeProvider>
      </TestContext>
    </QueryClientProvider>
  );
  const { rerender } = render(page());
  fireEvent.click(screen.getByRole('button', { name: 'Drain' }));

  revision.mockReturnValue('original:2');
  useGet.mockReturnValue(nodeResult(replacementNode));
  rerender(page());
  fireEvent.click(screen.getByTestId('confirm-button'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CLUSTER_ACTION_GRACE_PERIOD);
  });

  const drainRequests = clusterFetch.mock.calls.filter(([path]) =>
    path.toString().startsWith('/drain-node?')
  );
  expect(drainRequests).toHaveLength(0);
  expect(Object.values(store.getState().clusterAction)).toEqual([
    expect.objectContaining({
      state: 'error',
      message: expect.stringContaining('Discovered cluster connection changed'),
    }),
  ]);
});

it('polls drain status for the connection that started the drain', async () => {
  const cluster = 'discovered';
  const node = new Node(NODE_DETAILED_DATA, cluster);
  vi.spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision').mockReturnValue('original:1');
  recordDiscoveryConnection(node, cluster, 'original:1');
  const clusterFetch = vi
    .spyOn(fetchModule, 'clusterFetch')
    .mockResolvedValue(Response.json({ id: 'draining', cluster }));

  await expect(drainNodeStatusForResource(cluster, node)).resolves.toMatchObject({
    id: 'draining',
  });
  expect(clusterFetch).toHaveBeenCalledWith(
    `/drain-node-status?nodeName=${node.getName()}&__headlamp_connection_revision=original`,
    expect.objectContaining({ cluster, method: 'GET' })
  );
});

it('lets the replacement node drain while the original status read is pending', async () => {
  vi.useFakeTimers();
  const cluster = 'drain-replacement';
  const previousClusters = appStore.getState().config.clusters;
  const selectConnection = (revision: string) => {
    appStore.dispatch(
      setConfig({
        clusters: {
          ...previousClusters,
          [cluster]: {
            name: cluster,
            auth_type: 'oidc',
            server: 'https://mock.example.test',
            meta_data: {
              discoveryConnectionRevision: revision,
              discoveryOrigin: {
                cluster: 'hub',
                resource: {
                  apiVersion: 'fleet.example.test/v1',
                  kind: 'Cluster',
                  namespace: 'default',
                  name: cluster,
                  uid: revision,
                },
              },
            },
          },
        },
      })
    );
    const node = new Node(NODE_DETAILED_DATA, cluster);
    recordDiscoveryConnection(
      node,
      cluster,
      discoveredRevisions.getDiscoveredConnectionRevision(cluster)
    );
    return node;
  };
  const original = selectConnection('original');
  const useGet = vi.spyOn(Node, 'useGet').mockReturnValue(nodeResult(original));
  vi.spyOn(Node, 'useMetrics').mockReturnValue([null, null]);
  vi.spyOn(Node, 'useNodeSummaryStats').mockReturnValue([null, null]);
  const status = Promise.withResolvers<Response>();
  const clusterFetch = vi.spyOn(fetchModule, 'clusterFetch').mockImplementation(async path => {
    const url = String(path);
    if (url.startsWith('/drain-node-status?')) return status.promise;
    if (url.startsWith('/drain-node?')) return Response.json({ cluster });
    return Response.json({ kind: 'PodList', apiVersion: 'v1', items: [], metadata: {} });
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({ reducer: reducers });
  const theme = createMuiTheme({ base: 'light', name: 'light' });
  const page = () => (
    <QueryClientProvider client={queryClient}>
      <TestContext store={store}>
        <ThemeProvider theme={theme}>
          <Details cluster={cluster} name={original.getName()} />
        </ThemeProvider>
      </TestContext>
    </QueryClientProvider>
  );
  const { rerender, unmount } = render(page());
  const statusRequests = () =>
    clusterFetch.mock.calls.filter(([path]) => String(path).startsWith('/drain-node-status?'));

  try {
    fireEvent.click(screen.getByRole('button', { name: 'Drain' }));
    fireEvent.click(screen.getByTestId('confirm-button'));
    await act(() => vi.advanceTimersByTimeAsync(CLUSTER_ACTION_GRACE_PERIOD));
    expect(statusRequests()).toHaveLength(1);
    expect(statusRequests()[0][0]).toContain('__headlamp_connection_revision=original');
    expect(screen.getByRole('button', { name: 'Drain' })).toHaveAttribute('aria-disabled', 'true');

    act(() => {
      useGet.mockReturnValue(nodeResult(selectConnection('replacement')));
      rerender(page());
    });
    expect(screen.getByRole('button', { name: 'Drain' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await act(async () => {
      status.resolve(Response.json({ cluster, id: 'draining' }));
    });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(statusRequests()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Drain' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  } finally {
    unmount();
    appStore.dispatch(setConfig({ clusters: previousClusters }));
  }
});
