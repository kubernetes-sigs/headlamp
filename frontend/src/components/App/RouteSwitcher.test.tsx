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

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Route, Switch } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cluster from '../../lib/cluster';
import { testAuth } from '../../lib/k8s/api/v1/clusterApi';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import { setRoute } from '../../redux/routesSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => null),
  useClustersConf: vi.fn(() => ({})),
  useClustersVersion: vi.fn(() => [{}, {}]),
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(() => []),
}));

vi.mock('../../lib/k8s/api/v1/clusterApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v1/clusterApi')>()),
  testAuth: vi.fn(),
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

describe('AuthRoute selected config lifecycle', () => {
  let client: QueryClient;
  const config = (auth_type = 'oidc', server = 'https://one.example', useToken = false) => ({
    sample: { name: 'sample', auth_type, server, useToken },
  });
  function deferred() {
    return Promise.withResolvers<unknown>();
  }
  function replace(clusters: ReturnType<typeof config> | null, stateless = false) {
    act(() =>
      store.dispatch(
        stateless ? setStatelessConfig({ statelessClusters: clusters }) : setConfig({ clusters })
      )
    );
  }
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 180_000 } } });
    vi.mocked(useCluster).mockReturnValue('sample');
    vi.spyOn(cluster, 'getCluster').mockReturnValue('sample');
    vi.spyOn(cluster, 'getSelectedClusters').mockReturnValue(['sample']);
    vi.spyOn(cluster, 'getClusterPathParam').mockReturnValue('sample');
    vi.mocked(testAuth).mockReset().mockResolvedValue({ current: true });
    store.dispatch(setConfig({ clusters: config() }));
    store.dispatch(setStatelessConfig({ statelessClusters: {} }));
    store.dispatch(
      setRoute({
        path: '/protected',
        name: 'Protected test',
        sidebar: null,
        component: () => <div>Protected content</div>,
      })
    );
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    client.clear();
    vi.restoreAllMocks();
    vi.mocked(useCluster).mockReturnValue(null);
  });

  function mount(fetchConfig?: () => Promise<unknown>) {
    function FetchConfig() {
      useQuery({ queryKey: ['cluster-fetch'], queryFn: fetchConfig!, retry: false });
      return null;
    }
    return render(
      <QueryClientProvider client={client}>
        <TestContext urlPrefix="/c" routerMap={{ cluster: 'sample', page: 'protected' }}>
          {fetchConfig && <FetchConfig />}
          <Switch>
            <Route path="/c/sample/login">
              <div>Login page</div>
            </Route>
            <Route>
              <RouteSwitcher requiresToken={() => false} />
            </Route>
          </Switch>
        </TestContext>
      </QueryClientProvider>
    );
  }

  it.each(['auth', 'server', 'source'])(
    '%s replacement invalidates old success and late work',
    async changed => {
      mount();
      await screen.findByText('Protected content');
      const finishes: ReturnType<typeof deferred>[] = [];
      vi.mocked(testAuth).mockImplementation(() => {
        const pending = deferred();
        finishes.push(pending);
        return pending.promise;
      });
      void client.refetchQueries({ queryKey: ['auth'] });
      await waitFor(() => expect(finishes).toHaveLength(1));
      sessionStorage.setItem('oidc-login-attempted.sample', 'true');
      const replacements: Record<string, ReturnType<typeof config>> = {
        auth: config(''),
        server: config('oidc', 'https://two.example'),
        source: config(),
      };
      replace(replacements[changed], changed === 'source');
      await waitFor(() => expect(finishes).toHaveLength(2));
      expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
      await act(async () => finishes[0].resolve({ old: true }));
      expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
      expect(sessionStorage.getItem('oidc-login-attempted.sample')).toBe('true');
      await act(async () => finishes[1].resolve({ current: true }));
      await screen.findByText('Protected content');
      expect(sessionStorage.getItem('oidc-login-attempted.sample')).toBe(
        changed === 'auth' ? 'true' : null
      );
    }
  );

  it('equal polls, unrelated entries and useToken changes do not churn auth', async () => {
    mount();
    await screen.findByText('Protected content');
    const keys = () =>
      client
        .getQueryCache()
        .findAll({ queryKey: ['auth'] })
        .map(query => query.queryHash);
    const originalKeys = keys();
    replace(config());
    replace({ ...config(), other: { name: 'other' } } as ReturnType<typeof config>);
    replace(config('oidc', 'https://one.example', true));
    await act(async () => {});
    expect(keys()).toEqual(originalKeys);
    expect(testAuth).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'server-null readiness distinguishes resolved stateless from pending parse (%s)',
    async ready => {
      replace(null);
      if (ready) replace(config(), true);
      const parsing = deferred();
      mount(() => parsing.promise);
      if (!ready) {
        await act(async () => {});
        expect(testAuth).not.toHaveBeenCalled();
        expect(screen.queryByText('Login page')).not.toBeInTheDocument();
        act(() => store.dispatch(setStatelessConfig({ statelessClusters: config() })));
        await act(async () => {
          parsing.resolve({});
        });
      }
      await screen.findByText('Protected content');
      expect(testAuth).toHaveBeenCalledTimes(1);
    }
  );

  it('failed config settles via ordinary 503 routing, preserves attempt and recovers', async () => {
    store.dispatch(setConfig({ clusters: null }));
    sessionStorage.setItem('oidc-login-attempted.sample', 'true');
    const loading = deferred();
    vi.mocked(testAuth).mockRejectedValueOnce(
      Object.assign(new Error('Unavailable'), { status: 503 })
    );
    const first = mount(() => loading.promise);
    await act(async () => {});
    expect(testAuth).not.toHaveBeenCalled();
    await act(async () => {
      loading.reject(new Error('parse failed'));
    });
    await screen.findByText('Login page');
    expect(sessionStorage.getItem('oidc-login-attempted.sample')).toBe('true');
    first.unmount();
    act(() => store.dispatch(setConfig({ clusters: config() })));
    mount();
    await screen.findByText('Protected content');
    expect(testAuth).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem('oidc-login-attempted.sample')).toBeNull();
  });
});
