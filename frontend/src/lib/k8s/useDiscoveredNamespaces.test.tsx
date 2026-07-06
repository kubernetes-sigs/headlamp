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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../helpers/clusterSettings';
import * as clusterApi from './api/v1/clusterApi';
import * as namespaceDiscovery from './namespaceDiscovery';
import {
  isNamespaceDiscoveryPending,
  useDiscoveredNamespaces,
  useDiscoveredNamespacesMap,
} from './useDiscoveredNamespaces';

const discoveryResult = {
  namespaces: ['discovered-ns'],
  isClusterWide: false,
  source: 'rolebindings' as const,
};

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

describe('useDiscoveredNamespaces', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(clusterApi, 'testAuth').mockResolvedValue({ status: { resourceRules: [] } });
    vi.spyOn(namespaceDiscovery, 'discoverAccessibleNamespaces').mockResolvedValue(discoveryResult);
  });

  it('runs discovery when auth succeeds and no manual override is configured', async () => {
    renderHook(() => useDiscoveredNamespaces('test-cluster'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(namespaceDiscovery.discoverAccessibleNamespaces).toHaveBeenCalledWith('test-cluster');
    });
  });

  it('skips auth and discovery when Settings additional namespaces override is set', async () => {
    storeClusterSettings('test-cluster', { allowedNamespaces: ['manual-ns'] });

    renderHook(() => useDiscoveredNamespaces('test-cluster'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(namespaceDiscovery.discoverAccessibleNamespaces).not.toHaveBeenCalled();
    });

    expect(clusterApi.testAuth).not.toHaveBeenCalled();
  });

  it('reports loading while auth probe is pending', () => {
    vi.spyOn(clusterApi, 'testAuth').mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDiscoveredNamespaces('test-cluster'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(namespaceDiscovery.discoverAccessibleNamespaces).not.toHaveBeenCalled();
  });
});

describe('isNamespaceDiscoveryPending', () => {
  it('is true during initial load or background refetch', () => {
    expect(isNamespaceDiscoveryPending({ isLoading: true, isFetching: false })).toBe(true);
    expect(isNamespaceDiscoveryPending({ isLoading: false, isFetching: true })).toBe(true);
    expect(isNamespaceDiscoveryPending({ isLoading: false, isFetching: false })).toBe(false);
  });
});

describe('useDiscoveredNamespacesMap', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(clusterApi, 'testAuth').mockResolvedValue({ status: { resourceRules: [] } });
    vi.spyOn(namespaceDiscovery, 'discoverAccessibleNamespaces').mockResolvedValue(discoveryResult);
  });

  it('skips auth and discovery for clusters with manual namespace override', async () => {
    storeClusterSettings('override-cluster', { allowedNamespaces: ['manual-ns'] });

    renderHook(() => useDiscoveredNamespacesMap(['override-cluster', 'auto-cluster']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(namespaceDiscovery.discoverAccessibleNamespaces).toHaveBeenCalledWith('auto-cluster');
    });

    expect(clusterApi.testAuth).toHaveBeenCalledTimes(1);
    expect(clusterApi.testAuth).toHaveBeenCalledWith('auto-cluster');
    expect(namespaceDiscovery.discoverAccessibleNamespaces).toHaveBeenCalledTimes(1);
    expect(namespaceDiscovery.discoverAccessibleNamespaces).not.toHaveBeenCalledWith(
      'override-cluster'
    );
  });
});
