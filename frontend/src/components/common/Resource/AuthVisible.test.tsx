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
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthVisible from './AuthVisible';

describe('AuthVisible', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // Keep cached data fresh so a newly mounted observer serves it from the
          // cache instead of refetching. This lets the cluster-isolation test prove
          // real cache reuse rather than in-flight request deduplication.
          staleTime: Infinity,
        },
      },
    });
  });

  it('renders children if authorized', async () => {
    const mockItem = {
      _class: () => ({
        apiName: 'pods',
        apiVersion: 'v1',
      }),
      getName: () => 'test-pod',
      getAuthorization: vi.fn().mockResolvedValue({
        status: {
          allowed: true,
          reason: 'Allowed',
        },
      }),
    };

    const onAuthResult = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={mockItem as any} authVerb="get" onAuthResult={onAuthResult}>
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(onAuthResult).toHaveBeenCalledWith({
        allowed: true,
        reason: 'Allowed',
      });
    });

    expect(screen.getByText('Authorized Content')).toBeInTheDocument();
  });

  it('does not render children if not authorized', async () => {
    const mockItem = {
      _class: () => ({
        apiName: 'pods',
        apiVersion: 'v1',
      }),
      getName: () => 'test-pod',
      getAuthorization: vi.fn().mockResolvedValue({
        status: {
          allowed: false,
          reason: 'Forbidden',
        },
      }),
    };

    const onAuthResult = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={mockItem as any} authVerb="get" onAuthResult={onAuthResult}>
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(onAuthResult).toHaveBeenCalledWith({
        allowed: false,
        reason: 'Forbidden',
      });
    });

    expect(screen.queryByText('Authorized Content')).toBeNull();
  });

  it('isolates authorization results by cluster while sharing them within a cluster', async () => {
    const createMockItem = (cluster: string, allowed: boolean) => ({
      _class: () => ({
        apiName: 'pods',
        apiVersion: 'v1',
      }),
      cluster,
      getName: () => 'test-pod',
      getAuthorization: vi.fn().mockResolvedValue({
        status: {
          allowed,
        },
      }),
    });

    const clusterAItem = createMockItem('cluster-a', true);
    const sameClusterItem = createMockItem('cluster-a', false);
    const clusterBItem = createMockItem('cluster-b', false);

    // Render first cluster-a item and wait for authorization to complete
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={clusterAItem as any} authVerb="get">
          <div>Cluster A content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Cluster A content')).toBeInTheDocument();
    });

    expect(clusterAItem.getAuthorization).toHaveBeenCalledTimes(1);

    // Render equivalent cluster-a item - should reuse cached result
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={clusterAItem as any} authVerb="get">
          <div>Cluster A content</div>
        </AuthVisible>
        <AuthVisible item={sameClusterItem as any} authVerb="get">
          <div>Same cluster content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Same cluster content')).toBeInTheDocument();
    });

    expect(clusterAItem.getAuthorization).toHaveBeenCalledTimes(1);
    expect(sameClusterItem.getAuthorization).not.toHaveBeenCalled();

    // Render cluster-b item - should make new authorization request
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={clusterAItem as any} authVerb="get">
          <div>Cluster A content</div>
        </AuthVisible>
        <AuthVisible item={sameClusterItem as any} authVerb="get">
          <div>Same cluster content</div>
        </AuthVisible>
        <AuthVisible item={clusterBItem as any} authVerb="get">
          <div>Cluster B content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Cluster B content')).toBeNull();
    });

    expect(clusterAItem.getAuthorization).toHaveBeenCalledTimes(1);
    expect(sameClusterItem.getAuthorization).not.toHaveBeenCalled();
    expect(clusterBItem.getAuthorization).toHaveBeenCalledTimes(1);
  });

  it('warns and returns null if authVerb is invalid', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockItem = {
      _class: () => ({
        apiName: 'pods',
        apiVersion: 'v1',
      }),
      getName: () => 'test-pod',
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={mockItem as any} authVerb="invalid-verb">
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid authVerb provided: "invalid-verb"')
    );
    expect(screen.queryByText('Authorized Content')).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('does not crash if item is null', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={null} authVerb="get">
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    expect(screen.queryByText('Authorized Content')).toBeNull();
  });
});
