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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { useSelectedClusters } from './api/v1/hooks';
import { isResourceServed, useClustersServing, useIsResourceServed } from './resourceAvailability';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

vi.mock('./api/v1/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/hooks')>()),
  useSelectedClusters: vi.fn(),
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('isResourceServed', () => {
  beforeEach(() => mockRequest.mockReset());

  it('is true when the version lists the resource', async () => {
    mockRequest.mockResolvedValue({ resources: [{ name: 'deviceclasses' }] });

    await expect(isResourceServed('dra', 'resource.k8s.io/v1', 'deviceclasses')).resolves.toBe(
      true
    );
    expect(mockRequest).toHaveBeenCalledWith('/apis/resource.k8s.io/v1', { cluster: 'dra' });
  });

  it('is false when the version does not list the resource', async () => {
    mockRequest.mockResolvedValue({ resources: [{ name: 'resourceclaims' }] });

    await expect(isResourceServed('dra', 'resource.k8s.io/v1', 'deviceclasses')).resolves.toBe(
      false
    );
  });

  it('is false when the version is not served at all', async () => {
    mockRequest.mockRejectedValueOnce(new Error('404'));

    expect(await isResourceServed('old', 'resource.k8s.io/v1', 'deviceclasses')).toBe(false);
  });

  it('tries each version in order until one serves the resource', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ resources: [{ name: 'podgroups' }] });

    await expect(
      isResourceServed(
        'gang',
        ['scheduling.k8s.io/v1beta1', 'scheduling.k8s.io/v1alpha3'],
        'podgroups'
      )
    ).resolves.toBe(true);
    expect(mockRequest).toHaveBeenNthCalledWith(1, '/apis/scheduling.k8s.io/v1beta1', {
      cluster: 'gang',
    });
    expect(mockRequest).toHaveBeenNthCalledWith(2, '/apis/scheduling.k8s.io/v1alpha3', {
      cluster: 'gang',
    });
  });

  it('asks the core group under /api', async () => {
    mockRequest.mockResolvedValue({ resources: [{ name: 'pods' }] });

    await expect(isResourceServed('any', 'v1', 'pods')).resolves.toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('/api/v1', { cluster: 'any' });
  });
});

const deviceClasses = {
  apiName: 'deviceclasses',
  isEnabled: vi.fn<(cluster: string) => Promise<boolean>>(),
};

describe('useClustersServing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps only the selected clusters that serve the resource', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy', 'dra', 'other-dra']);
    deviceClasses.isEnabled.mockImplementation(async cluster => cluster !== 'legacy');

    const { result } = renderHook(() => useClustersServing(deviceClasses), { wrapper });

    await waitFor(() => expect(result.current).toEqual(['dra', 'other-dra']));
  });

  it('is empty while nothing is selected, without probing', () => {
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    deviceClasses.isEnabled.mockClear();

    const { result } = renderHook(() => useClustersServing(deviceClasses), { wrapper });

    expect(result.current).toEqual([]);
    expect(deviceClasses.isEnabled).not.toHaveBeenCalled();
  });

  it('is empty when no selected cluster serves the resource', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy']);
    deviceClasses.isEnabled.mockClear().mockResolvedValue(false);

    const { result } = renderHook(() => useClustersServing(deviceClasses), { wrapper });

    await waitFor(() => expect(deviceClasses.isEnabled).toHaveBeenCalledWith('legacy'));
    expect(result.current).toEqual([]);
  });
});

describe('useIsResourceServed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is true once any selected cluster serves the resource', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy', 'dra']);
    deviceClasses.isEnabled.mockImplementation(async cluster => cluster === 'dra');

    const { result } = renderHook(() => useIsResourceServed(deviceClasses), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false while nothing serves the resource', () => {
    vi.mocked(useSelectedClusters).mockReturnValue([]);

    const { result } = renderHook(() => useIsResourceServed(deviceClasses), { wrapper });

    expect(result.current).toBe(false);
  });
});
