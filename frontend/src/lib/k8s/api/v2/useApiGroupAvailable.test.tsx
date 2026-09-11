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
import React from 'react';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { ApiError } from './ApiError';
import { clusterFetch } from './fetch';
import { useApiGroupAvailable } from './useApiGroupAvailable';

vi.mock('./fetch', () => ({
  clusterFetch: vi.fn(),
}));

describe('useApiGroupAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

  it('returns true when the API group/version discovery request succeeds', async () => {
    (clusterFetch as Mock).mockResolvedValue({ ok: true });

    const { result } = renderHook(
      () => useApiGroupAvailable('gateway.networking.k8s.io', 'v1', 'test-cluster'),
      { wrapper }
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(clusterFetch).toHaveBeenCalledWith('/apis/gateway.networking.k8s.io/v1', {
      cluster: 'test-cluster',
    });
  });

  it('returns false when the API group/version is not served by the cluster (404)', async () => {
    (clusterFetch as Mock).mockRejectedValue(new ApiError('not found', { status: 404 }));

    const { result } = renderHook(
      () => useApiGroupAvailable('gateway.networking.k8s.io', 'v1', 'test-cluster'),
      { wrapper }
    );

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('returns undefined when the discovery request fails for a reason other than a 404', async () => {
    (clusterFetch as Mock).mockRejectedValue(new ApiError('forbidden', { status: 403 }));

    const { result } = renderHook(
      () => useApiGroupAvailable('gateway.networking.k8s.io', 'v1', 'test-cluster'),
      { wrapper }
    );

    await waitFor(() => expect(clusterFetch).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when the discovery request throws a non-ApiError (e.g. network error)', async () => {
    (clusterFetch as Mock).mockRejectedValue(new Error('network error'));

    const { result } = renderHook(
      () => useApiGroupAvailable('gateway.networking.k8s.io', 'v1', 'test-cluster'),
      { wrapper }
    );

    await waitFor(() => expect(clusterFetch).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it('does not run the discovery request when no cluster is given', () => {
    const { result } = renderHook(
      () => useApiGroupAvailable('gateway.networking.k8s.io', 'v1', null),
      { wrapper }
    );

    expect(result.current).toBeUndefined();
    expect(clusterFetch).not.toHaveBeenCalled();
  });
});
