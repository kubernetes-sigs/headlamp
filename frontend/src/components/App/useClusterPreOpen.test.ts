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

import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { hasClusterPreOpenHooks, runClusterPreOpenHooks } from '../../plugin/clusterPreOpen';
import { reloadPage } from '../../plugin/pluginsSlice';
import { fetchStatelessClusterKubeConfigs } from '../../stateless';
import { useClusterPreOpen } from './useClusterPreOpen';

const { dispatch, config, plugins } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  plugins: { loaded: true, loadError: null as string | null },
  config: {
    isDynamicClusterEnabled: false,
    statelessClusters: null as null | object,
    statelessConfigError: null as string | null,
  },
}));

vi.mock('react-redux', () => ({ useDispatch: () => dispatch }));
vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => 'cluster-a'),
  useClustersConf: vi.fn(() => ({ 'cluster-a': {} })),
  useSelectedClusters: vi.fn(() => ['cluster-a']),
}));
vi.mock('../../plugin/clusterPreOpen', () => ({
  hasClusterPreOpenHooks: vi.fn(() => true),
  runClusterPreOpenHooks: vi.fn(),
}));
vi.mock('../../stateless', () => ({ fetchStatelessClusterKubeConfigs: vi.fn() }));
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: (state: unknown) => unknown) =>
    selector({
      clusterProvider: { preOpenHooksRevision: 1, preparing: {} },
      config,
      plugins,
    }),
}));

describe('useClusterPreOpen', () => {
  let client: QueryClient;
  const clusterConf = { name: 'cluster-a', auth_type: '' };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  beforeEach(() => {
    vi.clearAllMocks();
    config.isDynamicClusterEnabled = false;
    config.statelessClusters = null;
    config.statelessConfigError = null;
    plugins.loaded = true;
    plugins.loadError = null;
    vi.mocked(hasClusterPreOpenHooks).mockReturnValue(true);
    vi.mocked(useCluster).mockReturnValue('cluster-a');
    vi.mocked(useSelectedClusters).mockReturnValue(['cluster-a']);
    vi.mocked(useClustersConf).mockReturnValue({
      'cluster-a': clusterConf,
    });
    vi.mocked(runClusterPreOpenHooks).mockResolvedValue(undefined);
    client = new QueryClient();
  });

  afterEach(async () => {
    cleanup();
    await client.cancelQueries();
    client.clear();
    onlineManager.setOnline(true);
  });

  it('runs preparation while React Query is offline', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useClusterPreOpen(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'keeps known backend targets gated after unresolved stored overrides fail (hooks: %s)',
    async hasHooks => {
      vi.mocked(hasClusterPreOpenHooks).mockReturnValue(hasHooks);
      config.isDynamicClusterEnabled = true;
      const { result, rerender } = renderHook(({ destination }) => useClusterPreOpen(destination), {
        wrapper,
        initialProps: { destination: ['cluster-a'] },
      });
      expect(result.current.enabled).toBe(true);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(runClusterPreOpenHooks).not.toHaveBeenCalled();

      config.statelessConfigError = 'stored config unavailable';
      rerender({ destination: ['cluster-a'] });
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(new Error('stored config unavailable'));
      act(() => result.current.retry());
      expect(fetchStatelessClusterKubeConfigs).toHaveBeenCalledWith(dispatch);
      expect(runClusterPreOpenHooks).not.toHaveBeenCalled();

      config.statelessClusters = {};
      config.statelessConfigError = null;
      rerender({ destination: ['cluster-a'] });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(hasHooks ? 1 : 0);
    }
  );

  it.each([false, true])(
    'requires a safe reload after plugin initialization fails, including zero hooks (hooks: %s)',
    hasHooks => {
      vi.mocked(hasClusterPreOpenHooks).mockReturnValue(hasHooks);
      plugins.loadError = 'provider module failed';
      const { result, rerender } = renderHook(
        ({ destination }: { destination: string[] | undefined }) => useClusterPreOpen(destination),
        { wrapper, initialProps: { destination: undefined as string[] | undefined } }
      );
      for (const destination of [undefined, ['cluster-a']]) {
        rerender({ destination });
        expect(result.current.enabled).toBe(true);
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.isError).toBe(true);
        expect(result.current.error).toEqual(new Error('provider module failed'));
      }
      act(() => result.current.retry());
      expect(dispatch).toHaveBeenCalledWith(reloadPage());
      expect(runClusterPreOpenHooks).not.toHaveBeenCalled();
      expect(fetchStatelessClusterKubeConfigs).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'gates entry and Retry until plugin initialization, without blocking config discovery (hooks: %s)',
    async hasHooks => {
      vi.mocked(hasClusterPreOpenHooks).mockReturnValue(hasHooks);
      plugins.loaded = false;
      const loadConfig = vi.fn(async () => ({}));
      vi.mocked(runClusterPreOpenHooks).mockImplementation(async () => {
        if (!plugins.loaded) throw new Error('plugin not initialized');
      });
      const { result, rerender } = renderHook(
        () => {
          useQuery({ queryKey: ['cluster-fetch'], queryFn: loadConfig });
          return useClusterPreOpen();
        },
        { wrapper }
      );
      expect(result.current.enabled).toBe(true);
      expect(result.current.isSuccess).toBe(false);
      act(() => result.current.retry());
      await waitFor(() => expect(loadConfig).toHaveBeenCalledOnce());
      expect(runClusterPreOpenHooks).not.toHaveBeenCalled();
      expect(result.current.isError).toBe(false);

      plugins.loaded = true;
      rerender();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(hasHooks ? 1 : 0);
    }
  );

  it('surfaces initial configuration failure and retries the configuration request', async () => {
    const loadConfig = vi.fn<() => Promise<object>>(async () => {
      throw new Error('configuration unavailable');
    });
    vi.mocked(useClustersConf).mockReturnValue(null);
    const { result } = renderHook(
      () => {
        useQuery({ queryKey: ['cluster-fetch'], queryFn: loadConfig, retry: false });
        return useClusterPreOpen();
      },
      { wrapper }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('configuration unavailable'));
    expect(runClusterPreOpenHooks).not.toHaveBeenCalled();

    loadConfig.mockImplementation(async () => {
      vi.mocked(useClustersConf).mockReturnValue({ 'cluster-a': clusterConf });
      return {};
    });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(loadConfig).toHaveBeenCalledTimes(2);
    expect(runClusterPreOpenHooks).toHaveBeenCalledOnce();
  });

  it('retries stored configuration without running a null-config preparation', async () => {
    config.isDynamicClusterEnabled = true;
    config.statelessConfigError = 'parse unavailable';
    vi.mocked(useClustersConf).mockReturnValue({});
    const { result, rerender } = renderHook(() => useClusterPreOpen(['cluster-a']), { wrapper });
    expect(result.current.isError).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(runClusterPreOpenHooks).not.toHaveBeenCalled();
    act(() => result.current.retry());
    expect(fetchStatelessClusterKubeConfigs).toHaveBeenCalledWith(dispatch);
    expect(runClusterPreOpenHooks).not.toHaveBeenCalled();

    config.statelessClusters = { 'cluster-a': clusterConf };
    config.statelessConfigError = null;
    vi.mocked(useClustersConf).mockReturnValue({ 'cluster-a': clusterConf });
    rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenLastCalledWith(
      expect.objectContaining({ clusterConf }),
      expect.any(Function)
    );
  });

  it('does not prepare an abandoned destination when configuration retry succeeds later', async () => {
    let resolveConfig!: (config: object) => void;
    const loadConfig = vi.fn<() => Promise<object>>(async () => {
      throw new Error('configuration unavailable');
    });
    vi.mocked(useClustersConf).mockReturnValue(null);
    const { result, rerender } = renderHook(
      ({ destination }) => {
        useQuery({ queryKey: ['cluster-fetch'], queryFn: loadConfig, retry: false });
        return useClusterPreOpen(destination);
      },
      { wrapper, initialProps: { destination: ['cluster-a'] } }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    loadConfig.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveConfig = resolve;
        })
    );
    act(() => result.current.retry());
    await waitFor(() => expect(loadConfig).toHaveBeenCalledTimes(2));
    rerender({ destination: [] });
    vi.mocked(useClustersConf).mockReturnValue({ 'cluster-a': clusterConf });
    await act(async () => resolveConfig({}));
    expect(result.current.enabled).toBe(false);
    expect(runClusterPreOpenHooks).not.toHaveBeenCalled();
  });

  it('reconsiders a no-op success when missing stateless config becomes available', async () => {
    config.isDynamicClusterEnabled = true;
    // An actually empty store may later receive a destination kubeconfig.
    config.statelessClusters = {};
    vi.mocked(useClustersConf).mockReturnValue({});
    const { result, rerender } = renderHook(() => useClusterPreOpen(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clusterConf: null,
      }),
      expect.any(Function)
    );

    vi.mocked(useClustersConf).mockReturnValue({
      'cluster-a': clusterConf,
    });
    rerender();

    expect(result.current.isSuccess).toBe(false);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(2);
    expect(runClusterPreOpenHooks).toHaveBeenLastCalledWith(
      expect.objectContaining({ clusterConf }),
      expect.any(Function)
    );

    // Polling replaces config objects without reopening the cluster.
    vi.mocked(useClustersConf).mockReturnValue({
      'cluster-a': { ...clusterConf },
    });
    rerender();
    expect(result.current.isSuccess).toBe(true);
    expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(2);
  });

  it('gates even a prepared retained stored map after polling failure until overrides reload', async () => {
    config.isDynamicClusterEnabled = true;
    config.statelessClusters = { 'cluster-a': clusterConf };
    const { result, rerender } = renderHook(({ destination }) => useClusterPreOpen(destination), {
      wrapper,
      initialProps: { destination: ['cluster-a'] },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    config.statelessConfigError = 'parse unavailable';
    rerender({ destination: ['cluster-a'] });
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(runClusterPreOpenHooks).toHaveBeenCalledOnce();

    rerender({ destination: ['missing-destination'] });
    expect(result.current.isError).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(runClusterPreOpenHooks).toHaveBeenCalledOnce();
    act(() => result.current.retry());
    expect(fetchStatelessClusterKubeConfigs).toHaveBeenCalledOnce();
  });

  it('prepares changed connections and stored overrides without rerunning equivalent polls', async () => {
    config.statelessClusters = {};
    const backend = {
      ...clusterConf,
      meta_data: { provider: { connection: 'backend', region: 'west' } },
    };
    vi.mocked(useClustersConf).mockReturnValue({ 'cluster-a': backend });
    const { result, rerender } = renderHook(() => useClusterPreOpen(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenCalledOnce();

    vi.mocked(useClustersConf).mockReturnValue({
      'cluster-a': {
        auth_type: '',
        meta_data: { provider: { region: 'west', connection: 'backend' } },
        name: 'cluster-a',
      },
    });
    rerender();
    expect(result.current.isSuccess).toBe(true);
    expect(runClusterPreOpenHooks).toHaveBeenCalledOnce();

    // Even identical parsed metadata has a different request-layer provenance.
    config.statelessClusters = { 'cluster-a': backend };
    rerender();
    expect(result.current.isSuccess).toBe(false);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(2);

    const changed = { ...backend, meta_data: { provider: { connection: 'stored' } } };
    vi.mocked(useClustersConf).mockReturnValue({ 'cluster-a': changed });
    rerender();
    expect(result.current.isSuccess).toBe(false);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(3);
    expect(runClusterPreOpenHooks).toHaveBeenLastCalledWith(
      expect.objectContaining({ clusterConf: changed }),
      expect.any(Function)
    );
    vi.mocked(useClustersConf).mockReturnValue({ 'cluster-a': structuredClone(changed) });
    rerender();
    expect(result.current.isSuccess).toBe(true);
    expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(3);
  });

  it('aborts pending preparation on leaving and starts a fresh run on return', async () => {
    vi.mocked(runClusterPreOpenHooks).mockImplementation(() => new Promise(() => {}));
    const { rerender, unmount } = renderHook(() => useClusterPreOpen(), { wrapper });
    await waitFor(() => expect(runClusterPreOpenHooks).toHaveBeenCalledOnce());
    const firstSignal = vi.mocked(runClusterPreOpenHooks).mock.calls[0][0].signal!;

    vi.mocked(useCluster).mockReturnValue(null);
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    rerender();
    expect(firstSignal.aborted).toBe(true);

    vi.mocked(useCluster).mockReturnValue('cluster-a');
    vi.mocked(useSelectedClusters).mockReturnValue(['cluster-a']);
    rerender();
    await waitFor(() => expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(2));
    const secondSignal = vi.mocked(runClusterPreOpenHooks).mock.calls[1][0].signal!;
    expect(secondSignal).not.toBe(firstSignal);
    expect(secondSignal.aborted).toBe(false);
    act(() => unmount());
    expect(secondSignal.aborted).toBe(true);
  });

  it('aborts a stateless no-op run when config appears before it settles', async () => {
    vi.mocked(useClustersConf).mockReturnValue({});
    vi.mocked(runClusterPreOpenHooks).mockImplementationOnce(() => new Promise(() => {}));
    const { result, rerender } = renderHook(() => useClusterPreOpen(), { wrapper });
    await waitFor(() => expect(runClusterPreOpenHooks).toHaveBeenCalledOnce());
    const firstSignal = vi.mocked(runClusterPreOpenHooks).mock.calls[0][0].signal!;

    vi.mocked(useClustersConf).mockReturnValue({
      'cluster-a': clusterConf,
    });
    rerender();

    expect(firstSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending backend preparation when a same-name stored connection replaces it', async () => {
    vi.mocked(runClusterPreOpenHooks).mockImplementationOnce(() => new Promise(() => {}));
    const { result, rerender } = renderHook(() => useClusterPreOpen(), { wrapper });
    await waitFor(() => expect(runClusterPreOpenHooks).toHaveBeenCalledOnce());
    const backendSignal = vi.mocked(runClusterPreOpenHooks).mock.calls[0][0].signal!;

    config.statelessClusters = { 'cluster-a': clusterConf };
    rerender();

    expect(backendSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runClusterPreOpenHooks).toHaveBeenCalledTimes(2);
  });
});
