/*
 * Copyright 2026 The Kubernetes Authors
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
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { useClusterPreOpen } from '../components/App/useClusterPreOpen';
import { ApiError } from '../lib/k8s/api/v2/ApiError';
import { clusterFetch } from '../lib/k8s/api/v2/fetch';
import {
  registerClusterPreOpenHook,
  resetClusterPreOpenHooksForTests,
} from '../plugin/clusterPreOpen';
import pluginsReducer, { pluginsLoaded, pluginsLoadFailed } from '../plugin/pluginsSlice';
import clusterProviderReducer, {
  ClusterPreOpenContext,
  clusterPreOpenHooksChanged,
} from '../redux/clusterProviderSlice';
import configReducer, {
  setConfig,
  setStatelessConfig,
  setStatelessConfigError,
} from '../redux/configSlice';
import adminSettingsReducer, { setAdminSettings, SettingsSource } from './adminSettingsSlice';
import { useClusterDefinedSettings } from './fetchClusterSettings';

vi.mock('../lib/k8s/api/v2/fetch', () => ({ clusterFetch: vi.fn() }));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function makeStore() {
  return configureStore({
    reducer: {
      config: configReducer,
      adminSettings: adminSettingsReducer,
      clusterProvider: clusterProviderReducer,
      plugins: pluginsReducer,
    },
  });
}

describe('cluster-defined settings preparation', () => {
  let client: QueryClient;
  let store: ReturnType<typeof makeStore>;
  let hook: ReturnType<typeof vi.fn<(context: ClusterPreOpenContext) => Promise<void>>>;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
  const setSources = (sources: Record<string, SettingsSource[]>) =>
    store.dispatch(
      setAdminSettings({
        sources,
        defaults: {},
        display: {},
        clusterDefinedSettings: {},
        clusterDefined: {},
      })
    );

  beforeEach(() => {
    vi.clearAllMocks();
    resetClusterPreOpenHooksForTests();
    store = makeStore();
    store.dispatch(
      setConfig({
        clusters: {
          'cluster-a': { name: 'cluster-a', auth_type: '' },
          'cluster-b': { name: 'cluster-b', auth_type: '' },
        },
      })
    );
    setSources({ 'cluster-a': [{ name: 'settings' }] });
    client = new QueryClient();
    hook = vi.fn(async () => {});
    vi.mocked(clusterFetch).mockImplementation(
      async (_url, { cluster }) =>
        new Response(
          JSON.stringify({ data: { 'settings.json': JSON.stringify({ theme: cluster }) } })
        )
    );
  });

  afterEach(async () => {
    cleanup();
    await client.cancelQueries();
    client.clear();
    resetClusterPreOpenHooksForTests();
    vi.restoreAllMocks();
  });

  function register() {
    registerClusterPreOpenHook(hook);
    store.dispatch(clusterPreOpenHooksChanged());
  }

  it('keeps known backend settings gated until failed stored overrides successfully reload', async () => {
    store.dispatch(
      setConfig({
        clusters: { 'cluster-a': { name: 'cluster-a', auth_type: '' } },
        isDynamicClusterEnabled: true,
      })
    );
    store.dispatch(pluginsLoaded());
    register();
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    expect(hook).not.toHaveBeenCalled();
    expect(clusterFetch).not.toHaveBeenCalled();

    act(() => store.dispatch(setStatelessConfigError('stored contexts unavailable')));
    expect(hook).not.toHaveBeenCalled();
    expect(clusterFetch).not.toHaveBeenCalled();
    expect(store.getState().config.statelessClusters).toBeNull();
    expect(store.getState().config.statelessConfigError).toBe('stored contexts unavailable');

    const stored = { name: 'cluster-a', auth_type: '', meta_data: { connection: 'stored' } };
    act(() => {
      store.dispatch(setStatelessConfig({ statelessClusters: { 'cluster-a': stored } }));
      store.dispatch(setStatelessConfigError(null));
    });
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
        theme: 'cluster-a',
      })
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0][0].clusterConf).toEqual(stored);
  });

  it.each([false, true])(
    'does not read settings after plugin initialization fails (hooks: %s)',
    hasHooks => {
      store.dispatch(pluginsLoaded());
      store.dispatch(pluginsLoadFailed('provider discovery failed'));
      if (hasHooks) register();
      renderHook(() => useClusterDefinedSettings(), { wrapper });
      expect(hook).not.toHaveBeenCalled();
      expect(clusterFetch).not.toHaveBeenCalled();
    }
  );

  it('shares connection identity with navigation and never reuses backend preparation for a stored override', async () => {
    store.dispatch(pluginsLoaded());
    register();
    const gate = renderHook(() => useClusterPreOpen(['cluster-a']), { wrapper });
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    await waitFor(() => expect(clusterFetch).toHaveBeenCalledOnce());
    expect(hook).toHaveBeenCalledOnce();
    expect(gate.result.current.isSuccess).toBe(true);

    const equivalent = { auth_type: '', name: 'cluster-a' };
    act(() => store.dispatch(setConfig({ clusters: { 'cluster-a': equivalent } })));
    expect(gate.result.current.isSuccess).toBe(true);
    expect(hook).toHaveBeenCalledOnce();
    expect(clusterFetch).toHaveBeenCalledOnce();

    const storedPreparation = deferred();
    hook.mockImplementationOnce(() => storedPreparation.promise);
    act(() =>
      store.dispatch(setStatelessConfig({ statelessClusters: { 'cluster-a': equivalent } }))
    );
    await waitFor(() => expect(hook).toHaveBeenCalledTimes(2));
    expect(gate.result.current.isSuccess).toBe(false);
    expect(clusterFetch).toHaveBeenCalledOnce();
    await act(async () => storedPreparation.resolve());
    await waitFor(() => expect(clusterFetch).toHaveBeenCalledTimes(2));
    expect(gate.result.current.isSuccess).toBe(true);
    expect(hook).toHaveBeenCalledTimes(2);

    act(() =>
      store.dispatch(setStatelessConfig({ statelessClusters: { 'cluster-a': { ...equivalent } } }))
    );
    expect(gate.result.current.isSuccess).toBe(true);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(clusterFetch).toHaveBeenCalledTimes(2);

    act(() => {
      store.dispatch(
        setConfig({
          clusters: { 'cluster-a': equivalent },
          isDynamicClusterEnabled: true,
        })
      );
      store.dispatch(setStatelessConfigError('new stored override could not be parsed'));
    });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['cluster-defined-settings'] });
    });
    expect(gate.result.current.isError).toBe(true);
    expect(gate.result.current.isSuccess).toBe(false);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(clusterFetch).toHaveBeenCalledTimes(2);
    expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
      theme: 'cluster-a',
    });
  });

  it('retains successful settings while a new hook revision waits or fails, replacing only successful reads', async () => {
    store.dispatch(pluginsLoaded());
    register();
    setSources({ '*': [{ name: 'settings' }] });
    const dispatch = vi.spyOn(store, 'dispatch');
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings).toEqual({
        'cluster-a': { theme: 'cluster-a' },
        'cluster-b': { theme: 'cluster-b' },
      })
    );
    const existing = store.getState().adminSettings.clusterSettings;
    const initialReads = vi.mocked(clusterFetch).mock.calls.length;
    const preparation = deferred();
    hook.mockImplementation(context =>
      context.cluster === 'cluster-a' ? preparation.promise : Promise.resolve()
    );
    act(() => store.dispatch(clusterPreOpenHooksChanged()));
    await waitFor(() => expect(hook).toHaveBeenCalledTimes(4));
    expect(store.getState().adminSettings.clusterSettings['cluster-a']).toBe(existing['cluster-a']);
    await act(async () => preparation.reject(new Error('replacement proxy failed')));
    await waitFor(() =>
      expect(
        client.getQueryCache().find({
          queryKey: ['cluster-defined-settings', 'cluster-a'],
          exact: false,
          predicate: query => query.state.status === 'error',
        })
      ).toBeDefined()
    );
    expect(store.getState().adminSettings.clusterSettings['cluster-a']).toBe(existing['cluster-a']);
    expect(
      vi
        .mocked(clusterFetch)
        .mock.calls.slice(initialReads)
        .map(([, options]) => options.cluster)
    ).not.toContain('cluster-a');

    act(() =>
      store.dispatch(setConfig({ clusters: { 'cluster-a': { name: 'cluster-a', auth_type: '' } } }))
    );
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings).toEqual({
        'cluster-a': { theme: 'cluster-a' },
      })
    );

    hook.mockResolvedValue(undefined);
    vi.mocked(clusterFetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { 'settings.json': '{"theme":"replacement"}' } }))
    );
    act(() => store.dispatch(clusterPreOpenHooksChanged()));
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
        theme: 'replacement',
      })
    );
    const settingsDispatches = () =>
      dispatch.mock.calls.filter(([action]) => action.type === 'adminSettings/setClusterSettings')
        .length;
    const count = settingsDispatches();
    act(() =>
      store.dispatch(setConfig({ clusters: { 'cluster-a': { name: 'cluster-a', auth_type: '' } } }))
    );
    await act(async () => {});
    expect(settingsDispatches()).toBe(count);
  });

  it('keeps the last successful settings on replacement read failure without disguising query errors', async () => {
    store.dispatch(pluginsLoaded());
    register();
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
        theme: 'cluster-a',
      })
    );
    const readError = new Error('settings source unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(clusterFetch).mockRejectedValue(readError);
    act(() => store.dispatch(clusterPreOpenHooksChanged()));
    await waitFor(() =>
      expect(
        client.getQueryCache().find({
          queryKey: ['cluster-defined-settings', 'cluster-a'],
          exact: false,
          predicate: query => query.state.status === 'error',
        })?.state.error
      ).toBe(readError)
    );
    expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
      theme: 'cluster-a',
    });
    expect(consoleError).toHaveBeenCalledWith('Error getting cluster settings source:', readError);

    vi.mocked(clusterFetch).mockImplementation(
      async () => new Response(JSON.stringify({ data: {} }))
    );
    act(() => store.dispatch(clusterPreOpenHooksChanged()));
    await waitFor(() => expect(store.getState().adminSettings.clusterSettings).toEqual({}));
  });

  it('skips optional missing sources and still merges real partial multi-source results in order', async () => {
    store.dispatch(pluginsLoaded());
    register();
    setSources({
      'cluster-a': [
        { name: 'first' },
        { name: 'missing' },
        { name: 'unavailable' },
        { name: 'last' },
      ],
    });
    const readError = new ApiError('Forbidden', { status: 403 });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(clusterFetch).mockImplementation(async url => {
      if (String(url).endsWith('/missing')) throw new ApiError('Not found', { status: 404 });
      if (String(url).endsWith('/unavailable')) throw readError;
      return new Response(
        JSON.stringify({
          data: {
            'settings.json': JSON.stringify(
              String(url).endsWith('/first')
                ? { nested: { theme: 'first', inherited: true } }
                : { nested: { theme: 'last' } }
            ),
          },
        })
      );
    });
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
        nested: { theme: 'last', inherited: true },
      })
    );
    expect(clusterFetch).toHaveBeenCalledTimes(4);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      'Error getting cluster settings source:',
      readError
    );

    act(() => setSources({ 'cluster-a': [{ name: 'missing' }] }));
    await waitFor(() => expect(store.getState().adminSettings.clusterSettings).toEqual({}));
  });

  it('waits for plugin registration and each target, then reads and merges its sources immediately', async () => {
    setSources({
      '*': [{ name: 'defaults' }],
      'cluster-a': [{ name: 'override', type: 'Secret', namespace: 'custom' }],
    });
    vi.mocked(clusterFetch).mockImplementation(
      async url =>
        new Response(
          JSON.stringify({
            data: {
              'settings.json': String(url).includes('/secrets/')
                ? btoa(JSON.stringify({ nested: { theme: 'override' } }))
                : JSON.stringify({ nested: { theme: 'default', inherited: true } }),
            },
          })
        )
    );
    const first = deferred();
    const second = deferred();
    hook.mockImplementation(context =>
      context.cluster === 'cluster-a' ? first.promise : second.promise
    );
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    expect(clusterFetch).not.toHaveBeenCalled();
    act(() => register());
    expect(hook).not.toHaveBeenCalled();

    act(() => store.dispatch(pluginsLoaded()));
    await waitFor(() => expect(hook).toHaveBeenCalledTimes(2));
    expect(clusterFetch).not.toHaveBeenCalled();
    await act(async () => first.resolve());
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
        nested: { theme: 'override', inherited: true },
      })
    );
    expect(clusterFetch).toHaveBeenCalledTimes(2);
    expect(clusterFetch).toHaveBeenLastCalledWith(
      '/api/v1/namespaces/custom/secrets/override',
      expect.objectContaining({ cluster: 'cluster-a' })
    );
    expect(store.getState().adminSettings.clusterSettings['cluster-b']).toBeUndefined();

    await act(async () => second.resolve());
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-b']).toEqual({
        nested: { theme: 'default', inherited: true },
      })
    );
    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook.mock.calls.map(([context]) => context.clusterConf)).toEqual([
      expect.objectContaining({ name: 'cluster-a' }),
      expect.objectContaining({ name: 'cluster-b' }),
    ]);
  });

  it('shares an open-cluster run without pinning its success after leaving', async () => {
    store.dispatch(pluginsLoaded());
    register();
    const opening = deferred();
    hook.mockImplementationOnce(() => opening.promise);
    const gate = renderHook(() => useClusterPreOpen(['cluster-a']), { wrapper });
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    await waitFor(() => expect(hook).toHaveBeenCalledOnce());
    expect(clusterFetch).not.toHaveBeenCalled();
    await act(async () => opening.resolve());
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
        theme: 'cluster-a',
      })
    );
    expect(gate.result.current.isSuccess).toBe(true);
    expect(hook).toHaveBeenCalledOnce();
    gate.unmount();
    await waitFor(() =>
      expect(
        client.getQueryCache().find({ queryKey: ['clusterPreOpen', 'cluster-a'], exact: false })
      ).toBeUndefined()
    );
    const reopened = renderHook(() => useClusterPreOpen(['cluster-a']), { wrapper });
    await waitFor(() => expect(reopened.result.current.isSuccess).toBe(true));
    expect(hook).toHaveBeenCalledTimes(2);
  });

  it('refetches immediately after a gate retry without waiting for the settings poll', async () => {
    store.dispatch(pluginsLoaded());
    register();
    hook.mockRejectedValueOnce(new Error('proxy failed'));
    const gate = renderHook(() => useClusterPreOpen(['cluster-a']), { wrapper });
    renderHook(() => useClusterDefinedSettings(), { wrapper });
    await waitFor(() =>
      expect(
        client.getQueryCache().find({ queryKey: ['cluster-defined-settings'], exact: false })?.state
          .status
      ).toBe('error')
    );
    expect(gate.result.current.isError).toBe(true);
    expect(clusterFetch).not.toHaveBeenCalled();
    act(() => gate.result.current.retry());
    await waitFor(() =>
      expect(store.getState().adminSettings.clusterSettings['cluster-a']).toEqual({
        theme: 'cluster-a',
      })
    );
    expect(hook).toHaveBeenCalledTimes(2);
    expect(clusterFetch).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'cancels a settings read without cancelling another preparation owner (gate: %s)',
    async hasGate => {
      store.dispatch(pluginsLoaded());
      register();
      const opening = deferred();
      hook.mockImplementationOnce(() => opening.promise);
      const gate = hasGate ? renderHook(() => useClusterPreOpen(['cluster-a']), { wrapper }) : null;
      const settings = renderHook(() => useClusterDefinedSettings(), { wrapper });
      await waitFor(() => expect(hook).toHaveBeenCalledOnce());
      const signal = hook.mock.calls[0][0].signal!;
      settings.unmount();
      expect(signal.aborted).toBe(!hasGate);
      await act(async () => opening.resolve());
      if (gate) await waitFor(() => expect(gate.result.current.isSuccess).toBe(true));
      expect(clusterFetch).not.toHaveBeenCalled();
      expect(store.getState().adminSettings.clusterSettings).toEqual({});
    }
  );

  it('aborts an in-flight source read and never starts its next source', async () => {
    store.dispatch(pluginsLoaded());
    register();
    setSources({ 'cluster-a': [{ name: 'first' }, { name: 'second' }] });
    let resolveRead!: (response: Response) => void;
    vi.mocked(clusterFetch).mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveRead = resolve;
        })
    );
    const settings = renderHook(() => useClusterDefinedSettings(), { wrapper });
    await waitFor(() => expect(clusterFetch).toHaveBeenCalledOnce());
    const signal = vi.mocked(clusterFetch).mock.calls[0][1].signal!;
    settings.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolveRead(
        new Response(JSON.stringify({ data: { 'settings.json': '{"theme":"obsolete"}' } }))
      )
    );
    expect(clusterFetch).toHaveBeenCalledOnce();
    expect(store.getState().adminSettings.clusterSettings).toEqual({});
  });
});
