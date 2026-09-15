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
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { clusterFetch } from './api/v2/fetch';
import Node from './node';
import { SelectedClustersContext } from './SelectedClustersContext';

// Loading the real router from ./node runs into a circular import.
vi.mock('../router/createRouteURL', () => ({ createRouteURL: vi.fn() }));
vi.mock('./api/v2/fetch', () => ({ clusterFetch: vi.fn() }));

describe('Node.useMetrics', () => {
  it('fetches metrics from all the selected clusters', async () => {
    vi.mocked(clusterFetch).mockImplementation(
      async (url, { cluster }) =>
        ({
          json: async () => ({
            kind: 'NodeMetricsList',
            apiVersion: 'metrics.k8s.io/v1beta1',
            metadata: {},
            items:
              url === 'apis/metrics.k8s.io/v1beta1/nodes'
                ? [{ metadata: { name: `${cluster}-node` } }]
                : [],
          }),
        } as unknown as Response)
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(() => Node.useMetrics(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SelectedClustersContext.Provider value={['cluster-a', 'cluster-b']}>
              {children}
            </SelectedClustersContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      ),
    });

    await waitFor(() =>
      expect(result.current[0]?.map(metrics => metrics.cluster)).toEqual(['cluster-a', 'cluster-b'])
    );
  });
});
