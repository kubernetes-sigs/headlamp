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

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { testAuth } from '../../lib/k8s/api/v1/clusterApi';
import {
  registerClusterPreOpenHook,
  resetClusterPreOpenHooksForTests,
} from '../../plugin/clusterPreOpen';
import { ClusterPreOpenHook, clusterPreOpenHooksChanged } from '../../redux/clusterProviderSlice';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => null),
  useClustersConf: vi.fn(() => ({})),
  useClustersVersion: vi.fn(() => [{}, {}]),
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(() => []),
}));

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  testAuth: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../lib/k8s/event', () => ({
  default: class Event {},
  useEventWarningList: vi.fn(() => ({})),
}));
vi.mock('../common/AlertNotification', () => ({ default: () => null }));
vi.mock('../common/ObjectEventList', () => ({ default: () => null }));
vi.mock('./Home', () => ({ default: () => null }));

import ClusterPreOpenGate from './ClusterPreOpenGate';
import RouteSwitcher, { AuthRoute } from './RouteSwitcher';

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

describe('AuthRoute pre-open hooks', () => {
  const createTestStore = () => configureStore({ reducer: reducers });
  type TestStore = ReturnType<typeof createTestStore>;

  beforeEach(() => {
    resetClusterPreOpenHooksForTests();
    vi.mocked(useCluster).mockReturnValue('test-cluster');
    vi.mocked(useClustersConf).mockReturnValue({ 'test-cluster': {} } as any);
    vi.mocked(useSelectedClusters).mockReturnValue(['test-cluster']);
    vi.mocked(testAuth)
      .mockClear()
      .mockResolvedValue(true as any);
  });

  afterEach(() => {
    resetClusterPreOpenHooksForTests();
    vi.mocked(useCluster).mockReturnValue(null);
  });

  /**
   * Stands in for RouteSwitcher: owns the pre-open state above the route, the
   * way the real tree does, and renders one AuthRoute below it. `routeKey`
   * remounts just the route, so a test can navigate without disturbing the
   * observer above.
   */
  function PreOpenHost({
    routeKey = 'a',
    showRoute = true,
  }: {
    routeKey?: string;
    showRoute?: boolean;
  }) {
    return (
      <ClusterPreOpenGate>
        {showRoute && (
          <AuthRoute
            key={routeKey}
            path="/"
            exact
            sidebar={null}
            requiresAuth
            requiresCluster
            requiresToken={() => false}
          >
            <div>cluster-content</div>
          </AuthRoute>
        )}
      </ClusterPreOpenGate>
    );
  }

  // Renders that host for 'test-cluster' with one registered pre-open hook whose
  // promise the test controls, so we can assert each preparation state.
  function renderAuthRoute(hook: ClusterPreOpenHook, routeKey?: string, existingStore?: TestStore) {
    const store = existingStore ?? createTestStore();
    if (!existingStore) {
      registerClusterPreOpenHook(hook);
      store.dispatch(clusterPreOpenHooksChanged());
    }
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const ui = (key?: string, showRoute = true) => (
      <QueryClientProvider client={queryClient}>
        <TestContext store={store}>
          <PreOpenHost routeKey={key} showRoute={showRoute} />
        </TestContext>
      </QueryClientProvider>
    );
    const view = render(ui(routeKey));
    return {
      ...view,
      store,
      navigate: (key: string) => view.rerender(ui(key)),
      /** Unmounts the route, waits, then mounts the next one — what a suspended
       *  route does, and what a same-commit remount does not exercise. */
      navigateWithGap: async (key: string) => {
        view.rerender(ui(routeKey, false));
        await new Promise(resolve => setTimeout(resolve, 20));
        view.rerender(ui(key, true));
      },
    };
  }

  it('shows the connecting dialog while a pre-open hook is pending', async () => {
    const hook = vi.fn(() => new Promise<void>(() => {})); // never settles
    renderAuthRoute(hook);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Preparing cluster/)).toBeInTheDocument();
    // The cluster's views and the auth probe are gated while preparing.
    expect(screen.queryByText('cluster-content')).not.toBeInTheDocument();
    expect(testAuth).not.toHaveBeenCalled();
  });

  it('waits for cluster config before running and caching pre-open hooks', async () => {
    vi.mocked(useClustersConf).mockReturnValue(null as any);
    const hook = vi.fn<ClusterPreOpenHook>(() => Promise.resolve());
    const { navigate } = renderAuthRoute(hook);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(hook).not.toHaveBeenCalled();
    expect(testAuth).not.toHaveBeenCalled();

    vi.mocked(useClustersConf).mockReturnValue({ 'test-cluster': { source: 'loaded' } } as any);
    navigate('config-loaded');

    await waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    expect(hook.mock.calls[0][0]).toMatchObject({
      cluster: 'test-cluster',
      clusterConf: { source: 'loaded' },
    });
  });

  it('waits for enabled stateless cluster config before running hooks', async () => {
    const store = createTestStore();
    store.dispatch(
      setConfig({
        clusters: { 'normal-cluster': { name: 'normal-cluster' } } as any,
        isDynamicClusterEnabled: true,
      })
    );
    vi.mocked(useClustersConf).mockReturnValue({ 'normal-cluster': {} } as any);
    const hook = vi.fn<ClusterPreOpenHook>(() => Promise.resolve());
    registerClusterPreOpenHook(hook);
    store.dispatch(clusterPreOpenHooksChanged());
    const { navigate } = renderAuthRoute(hook, undefined, store);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(hook).not.toHaveBeenCalled();

    store.dispatch(
      setStatelessConfig({
        statelessClusters: { 'test-cluster': { name: 'test-cluster', source: 'stateless' } } as any,
      })
    );
    vi.mocked(useClustersConf).mockReturnValue({
      'normal-cluster': {},
      'test-cluster': { source: 'stateless' },
    } as any);
    navigate('stateless-config-loaded');

    await waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    expect(hook.mock.calls[0][0]).toMatchObject({
      cluster: 'test-cluster',
      clusterConf: { source: 'stateless' },
    });
  });

  it('shows an error with a Retry that refetches when a hook rejects', async () => {
    let reject!: (err: Error) => void;
    const hook = vi.fn(() => new Promise<void>((_resolve, rej) => (reject = rej)));
    renderAuthRoute(hook);

    await screen.findByRole('dialog');
    reject(new Error('proxy failed'));

    // Error UI: the message is shown and a Retry button appears (Retry only
    // renders in the error state).
    const retry = await screen.findByRole('button', { name: /Retry/i });
    expect((await screen.findAllByText(/proxy failed/)).length).toBeGreaterThan(0);

    fireEvent.click(retry);
    await waitFor(() => expect(hook).toHaveBeenCalledTimes(2));
  });

  it('shows the connecting dialog while a Retry is in flight, not the stale error', async () => {
    // React Query v5 resets an errored query to `pending` when it refetches with
    // no cached data (`fetchState` in query-core), so the Retry lands back on the
    // connecting dialog rather than sitting on the error page. Locked down here
    // because the branch order below reads as if the error would win.
    let reject!: (err: Error) => void;
    const hook = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((_resolve, rej) => (reject = rej)))
      .mockImplementationOnce(() => new Promise<void>(() => {})); // the retry stays pending
    renderAuthRoute(hook);

    await screen.findByRole('dialog');
    reject(new Error('proxy failed'));

    fireEvent.click(await screen.findByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(hook).toHaveBeenCalledTimes(2));

    expect(await screen.findByText(/Preparing cluster/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()
    );
  });

  it('runs hooks once per cluster open, not per route', async () => {
    // The contract is "once, before a cluster's views are rendered". Preparation
    // is therefore observed above the route switch: a route unmounting — including
    // with a gap before the next one mounts, as a suspended route gives — must not
    // evict the result and re-run every hook.
    const hook = vi.fn(() => Promise.resolve());
    const { navigate, navigateWithGap } = renderAuthRoute(hook, 'pods');
    await screen.findByText('cluster-content');
    expect(hook).toHaveBeenCalledTimes(1);

    // Same-commit navigation.
    navigate('services');
    await screen.findByText('cluster-content');
    expect(hook).toHaveBeenCalledTimes(1);

    // And navigation with a gap between unmount and mount, which is what a
    // suspended route produces — this is the case that evicts the result when
    // preparation is observed per route.
    await navigateWithGap('nodes');
    await screen.findByText('cluster-content');
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('prepares again after leaving a cluster for a multi-cluster view', async () => {
    const hook = vi.fn(() => Promise.resolve());
    const { navigate } = renderAuthRoute(hook, 'pods');
    await screen.findByText('cluster-content');
    expect(hook).toHaveBeenCalledTimes(1);

    vi.mocked(useSelectedClusters).mockReturnValue(['test-cluster', 'other-cluster']);
    navigate('combined');
    await new Promise(resolve => setTimeout(resolve, 20));

    vi.mocked(useSelectedClusters).mockReturnValue(['test-cluster']);
    navigate('pods-again');
    await waitFor(() => expect(hook).toHaveBeenCalledTimes(2));
  });

  it('abandons a stalled preparation instead of reattaching to it on reopen', async () => {
    // gcTime does not evict a query whose fetch is still pending, so without
    // consuming the query's AbortSignal a reopened cluster would reattach to the
    // abandoned run — leaving the connecting dialog up with no way forward.
    let abortedDuringFirstRun = false;
    const hook = vi.fn(
      ({ signal }: any) =>
        new Promise<void>(() => {
          // Never settles; record that the app told us to stop.
          signal?.addEventListener?.('abort', () => {
            abortedDuringFirstRun = true;
          });
        })
    );
    const { unmount } = renderAuthRoute(hook as any, 'pods');
    await screen.findByRole('dialog');
    expect(hook).toHaveBeenCalledTimes(1);

    // Leave the cluster while preparation is still running.
    unmount();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(abortedDuringFirstRun).toBe(true);

    // Reopening prepares again rather than waiting on the abandoned run.
    renderAuthRoute(hook as any, 'pods');
    await waitFor(() => expect(hook).toHaveBeenCalledTimes(2));
  });

  it('clears preparation after unmount when a hook ignores abort', async () => {
    const hook = vi.fn(() => new Promise<void>(() => {}));
    const view = renderAuthRoute(hook, 'pods');
    await screen.findByRole('dialog');
    expect(view.store.getState().clusterProvider.preparing['test-cluster']).toBeDefined();

    view.unmount();

    await waitFor(() =>
      expect(view.store.getState().clusterProvider.preparing['test-cluster']).toBeUndefined()
    );
  });

  it('ignores late progress and cleanup from an abandoned run after reopen', async () => {
    const runs: Array<{
      context: { reportProgress?: (message: string) => void };
      resolve: () => void;
    }> = [];
    const hook = vi.fn(
      (context: { reportProgress?: (message: string) => void }) =>
        new Promise<void>(resolve => {
          runs.push({ context, resolve });
          context.reportProgress?.(`run-${runs.length}`);
        })
    );

    const first = renderAuthRoute(hook as any, 'first');
    expect(await screen.findByRole('status')).toHaveTextContent('run-1');
    const store = first.store;
    first.unmount();

    renderAuthRoute(hook as any, 'second', store);
    expect(await screen.findByRole('status')).toHaveTextContent('run-2');

    runs[0].context.reportProgress?.('stale-progress');
    runs[0].resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByRole('status')).toHaveTextContent('run-2');
    expect(store.getState().clusterProvider.preparing['test-cluster']).toMatchObject({
      message: 'run-2',
    });
  });

  it('clears progress before running the next hook', async () => {
    const firstHook = vi.fn<ClusterPreOpenHook>(async ({ reportProgress }) => {
      reportProgress?.('Refreshing credentials');
    });
    const secondHook = vi.fn<ClusterPreOpenHook>(() => new Promise<void>(() => {}));
    const store = createTestStore();
    registerClusterPreOpenHook(firstHook);
    registerClusterPreOpenHook(secondHook);
    store.dispatch(clusterPreOpenHooksChanged());

    renderAuthRoute(firstHook, 'pods', store);

    await waitFor(() => expect(secondHook).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Preparing cluster…');
    expect(screen.getByRole('status')).not.toHaveTextContent('Refreshing credentials');
  });

  it('does not probe auth until pre-open hooks succeed', async () => {
    let resolve!: () => void;
    const hook = vi.fn(() => new Promise<void>(res => (resolve = res)));
    renderAuthRoute(hook);

    await screen.findByRole('dialog');
    expect(testAuth).not.toHaveBeenCalled();

    resolve();

    await waitFor(() => expect(testAuth).toHaveBeenCalledWith('test-cluster'));
    expect(await screen.findByText('cluster-content')).toBeInTheDocument();
  });
});
