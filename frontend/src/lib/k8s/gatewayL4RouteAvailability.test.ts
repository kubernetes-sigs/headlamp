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

import { useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useSelectedClusters } from './api/v1/hooks';
import { clusterFetch } from './api/v2/fetch';
import {
  gatewayL4RouteAvailability,
  gatewayL4RouteAvailabilityQueryKey,
  useGatewayL4RouteAvailability,
} from './gatewayL4RouteAvailability';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));
vi.mock('./api/v1/hooks', () => ({
  useSelectedClusters: vi.fn(),
}));
vi.mock('./api/v2/fetch', () => ({
  clusterFetch: vi.fn(),
}));

const resource = (kind: 'TCPRoute' | 'UDPRoute', verbs = ['list']) => ({
  name: kind === 'TCPRoute' ? 'tcproutes' : 'udproutes',
  kind,
  namespaced: true,
  verbs,
});

function response(resources: unknown) {
  return { json: vi.fn().mockResolvedValue({ resources }) } as unknown as Response;
}

function mockDiscovery(resourcesByClusterAndVersion: Record<string, Record<string, unknown>>) {
  vi.mocked(clusterFetch).mockImplementation(async (url, { cluster }) => {
    const version = String(url).split('/').pop()!;
    const value = resourcesByClusterAndVersion[cluster]?.[version];
    if (value instanceof Error) {
      throw value;
    }
    return response(value);
  });
}

describe('gatewayL4RouteAvailability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('finds a listable TCPRoute in v1alpha2 when preferred v1 lacks it', async () => {
    mockDiscovery({
      cluster1: {
        v1: [resource('UDPRoute')],
        v1alpha2: [resource('TCPRoute')],
      },
    });

    await expect(gatewayL4RouteAvailability(['cluster1'])).resolves.toEqual([
      'TCPRoute',
      'UDPRoute',
    ]);
  });

  it('rejects a kind that is unavailable on one selected cluster', async () => {
    mockDiscovery({
      cluster1: { v1: [resource('TCPRoute')], v1alpha2: [] },
      cluster2: { v1: [], v1alpha2: [] },
    });

    await expect(gatewayL4RouteAvailability(['cluster1', 'cluster2'])).resolves.toEqual([]);
  });

  it('rejects heterogeneous candidate-version sets across selected clusters', async () => {
    mockDiscovery({
      cluster1: { v1: [resource('TCPRoute')], v1alpha2: [] },
      cluster2: { v1: [], v1alpha2: [resource('TCPRoute')] },
    });

    await expect(gatewayL4RouteAvailability(['cluster1', 'cluster2'])).resolves.toEqual([]);
  });

  it('returns stable deduplicated kinds when every cluster has identical version sets', async () => {
    mockDiscovery({
      cluster1: {
        v1: [resource('UDPRoute'), resource('TCPRoute'), resource('TCPRoute')],
        v1alpha2: [resource('TCPRoute')],
      },
      cluster2: {
        v1: [resource('TCPRoute'), resource('UDPRoute')],
        v1alpha2: [resource('TCPRoute')],
      },
    });

    await expect(gatewayL4RouteAvailability(['cluster2', 'cluster1', 'cluster1'])).resolves.toEqual(
      ['TCPRoute', 'UDPRoute']
    );
  });

  it('ignores non-listable resources, failed endpoints, and malformed resource lists', async () => {
    mockDiscovery({
      cluster1: {
        v1: [resource('TCPRoute', ['get'])],
        v1alpha2: new Error('unavailable'),
      },
      cluster2: {
        v1: 'not-a-resource-list',
        v1alpha2: [resource('UDPRoute')],
      },
    });

    await expect(gatewayL4RouteAvailability(['cluster1'])).resolves.toEqual([]);
    await expect(gatewayL4RouteAvailability(['cluster2'])).resolves.toEqual(['UDPRoute']);
  });

  it('does not probe endpoints when no clusters are selected', async () => {
    await expect(gatewayL4RouteAvailability([])).resolves.toEqual([]);
    expect(clusterFetch).not.toHaveBeenCalled();
  });
});

describe('useGatewayL4RouteAvailability', () => {
  it('uses the shared canonical query key for selected clusters', () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['cluster-b', 'cluster-a', 'cluster-b']);
    vi.mocked(useQuery).mockReturnValue({ data: [] } as ReturnType<typeof useQuery>);

    renderHook(() => useGatewayL4RouteAvailability());

    expect(useQuery).toHaveBeenCalledWith({
      queryKey: gatewayL4RouteAvailabilityQueryKey(['cluster-a', 'cluster-b']),
      queryFn: expect.any(Function),
    });
  });
});
