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

import '../../lib/router/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createBrowserHistory, createHashHistory, History } from 'history';
import { SnackbarProvider } from 'notistack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { Link, Redirect, Route, useHistory, useLocation } from 'react-router-dom';
import { isElectron } from '../../helpers/isElectron';
import { getCluster, getSelectedClusters } from '../../lib/cluster';
import { request } from '../../lib/k8s/api/v1/clusterRequests';
import {
  registerClusterPreOpenHook,
  resetClusterPreOpenHooksForTests,
} from '../../plugin/clusterPreOpen';
import {
  ClusterPreOpenContext,
  clusterPreOpenHooksChanged,
} from '../../redux/clusterProviderSlice';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { UIPanel } from '../../redux/uiSlice';
import { ActivitiesRenderer, Activity } from '../activity/Activity';
import AlertNotification from '../common/AlertNotification';
import ClusterLayout from './ClusterLayout';
import ClusterRouter from './ClusterRouter';

vi.mock('../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(async () => null),
}));
vi.mock('../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: () => 'router-test',
}));
vi.mock('../../lib/auth', () => ({ logout: vi.fn() }));
vi.mock('../../helpers/isElectron', () => ({ isElectron: vi.fn(() => false) }));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const panelMounted = vi.fn();
const panelDisposed = vi.fn();
const sessionOpened = vi.fn();
const sessionClosed = vi.fn();
const timerSelection = vi.fn();

function StatefulPanel() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    panelMounted();
    const timer = setInterval(() => {
      timerSelection(getCluster(), getSelectedClusters());
      void request('/panel-status');
    }, 1000);
    return () => {
      panelDisposed();
      clearInterval(timer);
    };
  }, []);
  return (
    <button data-testid="panel" onClick={() => setCount(count + 1)}>
      panel {count}
    </button>
  );
}

function Session() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    sessionOpened();
    return () => {
      sessionClosed();
    };
  }, []);
  return (
    <button data-testid="session" onClick={() => setCount(count + 1)}>
      session {count}
    </button>
  );
}

let appHistory: History;
function Destination() {
  const history = useHistory();
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    appHistory = history;
  }, [history]);
  useEffect(() => {
    if (getCluster()) void request('/destination-view');
  }, [pathname]);
  return (
    <main>
      <div data-testid="route">{pathname}</div>
      <Link to="/c/cluster-b/pods">Open B</Link>
      <AlertNotification />
    </main>
  );
}

const panels: Record<UIPanel['side'], UIPanel[]> = {
  top: [{ id: 'persistent', side: 'top', component: StatefulPanel }],
  left: [],
  right: [],
  bottom: [],
};
const clusters = Object.fromEntries(
  ['cluster-a', 'cluster-b', 'cluster-c'].map(name => [name, { name, auth_type: '' }])
);

describe('prepared cluster navigation', () => {
  let client: QueryClient;
  let requests: string[];
  let previousPath: string;
  let previousBaseUrl: string | undefined;
  let hook: ReturnType<typeof vi.fn<(context: ClusterPreOpenContext) => Promise<void>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    resetClusterPreOpenHooksForTests();
    previousPath = window.location.pathname + window.location.search + window.location.hash;
    previousBaseUrl = window.headlampBaseUrl;
    vi.mocked(isElectron).mockReturnValue(false);
    window.history.replaceState({}, '', '/c/cluster-a/pods');
    store.dispatch(setConfig({ clusters, isDynamicClusterEnabled: false }));
    Activity.reset();
    hook = vi.fn(async () => {});
    registerClusterPreOpenHook(hook);
    store.dispatch(clusterPreOpenHooksChanged());
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requests.push(String(url));
        return new Response('{}', { status: 200 });
      })
    );
    client = new QueryClient();
  });

  afterEach(async () => {
    cleanup();
    await client.cancelQueries();
    client.clear();
    Activity.reset();
    resetClusterPreOpenHooksForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.headlampBaseUrl = previousBaseUrl;
    vi.mocked(isElectron).mockReturnValue(false);
    window.history.replaceState({}, '', previousPath);
  });

  function mount(history: History = createBrowserHistory(), redirect = false) {
    Activity.launch({
      id: 'session',
      title: 'Terminal session',
      cluster: 'cluster-a',
      location: 'split-right',
      content: <Session />,
    });
    return render(
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <SnackbarProvider>
            <ClusterRouter history={history}>
              {redirect && (
                <Route path="/c/cluster-a/pods" exact>
                  <Redirect to="/c/cluster-b/pods" />
                </Route>
              )}
              <ClusterLayout panels={panels}>
                <Destination />
                <ActivitiesRenderer />
              </ClusterLayout>
            </ClusterRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </Provider>
    );
  }

  async function ready() {
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  }

  async function pollOnlyA() {
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(timerSelection).toHaveBeenLastCalledWith('cluster-a', ['cluster-a']);
    expect(requests.some(url => url.includes('/clusters/cluster-b/'))).toBe(false);
    expect(panelDisposed).not.toHaveBeenCalled();
    expect(sessionClosed).not.toHaveBeenCalled();
  }

  function expectPreserved() {
    expect(screen.getByTestId('panel')).toHaveTextContent('panel 1');
    expect(screen.getByTestId('session')).toHaveTextContent('session 1');
    expect(panelMounted).toHaveBeenCalledOnce();
    expect(sessionOpened).toHaveBeenCalledOnce();
    expect(panelDisposed).not.toHaveBeenCalled();
    expect(sessionClosed).not.toHaveBeenCalled();
  }

  it('prepares links before PUSH and retains panel/session state through failure and retry', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId('panel'));
    fireEvent.click(screen.getByTestId('session'));
    const attempt = deferred();
    hook.mockImplementationOnce(() => attempt.promise);
    fireEvent.click(screen.getByRole('link', { name: 'Open B' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('cluster-b');
    expect(window.location.pathname).toBe('/c/cluster-a/pods');
    expect(screen.getByTestId('route')).toHaveTextContent('/c/cluster-a/pods');
    await pollOnlyA();
    await act(async () => attempt.reject(new Error('proxy failed\nretry later')));
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(retry).toHaveFocus();
    await pollOnlyA();
    expectPreserved();

    const recovery = deferred();
    hook.mockImplementationOnce(() => recovery.promise);
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Preparing cluster'));
    await pollOnlyA();
    await act(async () => recovery.resolve());
    await ready();
    expect(window.location.pathname).toBe('/c/cluster-b/pods');
    expect(screen.getByTestId('route')).toHaveTextContent('/c/cluster-b/pods');
    expectPreserved();
    expect(hook.mock.calls.map(([context]) => context.cluster)).toEqual([
      'cluster-a',
      'cluster-b',
      'cluster-b',
    ]);
    expect(requests.some(url => url.includes('/clusters/cluster-b/destination-view'))).toBe(true);

    act(() => appHistory.push('/c/cluster-b/services'));
    await ready();
    expect(hook).toHaveBeenCalledTimes(3);
    expectPreserved();
  });

  it('cancels a superseded REPLACE, ignores late progress/success, and aborts on Home', async () => {
    mount();
    await ready();
    const first = deferred();
    hook.mockImplementationOnce(() => first.promise);
    act(() => appHistory.replace('/c/cluster-b/pods'));
    await screen.findByRole('dialog');
    const abandoned = hook.mock.calls.at(-1)![0];

    const second = deferred();
    hook.mockImplementationOnce(() => second.promise);
    act(() => appHistory.push('/c/cluster-c/pods'));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('cluster-c'));
    expect(abandoned.signal?.aborted).toBe(true);
    await act(async () => {
      abandoned.reportProgress?.('obsolete');
      first.resolve();
    });
    expect(window.location.pathname).toBe('/c/cluster-a/pods');
    expect(screen.queryByText('obsolete')).not.toBeInTheDocument();
    const cancelled = hook.mock.calls.at(-1)![0];
    fireEvent.click(screen.getByRole('link', { name: 'Back to clusters' }));
    await ready();
    expect(cancelled.signal?.aborted).toBe(true);
    expect(window.location.pathname).toBe('/');
    await act(async () => second.resolve());
    expect(window.location.pathname).toBe('/');
    expect(panelMounted).toHaveBeenCalledOnce();
    expect(sessionOpened).toHaveBeenCalledOnce();
  });

  it.each(['browser', 'hash'])(
    'keeps committed helpers safe during real %s back/forward POP without reversing the browser stack',
    async mode => {
      vi.mocked(isElectron).mockReturnValue(mode === 'hash');
      window.headlampBaseUrl = mode === 'browser' ? '/base' : '';
      window.history.replaceState(
        {},
        '',
        mode === 'hash' ? '/#/c/cluster-b/pods' : '/base/c/cluster-b/pods'
      );
      const history =
        mode === 'hash' ? createHashHistory() : createBrowserHistory({ basename: '/base' });
      history.push('/c/cluster-a/pods');
      const length = window.history.length;
      mount(history);
      await ready();
      fireEvent.click(screen.getByTestId('panel'));
      fireEvent.click(screen.getByTestId('session'));
      const back = deferred();
      hook.mockImplementationOnce(() => back.promise);
      act(() => appHistory.goBack());
      await screen.findByRole('dialog');

      expect(mode === 'hash' ? window.location.hash : window.location.pathname).toContain(
        '/c/cluster-b/pods'
      );
      expect(getCluster()).toBe('cluster-a');
      expect(getSelectedClusters()).toEqual(['cluster-a']);
      expect(screen.getByTestId('route')).toHaveTextContent('/c/cluster-a/pods');
      await pollOnlyA();
      expectPreserved();
      await act(async () => back.reject(new Error('POP preparation failed')));
      const retry = await screen.findByRole('button', { name: 'Retry' });
      await pollOnlyA();
      const recovered = deferred();
      hook.mockImplementationOnce(() => recovered.promise);
      fireEvent.click(retry);
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveTextContent('Preparing cluster')
      );
      await pollOnlyA();
      await act(async () => recovered.resolve());
      await ready();
      expect(getCluster()).toBe('cluster-b');
      expect(screen.getByTestId('route')).toHaveTextContent('/c/cluster-b/pods');
      expectPreserved();
      expect(window.history.length).toBe(length);
      await act(async () => await new Promise(resolve => setTimeout(resolve, 10)));

      const forward = deferred();
      hook.mockImplementationOnce(() => forward.promise);
      act(() => appHistory.goForward());
      await screen.findByRole('dialog');
      expect(mode === 'hash' ? window.location.hash : window.location.pathname).toContain(
        '/c/cluster-a/pods'
      );
      expect(getCluster()).toBe('cluster-b');
      await act(async () => await vi.advanceTimersByTimeAsync(1000));
      expect(timerSelection).toHaveBeenLastCalledWith('cluster-b', ['cluster-b']);
      await act(async () => forward.resolve());
      await ready();
      expect(getCluster()).toBe('cluster-a');
      expect(hook.mock.calls.map(([context]) => context.cluster)).toEqual([
        'cluster-a',
        'cluster-b',
        'cluster-b',
        'cluster-a',
      ]);
      expect(window.history.length).toBe(length);
      expectPreserved();
    }
  );

  it('handles a second POP and Home cancellation without exposing the abandoned cluster', async () => {
    window.history.replaceState({}, '', '/c/cluster-b/pods');
    const history = createBrowserHistory();
    history.push('/c/cluster-a/pods');
    mount(history);
    await ready();
    const opening = deferred();
    hook.mockImplementationOnce(() => opening.promise);
    act(() => appHistory.goBack());
    await screen.findByRole('dialog');
    const abandoned = hook.mock.calls.at(-1)![0];

    act(() => appHistory.goForward());
    await ready();
    expect(abandoned.signal?.aborted).toBe(true);
    expect(window.location.pathname).toBe('/c/cluster-a/pods');
    await act(async () => opening.resolve());
    await pollOnlyA();
    const next = deferred();
    hook.mockImplementationOnce(() => next.promise);
    act(() => appHistory.goBack());
    await screen.findByRole('dialog');
    const cancelled = hook.mock.calls.at(-1)![0];
    fireEvent.click(screen.getByRole('link', { name: 'Back to clusters' }));
    await ready();
    expect(cancelled.signal?.aborted).toBe(true);
    expect(getCluster()).toBeNull();
    expect(window.location.pathname).toBe('/');
    await act(async () => next.resolve());
    expect(getCluster()).toBeNull();
    expect(panelMounted).toHaveBeenCalledOnce();
    expect(sessionOpened).toHaveBeenCalledOnce();
  });

  it('preserves REPLACE search/hash/state and does not add a history entry', async () => {
    mount();
    await ready();
    const length = window.history.length;
    const opening = deferred();
    hook.mockImplementationOnce(() => opening.promise);
    act(() =>
      appHistory.replace({
        pathname: '/c/cluster-b/services',
        search: '?label=app',
        hash: '#details',
        state: { source: 'plugin' },
      })
    );
    await screen.findByRole('dialog');
    expect(window.location.pathname).toBe('/c/cluster-a/pods');
    await pollOnlyA();
    await act(async () => opening.resolve());
    await ready();
    expect(appHistory.location).toMatchObject({
      pathname: '/c/cluster-b/services',
      search: '?label=app',
      hash: '#details',
      state: { source: 'plugin' },
    });
    expect(window.history.length).toBe(length);
    expect(hook.mock.calls.map(([context]) => context.cluster)).toEqual(['cluster-a', 'cluster-b']);
  });

  it('retains mounts for immediately ignored hooks and for navigation with no hooks', async () => {
    mount();
    await ready();
    act(() => appHistory.push('/c/cluster-b/pods'));
    await ready();
    expect(getCluster()).toBe('cluster-b');
    expect(panelMounted).toHaveBeenCalledOnce();
    expect(sessionOpened).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(2);
    resetClusterPreOpenHooksForTests();
    act(() => store.dispatch(clusterPreOpenHooksChanged()));
    act(() => appHistory.push('/c/cluster-c/pods'));
    await ready();
    expect(getCluster()).toBe('cluster-c');
    expect(hook).toHaveBeenCalledTimes(2);
    expect(panelMounted).toHaveBeenCalledOnce();
    expect(sessionOpened).toHaveBeenCalledOnce();
  });

  it('handles a mount-time Redirect before parent layout effects start listening', async () => {
    resetClusterPreOpenHooksForTests();
    mount(createBrowserHistory(), true);
    await ready();
    expect(screen.getByTestId('route')).toHaveTextContent('/c/cluster-b/pods');
    expect(getCluster()).toBe('cluster-b');
    expect(hook).not.toHaveBeenCalled();
  });

  it('retains a programmatic navigation requested by a commit listener', async () => {
    mount();
    await ready();
    const opening = deferred();
    hook.mockImplementation(context =>
      context.cluster === 'cluster-c' ? opening.promise : Promise.resolve()
    );
    const unlisten = appHistory.listen(location => {
      if (location.pathname === '/c/cluster-b/pods') {
        appHistory.push('/c/cluster-c/pods');
      }
    });
    try {
      act(() => appHistory.push('/c/cluster-b/pods'));
      await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('cluster-c'));
      expect(getCluster()).toBe('cluster-b');
      expect(requests.some(url => url.includes('/clusters/cluster-c/'))).toBe(false);
      await act(async () => opening.resolve());
      await ready();
      expect(getCluster()).toBe('cluster-c');
      expect(hook.mock.calls.map(([context]) => context.cluster)).toEqual([
        'cluster-a',
        'cluster-b',
        'cluster-c',
      ]);
      expect(panelMounted).toHaveBeenCalledOnce();
      expect(sessionOpened).toHaveBeenCalledOnce();
    } finally {
      unlisten();
    }
  });

  it.each(['browser', 'hash'])(
    'retains the %s cold-link gate and waits for configuration',
    async mode => {
      vi.mocked(isElectron).mockReturnValue(mode === 'hash');
      window.history.replaceState(
        {},
        '',
        mode === 'hash' ? '/#/c/cluster-a/pods' : '/c/cluster-a/pods'
      );
      store.dispatch(setConfig({ clusters: null, isDynamicClusterEnabled: true }));
      store.dispatch(setStatelessConfig({ statelessClusters: null }));
      const opening = deferred();
      hook.mockImplementationOnce(() => opening.promise);
      mount(mode === 'hash' ? createHashHistory() : createBrowserHistory());
      await screen.findByRole('dialog');
      expect(hook).not.toHaveBeenCalled();
      expect(panelMounted).not.toHaveBeenCalled();
      act(() => store.dispatch(setConfig({ clusters })));
      expect(hook).not.toHaveBeenCalled();
      act(() => store.dispatch(setStatelessConfig({ statelessClusters: {} })));
      await waitFor(() => expect(hook).toHaveBeenCalledOnce());
      expect(panelMounted).not.toHaveBeenCalled();
      await act(async () => opening.resolve());
      await ready();
      expect(hook).toHaveBeenCalledOnce();
    }
  );

  it('skips combined-cluster preparation, but re-prepares a subsequent single-cluster open', async () => {
    mount();
    await ready();
    act(() => appHistory.push('/c/cluster-a+cluster-b/pods'));
    await ready();
    expect(getSelectedClusters()).toEqual(['cluster-a', 'cluster-b']);
    expect(hook).toHaveBeenCalledOnce();
    await act(async () => await new Promise(resolve => setTimeout(resolve, 10)));
    const opening = deferred();
    hook.mockImplementationOnce(() => opening.promise);
    act(() => appHistory.replace('/c/cluster-a/pods'));
    await screen.findByRole('dialog');
    expect(getSelectedClusters()).toEqual(['cluster-a', 'cluster-b']);
    expect(panelMounted).toHaveBeenCalledOnce();
    await act(async () => opening.resolve());
    await ready();
    expect(getSelectedClusters()).toEqual(['cluster-a']);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(panelMounted).toHaveBeenCalledOnce();
  });

  it('aborts pending navigation on router unmount even when a hook ignores cancellation', async () => {
    const view = mount();
    await ready();
    hook.mockImplementationOnce(() => new Promise(() => {}));
    act(() => appHistory.push('/c/cluster-b/pods'));
    await screen.findByRole('dialog');
    const context = hook.mock.calls.at(-1)![0];
    view.unmount();
    await waitFor(() => expect(context.signal?.aborted).toBe(true));
    await waitFor(() =>
      expect(store.getState().clusterProvider.preparing['cluster-b']).toBeUndefined()
    );
  });
});
