/*
 * Copyright 2026 The Kubernetes Authors.
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
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { clusterRequest } from './api/v1/clusterRequests';
import { ApiError } from './api/v2/ApiError';
import { clusterFetch } from './api/v2/fetch';
import Node from './node';

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  clusterRequest: vi.fn(),
}));

vi.mock('./api/v2/fetch', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v2/fetch')>()),
  clusterFetch: vi.fn(),
}));

it('restarts explicit node metric and stats polling and drops results from the old connection', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const cluster = 'discovered';
  const previousClusters = store.getState().config.clusters;
  const select = (revision: string) =>
    store.dispatch(
      setConfig({
        clusters: {
          ...previousClusters,
          [cluster]: {
            name: cluster,
            auth_type: 'oidc',
            server: 'https://discovered.example.com',
            meta_data: {
              discoveryConnectionRevision: revision,
              discoveryOrigin: {
                cluster: 'hub',
                resource: {
                  apiVersion: 'example.test/v1',
                  kind: 'Cluster',
                  namespace: 'default',
                  name: cluster,
                  uid: 'fixture',
                },
              },
            },
          },
        },
      })
    );

  const originalMetrics = [{ metadata: { name: 'original-node' } }];
  const originalSummary = { node: { fs: { capacityBytes: 10 } } };
  const replacementMetrics = [{ metadata: { name: 'replacement-node' } }];
  const replacementSummary = { node: { fs: { capacityBytes: 20 } } };
  const oldMetrics = Promise.withResolvers<unknown>();
  const oldSummary = Promise.withResolvers<Response>();
  const newMetrics = Promise.withResolvers<unknown>();
  const newSummary = Promise.withResolvers<Response>();
  vi.mocked(clusterRequest)
    .mockResolvedValueOnce({ items: originalMetrics })
    .mockReturnValueOnce(oldMetrics.promise)
    .mockReturnValue(newMetrics.promise);
  vi.mocked(clusterFetch)
    .mockResolvedValueOnce(Response.json(originalSummary))
    .mockReturnValueOnce(oldSummary.promise)
    .mockReturnValue(newSummary.promise);

  select('original');
  const { result, unmount } = renderHook(
    () => ({
      metrics: Node.useMetrics(cluster),
      summary: Node.useNodeSummaryStats('sample', cluster),
    }),
    { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> }
  );

  try {
    await act(async () => {});
    expect(result.current.metrics).toEqual([originalMetrics, null]);
    expect(result.current.summary).toEqual([originalSummary, null]);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(clusterRequest).toHaveBeenCalledTimes(2);
    expect(clusterFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(clusterRequest).mock.lastCall?.[0]).toContain('_revision=original');
    expect(vi.mocked(clusterFetch).mock.lastCall?.[0]).toContain('_revision=original');

    await act(async () => {
      select('replacement');
    });
    expect(result.current.metrics).toEqual([null, null]);
    expect(result.current.summary).toEqual([null, null]);
    expect(clusterRequest).toHaveBeenLastCalledWith(
      expect.stringContaining('_revision=replacement'),
      { cluster }
    );
    expect(clusterFetch).toHaveBeenLastCalledWith(
      expect.stringContaining('_revision=replacement'),
      { cluster }
    );
    await act(async () => {
      oldMetrics.resolve({ items: originalMetrics });
      oldSummary.reject(new ApiError('Old polling error', { status: 503 }));
    });
    expect(result.current.metrics).toEqual([null, null]);
    expect(result.current.summary).toEqual([null, null]);

    await act(async () => {
      newMetrics.resolve({ items: replacementMetrics });
      newSummary.resolve(Response.json(replacementSummary));
    });
    expect(result.current.metrics).toEqual([replacementMetrics, null]);
    expect(result.current.summary).toEqual([replacementSummary, null]);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(clusterRequest).toHaveBeenCalledTimes(4);
    expect(clusterFetch).toHaveBeenCalledTimes(4);
  } finally {
    unmount();
    store.dispatch(setConfig({ clusters: previousClusters }));
    vi.useRealTimers();
  }
});
