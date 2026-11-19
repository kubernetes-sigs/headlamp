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

import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { runClusterPreOpenHooks } from '../../plugin/clusterPreOpen';
import { useClusterPreOpen } from './useClusterPreOpen';

const { dispatch, config } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: { isDynamicClusterEnabled: false, statelessClusters: null as null | object },
}));

vi.mock('react-redux', () => ({ useDispatch: () => dispatch }));
vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => 'cluster-a'),
  useClustersConf: vi.fn(() => ({ 'cluster-a': {} })),
  useSelectedClusters: vi.fn(() => ['cluster-a']),
}));
vi.mock('../../plugin/clusterPreOpen', () => ({
  hasClusterPreOpenHooks: () => true,
  runClusterPreOpenHooks: vi.fn(),
}));
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: (state: unknown) => unknown) =>
    selector({
      clusterProvider: { preOpenHooksRevision: 1, preparing: {} },
      config,
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

  it('reconsiders a no-op success when missing stateless config becomes available', async () => {
    config.isDynamicClusterEnabled = true;
    // A failed stateless fetch settles to an empty config before a later retry.
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
});
