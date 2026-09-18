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
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => null),
  useClustersConf: vi.fn(() => ({})),
  useClustersVersion: vi.fn(() => [{}, {}]),
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(() => []),
}));

vi.mock('../../lib/k8s/event', () => ({
  default: class Event {},
  useEventWarningList: vi.fn(() => ({})),
}));
vi.mock('../common/ObjectEventList', () => ({ default: () => null }));
vi.mock('./Home', () => ({ default: () => null }));

import { useCluster } from '../../lib/k8s';
import RouteSwitcher from './RouteSwitcher';

// Verify RouteSwitcher renders stable route keys and handles an unset cluster.

describe('RouteSwitcher', () => {
  afterEach(() => {
    vi.mocked(useCluster).mockReturnValue(null);
    vi.unstubAllEnvs();
  });

  it('assigns unique keys to all rendered AuthRoute components', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <TestContext>
            <RouteSwitcher requiresToken={() => false} />
          </TestContext>
        </QueryClientProvider>
      );

      const duplicateKeyWarnings = consoleError.mock.calls.filter(args => {
        if (typeof args[0] !== 'string') {
          return false;
        }

        return (
          args[0].includes('Each child in a list should have a unique "key" prop') ||
          args[0].includes('Encountered two children with the same key')
        );
      });

      expect(duplicateKeyWarnings).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not throw when rendering with no cluster set', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    expect(() =>
      render(
        <QueryClientProvider client={queryClient}>
          <TestContext>
            <RouteSwitcher requiresToken={() => false} />
          </TestContext>
        </QueryClientProvider>
      )
    ).not.toThrow();
  });

  it('includes the configured product name in the document title', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_NAME', 'AKS Desktop');

    render(
      <QueryClientProvider client={queryClient}>
        <TestContext>
          <RouteSwitcher requiresToken={() => false} />
        </TestContext>
      </QueryClientProvider>
    );

    await waitFor(() => expect(document.title).toBe('Choose a cluster - AKS Desktop'));
  });

  it('includes the cluster and fallback product names in the document title', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(useCluster).mockReturnValue('cluster-a');
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_NAME', '');

    render(
      <QueryClientProvider client={queryClient}>
        <TestContext>
          <RouteSwitcher requiresToken={() => false} />
        </TestContext>
      </QueryClientProvider>
    );

    await waitFor(() => expect(document.title).toBe('cluster-a - Choose a cluster - Headlamp'));
  });
});
