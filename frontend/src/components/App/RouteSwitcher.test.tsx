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
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => null),
  useClustersConf: vi.fn(() => ({})),
  useClustersVersion: vi.fn(() => [{}, {}]),
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(() => []),
}));

vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/cluster')>()),
  getCluster: vi.fn(() => null),
  getSelectedClusters: vi.fn(() => []),
}));

vi.mock('../authchooser/testAuthWithRetry', () => ({
  testAuthWithRetry: vi.fn(),
}));

vi.mock('../../lib/k8s/event', () => ({
  default: class Event {},
  useEventWarningList: vi.fn(() => ({})),
}));
vi.mock('../common/ObjectEventList', () => ({ default: () => null }));
vi.mock('./Home', () => ({ default: () => null }));

import '../../lib/router/index';
import { getCluster } from '../../lib/cluster';
import { useCluster, useClustersConf } from '../../lib/k8s';
import { testAuthWithRetry } from '../authchooser/testAuthWithRetry';
import RouteSwitcher, { AuthRoute, getAuthRedirectRoute } from './RouteSwitcher';

// Verify RouteSwitcher renders stable route keys and handles an unset cluster.

function CurrentPath() {
  return <div data-testid="current-route">{useLocation().pathname}</div>;
}

describe('RouteSwitcher', () => {
  afterEach(() => {
    vi.mocked(useCluster).mockReturnValue(null);
    vi.mocked(useClustersConf).mockReturnValue({});
    vi.mocked(getCluster).mockReturnValue(null);
    vi.mocked(testAuthWithRetry).mockReset();
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
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

  it.each(['', 'oidc'])(
    'does not send service-account %s auth failures to the token route',
    authType => {
      expect(
        getAuthRedirectRoute(
          'cluster-a',
          { auth_type: authType, uses_service_account_token: true },
          true,
          true
        )
      ).toBe('login');
    }
  );

  it.each([
    [401, true, '/login'],
    [401, false, '/token'],
    [403, true, '/login'],
    [403, false, '/token'],
  ])(
    'routes %i with service-account mode %s to %s',
    async (status, usesServiceAccountToken, expectedSuffix) => {
      const error: any = new Error(`HTTP ${status}`);
      error.status = status;
      vi.mocked(useCluster).mockReturnValue('cluster-a');
      vi.mocked(getCluster).mockReturnValue('cluster-a');
      vi.mocked(useClustersConf).mockReturnValue({
        'cluster-a': {
          auth_type: '',
          uses_service_account_token: usesServiceAccountToken,
        } as any,
      });
      vi.mocked(testAuthWithRetry).mockRejectedValue(error);
      window.history.pushState({}, '', '/c/cluster-a/workloads');
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <Provider store={store}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/c/cluster-a/workloads']}>
              <CurrentPath />
              <AuthRoute
                path="/c/:cluster/workloads"
                sidebar={null}
                requiresAuth
                requiresCluster={false}
                requiresToken={() => true}
              >
                <div>Protected content</div>
              </AuthRoute>
            </MemoryRouter>
          </QueryClientProvider>
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-route')).toHaveTextContent(
          new RegExp(`${expectedSuffix}$`)
        );
      });
    }
  );
});
