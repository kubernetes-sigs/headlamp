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

import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { request } from '../../lib/k8s/api/v1/clusterRequests';
import type { Cluster } from '../../lib/k8s/cluster';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { enqueueConfigOperation } from '../../stateless/configOperationQueue';
import { fetchClusterConfig } from './fetchClusterConfig';

vi.mock('../../lib/k8s/api/v1/clusterRequests', () => ({ request: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(setConfig({ clusters: null }));
  store.dispatch(setStatelessConfig({ statelessClusters: null }));
});
afterEach(() => {
  store.dispatch(setConfig({ clusters: null }));
  store.dispatch(setStatelessConfig({ statelessClusters: null }));
});

it('orders delayed server polling before saves and coalesces redundant requests', async () => {
  const original: Cluster = {
    name: 'a',
    auth_type: '',
    meta_data: { extensions: { headlamp_info: { tags: { env: 'old' } } } },
  };
  const saved: Cluster = {
    ...original,
    meta_data: { extensions: { headlamp_info: { tags: { env: 'new' } } } },
  };
  let resolvePoll!: (value: { clusters: Cluster[] }) => void;
  vi.mocked(request).mockReturnValueOnce(new Promise(resolve => (resolvePoll = resolve)));
  const polling = fetchClusterConfig(store.dispatch);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const save = vi.fn(async () => {
    store.dispatch(setConfig({ clusters: { a: saved } }));
  });
  const saving = enqueueConfigOperation(save);
  expect(fetchClusterConfig(store.dispatch)).toBe(polling);
  expect(save).not.toHaveBeenCalled();
  resolvePoll({ clusters: [original] });
  await polling;
  await saving;
  expect(store.getState().config.clusters?.a).toEqual(saved);
  expect(request).toHaveBeenCalledWith('/config', { timeout: 30000 }, false, false);
});

it('preserves latest useToken, custom names and stateless entries at publication', async () => {
  const original: Cluster = {
    name: 'raw',
    auth_type: '',
    meta_data: { extensions: { headlamp_info: { customName: 'a' } } },
  };
  let resolvePoll!: (value: { clusters: Cluster[] }) => void;
  vi.mocked(request).mockReturnValueOnce(new Promise(resolve => (resolvePoll = resolve)));
  store.dispatch(setConfig({ clusters: { a: { ...original, name: 'a' } } }));
  const polling = fetchClusterConfig(store.dispatch);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const browser: Cluster = { name: 'b', auth_type: '' };
  store.dispatch(setConfig({ clusters: { a: { ...original, name: 'a', useToken: true } } }));
  store.dispatch(setStatelessConfig({ statelessClusters: { b: browser } }));
  resolvePoll({ clusters: [{ ...original, server: 'https://new.example' }] });
  await polling;
  expect(store.getState().config.clusters).toEqual({
    a: { ...original, name: 'a', server: 'https://new.example', useToken: true },
    b: browser,
  });
  expect(original.name).toBe('raw');
});

it('releases the queue and coalesced promise after a server request fails', async () => {
  vi.mocked(request).mockRejectedValueOnce(new Error('network unavailable'));
  await expect(fetchClusterConfig(store.dispatch)).rejects.toThrow('network unavailable');
  const save = vi.fn(async () => {});
  await enqueueConfigOperation(save);
  vi.mocked(request).mockResolvedValueOnce({ clusters: [] });
  await fetchClusterConfig(store.dispatch);
  expect(save).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(2);
});

it.each(['delete', 'rename'])(
  'rejects a stale poll after a concurrent %s and accepts a fresh poll',
  async mutation => {
    const original: Cluster = {
      name: 'a',
      auth_type: '',
      meta_data: { source: 'kubeconfig', clusterID: 'file+a' },
    };
    store.dispatch(setConfig({ clusters: { a: original } }));
    let finish!: (value: { clusters: Cluster[] }) => void;
    vi.mocked(request).mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    const polling = fetchClusterConfig(store.dispatch);
    const rejected = expect(polling).rejects.toThrow(
      'Cluster configuration changed while fetching cluster config'
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const next: Record<string, Cluster> =
      mutation === 'delete' ? {} : { renamed: { ...original, name: 'renamed' } };
    store.dispatch(setConfig({ clusters: next }));
    finish({ clusters: [original] });
    await rejected;
    expect(store.getState().config.clusters).toEqual(next);
    vi.mocked(request).mockResolvedValueOnce({ clusters: Object.values(next) });
    await fetchClusterConfig(store.dispatch);
    expect(store.getState().config.clusters).toEqual(next);
  }
);
