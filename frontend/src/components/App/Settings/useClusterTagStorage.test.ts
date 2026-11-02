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

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadClusterSettings, storeClusterSettings } from '../../../helpers/clusterSettings';
import type { Cluster } from '../../../lib/k8s/cluster';
import { useClusterTagStorage } from './useClusterTagStorage';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  update: vi.fn(),
  stateless: vi.fn(),
  parse: vi.fn(),
  configs: vi.fn(),
  config: { allowKubeconfigChanges: true, isDynamicClusterEnabled: true },
}));

vi.mock('react-redux', () => ({ useDispatch: () => mocks.dispatch }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { error: string }) => key.replace('{{ error }}', values?.error ?? ''),
  }),
}));
vi.mock('../../../redux/hooks', () => ({
  useTypedSelector: (selector: (state: { config: typeof mocks.config }) => unknown) =>
    selector({ config: mocks.config }),
}));
vi.mock('../../../redux/stores/store', () => ({
  default: { getState: () => ({ config: { statelessClusters: {} } }) },
}));
vi.mock('../../../lib/k8s/api/v1/clusterApi', () => ({
  updateClusterTags: mocks.update,
  parseKubeConfig: mocks.parse,
}));
vi.mock('../../../stateless/updateStatelessClusterTags', () => ({
  updateStatelessClusterTags: mocks.stateless,
  readStatelessClusterTagTarget: mocks.configs,
}));
vi.mock('../../../stateless', () => ({
  mergeStatelessConfigState: (_old: unknown, parsed: { clusters: Cluster[] }) => ({
    statelessClusters: Object.fromEntries(parsed.clusters.map(cluster => [cluster.name, cluster])),
  }),
}));
vi.mock('../../../helpers/isElectron', () => ({ isElectron: () => false }));

function cluster(source: string): Cluster {
  return { name: 'test', auth_type: '', meta_data: { source, clusterID: 'config+test' } };
}

describe('useClusterTagStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.config.allowKubeconfigChanges = true;
    mocks.config.isDynamicClusterEnabled = true;
    mocks.configs.mockResolvedValue('updated-base64');
  });

  it('saves to the server context and removes local overrides only after success', async () => {
    storeClusterSettings('test', { tags: { env: 'dev' }, defaultNamespace: 'work' });
    const config = { clusters: { test: cluster('kubeconfig') } };
    mocks.update.mockResolvedValue(config);
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('kubeconfig')));
    await act(async () => {
      expect(await result.current.save({ env: 'prod' })).toBe(true);
    });
    expect(mocks.update).toHaveBeenCalledWith('test', { env: 'prod' }, 'config+test');
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: config }));
    expect(mocks.stateless).not.toHaveBeenCalled();
    expect(loadClusterSettings('test')).toEqual({ defaultNamespace: 'work' });
  });

  it('leaves the draft and local tags intact after a server save failure', async () => {
    storeClusterSettings('test', { tags: { env: 'dev' } });
    mocks.update.mockRejectedValue(new Error('permission denied'));
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('kubeconfig')));
    await act(async () => {
      expect(await result.current.save({ env: 'prod' })).toBe(false);
    });
    expect(result.current.error).toContain('permission denied');
    expect(result.current.saving).toBe(false);
    expect(loadClusterSettings('test').tags).toEqual({ env: 'dev' });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('updates browser kubeconfigs and refreshes the parsed stateless config', async () => {
    mocks.stateless.mockResolvedValue('updated-base64');
    mocks.parse.mockResolvedValue({ clusters: [cluster('dynamic_cluster')] });
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('dynamic_cluster')));
    await act(async () => {
      expect(await result.current.save({ env: 'prod' })).toBe(true);
    });
    expect(mocks.parse).toHaveBeenCalledWith({ kubeconfig: 'updated-base64' });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { statelessClusters: { test: cluster('dynamic_cluster') } },
      })
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an obsolete browser snapshot and preserves a newer local override', async () => {
    let finish!: (config: { clusters: Cluster[] }) => void;
    mocks.stateless.mockResolvedValue('updated-base64');
    mocks.parse.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    storeClusterSettings('test', { tags: { env: 'old-override' } });
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('dynamic_cluster')));
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save({ env: 'submitted' });
    });
    await waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(1));
    mocks.configs.mockResolvedValueOnce('replacement-document');
    storeClusterSettings('test', { tags: { env: 'new-override' } });
    await act(async () => {
      finish({ clusters: [cluster('dynamic_cluster')] });
      expect(await saving).toBe(false);
    });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(result.current.error).toContain('changed while saving');
    expect(loadClusterSettings('test').tags).toEqual({ env: 'new-override' });
  });

  it('does not publish or clear an override if the browser target becomes ambiguous during parsing', async () => {
    mocks.stateless.mockResolvedValue('updated-base64');
    mocks.parse.mockResolvedValue({ clusters: [cluster('dynamic_cluster')] });
    mocks.configs.mockRejectedValueOnce(new Error('Ambiguous browser kubeconfig context'));
    storeClusterSettings('test', { tags: { env: 'override' } });
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('dynamic_cluster')));
    await act(async () => {
      expect(await result.current.save({ env: 'submitted' })).toBe(false);
    });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Ambiguous');
    expect(loadClusterSettings('test').tags).toEqual({ env: 'override' });
  });

  it('preserves a newer local override even when context persistence succeeds', async () => {
    let finish!: (config: { clusters: Record<string, Cluster> }) => void;
    mocks.update.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    storeClusterSettings('test', { tags: { env: 'old-override' } });
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('kubeconfig')));
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save({ env: 'submitted' });
    });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    storeClusterSettings('test', { tags: { env: 'new-override' } });
    await act(async () => {
      finish({ clusters: { test: cluster('kubeconfig') } });
      expect(await saving).toBe(true);
    });
    expect(loadClusterSettings('test').tags).toEqual({ env: 'new-override' });
  });

  it('does not silently fall back after a stateless write failure', async () => {
    mocks.stateless.mockRejectedValue(new Error('quota exceeded'));
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('dynamic_cluster')));
    await act(async () => {
      expect(await result.current.save({ env: 'prod' })).toBe(false);
    });
    expect(result.current.error).toContain('quota exceeded');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(loadClusterSettings('test')).toEqual({});
  });

  it('rejects a missing browser target without writing to a same-named server cluster', async () => {
    const browserCluster = cluster('dynamic_cluster');
    delete browserCluster.meta_data!.clusterID;
    storeClusterSettings('test', { tags: { env: 'local' } });
    mocks.stateless.mockResolvedValue(null);
    const { result } = renderHook(() => useClusterTagStorage('test', browserCluster));
    await act(async () => {
      expect(await result.current.save({ env: 'prod' })).toBe(false);
    });
    expect(result.current.error).toContain('no longer exists');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(loadClusterSettings('test').tags).toEqual({ env: 'local' });
  });

  it('uses local tags for a manual in-memory server context without a persisted identity', async () => {
    const manualCluster: Cluster = {
      name: 'test',
      server: 'https://manual.example',
      auth_type: '',
      meta_data: { source: 'dynamic_cluster', origin: { kubeconfig: '' }, clusterID: '' },
    };
    const { result } = renderHook(() => useClusterTagStorage('test', manualCluster));
    expect(result.current.helpText).toContain('browser only');
    await act(async () => {
      expect(await result.current.save({ env: 'prod' })).toBe(true);
    });
    expect(loadClusterSettings('test').tags).toEqual({ env: 'prod' });
    expect(mocks.stateless).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('falls back only for a captured server-backed dynamic identity', async () => {
    mocks.stateless.mockResolvedValue(null);
    mocks.update.mockResolvedValue({ clusters: { test: cluster('dynamic_cluster') } });
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('dynamic_cluster')));
    await act(async () => {
      expect(await result.current.save({ env: 'prod' })).toBe(true);
    });
    expect(mocks.update).toHaveBeenCalledWith('test', { env: 'prod' }, 'config+test');
  });

  it('serializes overlapping browser saves through parse and publication across hook instances', async () => {
    const firstCluster = { ...cluster('dynamic_cluster'), name: 'a' };
    const secondCluster = { ...cluster('dynamic_cluster'), name: 'b' };
    let completeFirst!: (config: { clusters: Cluster[] }) => void;
    const firstParse = new Promise<{ clusters: Cluster[] }>(resolve => {
      completeFirst = resolve;
    });
    const oldSnapshot = {
      clusters: [
        { ...firstCluster, meta_data: { extensions: { headlamp_info: { tags: { env: 'a' } } } } },
        { ...secondCluster, meta_data: { extensions: { headlamp_info: { tags: {} } } } },
      ],
    };
    const newSnapshot = {
      clusters: [
        oldSnapshot.clusters[0],
        { ...secondCluster, meta_data: { extensions: { headlamp_info: { tags: { env: 'b' } } } } },
      ],
    };
    mocks.stateless.mockResolvedValueOnce('snapshot-a').mockResolvedValueOnce('snapshot-b');
    mocks.configs.mockResolvedValueOnce('snapshot-a').mockResolvedValueOnce('snapshot-b');
    mocks.parse.mockReturnValueOnce(firstParse).mockResolvedValueOnce(newSnapshot);
    const first = renderHook(() => useClusterTagStorage('a', firstCluster));
    const second = renderHook(() => useClusterTagStorage('b', secondCluster));
    let saveA!: Promise<boolean>;
    let saveB!: Promise<boolean>;
    act(() => {
      saveA = first.result.current.save({ env: 'a' });
      saveB = second.result.current.save({ env: 'b' });
    });
    await waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(1));
    expect(mocks.stateless).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await act(async () => {
      completeFirst(oldSnapshot);
      expect(await saveA).toBe(true);
      expect(await saveB).toBe(true);
    });
    expect(mocks.parse.mock.calls).toEqual([
      [{ kubeconfig: 'snapshot-a' }],
      [{ kubeconfig: 'snapshot-b' }],
    ]);
    expect(mocks.dispatch.mock.calls.map(([action]) => action.payload.statelessClusters.b)).toEqual(
      [undefined, newSnapshot.clusters[1]]
    );
  });

  it('does not revive an old failure after selecting another cluster and returning', async () => {
    let fail!: (error: Error) => void;
    mocks.update.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)));
    const { result, rerender } = renderHook(
      ({ name }) => useClusterTagStorage(name, { ...cluster('kubeconfig'), name }),
      { initialProps: { name: 'a' } }
    );
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save({ env: 'a' });
    });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    rerender({ name: 'b' });
    rerender({ name: 'a' });
    await act(async () => {
      fail(new Error('old A failure'));
      expect(await saving).toBe(false);
    });
    expect(result.current.error).toBe('');
    expect(result.current.saving).toBe(false);
  });

  it('isolates pending browser failures when the same name is replaced with another server', async () => {
    let fail!: (error: Error) => void;
    mocks.stateless.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)));
    const { result, rerender } = renderHook(
      ({ server }) =>
        useClusterTagStorage('test', {
          name: 'test',
          server,
          auth_type: '',
          meta_data: { source: 'dynamic_cluster' },
        }),
      { initialProps: { server: 'https://first.example' } }
    );
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save({ env: 'first' });
    });
    await waitFor(() => expect(mocks.stateless).toHaveBeenCalledTimes(1));
    rerender({ server: 'https://second.example' });
    expect(result.current.saving).toBe(false);
    await act(async () => {
      fail(new Error('old browser failure'));
      expect(await saving).toBe(false);
    });
    expect(result.current.error).toBe('');
    expect(mocks.stateless).toHaveBeenCalledWith(
      'test',
      { env: 'first' },
      undefined,
      'https://first.example',
      ''
    );
  });

  it('keeps pending browser status across equal-valued metadata refreshes', async () => {
    let fail!: (error: Error) => void;
    mocks.stateless.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)));
    const original: Cluster = {
      name: 'test',
      server: 'https://same.example',
      auth_type: '',
      meta_data: { source: 'dynamic_cluster' },
    };
    const { result, rerender } = renderHook(({ info }) => useClusterTagStorage('test', info), {
      initialProps: { info: original },
    });
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save({ env: 'new' });
    });
    await waitFor(() => expect(mocks.stateless).toHaveBeenCalledTimes(1));
    rerender({ info: { ...original, meta_data: { ...original.meta_data } } });
    expect(result.current.saving).toBe(true);
    await act(async () => {
      fail(new Error('current failure'));
      expect(await saving).toBe(false);
    });
    expect(result.current.error).toContain('current failure');
  });

  it.each(['server', 'auth_type'])(
    'rejects a late server result when the same-ID %s changes without clearing overrides',
    async field => {
      let finish!: (config: { clusters: Record<string, Cluster> }) => void;
      mocks.update.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
      storeClusterSettings('test', { tags: { env: 'local' } });
      const original: Cluster = {
        ...cluster('kubeconfig'),
        server: 'https://first.example',
      };
      const { result, rerender } = renderHook(({ info }) => useClusterTagStorage('test', info), {
        initialProps: { info: original },
      });
      let saving!: Promise<boolean>;
      act(() => {
        saving = result.current.save({ env: 'new' });
      });
      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(result.current.saving).toBe(true);
      rerender({
        info: {
          ...original,
          [field]: field === 'server' ? 'https://replacement.example' : 'oidc',
        },
      });
      expect(result.current.saving).toBe(false);
      expect(result.current.error).toBe('');
      await act(async () => {
        finish({ clusters: { test: original } });
        expect(await saving).toBe(false);
      });
      expect(mocks.dispatch).not.toHaveBeenCalled();
      expect(loadClusterSettings('test').tags).toEqual({ env: 'local' });
      expect(result.current.error).toBe('');
    }
  );

  it('clears an existing error when a same-named context is replaced', async () => {
    mocks.update.mockRejectedValueOnce(new Error('permission denied'));
    const { result, rerender } = renderHook(
      ({ clusterID }) =>
        useClusterTagStorage('test', {
          ...cluster('kubeconfig'),
          meta_data: { source: 'kubeconfig', clusterID },
        }),
      { initialProps: { clusterID: 'first+test' } }
    );
    await act(async () => {
      expect(await result.current.save({ env: 'a' })).toBe(false);
    });
    expect(result.current.error).toContain('permission denied');
    rerender({ clusterID: 'second+test' });
    expect(result.current.error).toBe('');
    expect(result.current.saving).toBe(false);
  });

  it('keeps the latest same-cluster save status when an earlier save fails', async () => {
    let failFirst!: (error: Error) => void;
    let finishSecond!: (config: { clusters: Record<string, Cluster> }) => void;
    mocks.update
      .mockReturnValueOnce(new Promise((_resolve, reject) => (failFirst = reject)))
      .mockReturnValueOnce(new Promise(resolve => (finishSecond = resolve)));
    const { result } = renderHook(() => useClusterTagStorage('test', cluster('kubeconfig')));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.save({ env: 'first' });
      second = result.current.save({ env: 'second' });
    });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    await act(async () => {
      failFirst(new Error('old failure'));
      expect(await first).toBe(false);
    });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBe('');
    expect(result.current.saving).toBe(true);
    await act(async () => {
      finishSecond({ clusters: { test: cluster('kubeconfig') } });
      expect(await second).toBe(true);
    });
    expect(result.current.saving).toBe(false);
  });

  it.each(['incluster', 'cluster_inventory', 'plugin'])(
    'uses explicit local storage for %s',
    async source => {
      const { result } = renderHook(() => useClusterTagStorage('test', cluster(source)));
      await act(async () => {
        expect(await result.current.save({ env: 'prod' })).toBe(true);
      });
      expect(result.current.helpText).toContain('browser only');
      expect(loadClusterSettings('test').tags).toEqual({ env: 'prod' });
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.stateless).not.toHaveBeenCalled();
    }
  );
});
