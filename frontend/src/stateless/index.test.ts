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
import { IDBDatabase } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cluster } from '../lib/k8s/cluster';
import { setStatelessConfig } from '../redux/configSlice';
import store from '../redux/stores/store';
import { enqueueConfigOperation } from './configOperationQueue';
import { deleteClusterKubeconfig } from './deleteClusterKubeconfig';
import { findKubeconfigByClusterName } from './findKubeconfigByClusterName';
import {
  fetchStatelessClusterKubeConfigs,
  findAndReplaceKubeconfig,
  getStatelessClusterKubeConfigs,
  mergeStatelessConfigState,
  storeStatelessClusterKubeconfig,
  toStatelessConfigState,
} from './index';
import { updateStatelessClusterKubeconfig } from './updateStatelessClusterKubeconfig';

vi.mock('../lib/k8s/api/v1/clusterRequests', async importOriginal => {
  const actual = (await importOriginal()) as any;
  return { ...actual, request: vi.fn() };
});
import { request } from '../lib/k8s/api/v1/clusterRequests';

async function failNextDatabaseOpen() {
  const name = 'tag-read-error';
  await new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(name, 2);
    opening.onsuccess = () => {
      opening.result.close();
      resolve();
    };
    opening.onerror = () => reject(opening.error);
  });
  const open = indexedDB.open.bind(indexedDB);
  return vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => open(name, 1));
}

describe('IndexedDB failures', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    indexedDB.deleteDatabase('tag-read-error');
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open('kubeconfigs', 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore('kubeconfigStore', { keyPath: 'id', autoIncrement: true });
      };
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction('kubeconfigStore', 'readwrite');
        transaction.objectStore('kubeconfigStore').clear();
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onabort = () => reject(transaction.error);
      };
    });
  });

  it.each([
    ['read', () => getStatelessClusterKubeConfigs()],
    ['write', () => storeStatelessClusterKubeconfig('document')],
    ['lookup', () => findKubeconfigByClusterName('test')],
    ['delete', () => deleteClusterKubeconfig('test')],
    ['rename', () => updateStatelessClusterKubeconfig('', 'new', 'test')],
  ] as const)('rejects a failed %s open with the original error', async (_, operation) => {
    await failNextDatabaseOpen();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(operation()).rejects.toMatchObject({ name: 'VersionError' });
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ name: 'VersionError' }));
  });

  it('rejects a synchronous open failure instead of leaving an async executor pending', async () => {
    const error = new Error('IndexedDB unavailable');
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw error;
    });
    await expect(getStatelessClusterKubeConfigs()).rejects.toBe(error);
    await expect(storeStatelessClusterKubeconfig('document')).rejects.toBe(error);
  });

  it('rejects an aborted read transaction and allows a subsequent read', async () => {
    await getStatelessClusterKubeConfigs();
    const transaction = IDBDatabase.prototype.transaction;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const abort = vi
      .spyOn(IDBDatabase.prototype, 'transaction')
      .mockImplementationOnce(function (this: IDBDatabase, ...args) {
        const reading = transaction.apply(this, args);
        queueMicrotask(() => reading.abort());
        return reading;
      });
    await expect(getStatelessClusterKubeConfigs()).rejects.toThrow('Failed to read IndexedDB');
    expect(logged).toHaveBeenCalledWith(expect.any(Error));
    abort.mockRestore();
    await expect(getStatelessClusterKubeConfigs()).resolves.toEqual(expect.any(Array));
  });

  it('rejects a failed transaction start instead of stalling a read', async () => {
    await getStatelessClusterKubeConfigs();
    const error = new Error('transaction unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
      throw error;
    });
    await expect(getStatelessClusterKubeConfigs()).rejects.toBe(error);
  });

  it.each([
    ['lookup', () => findKubeconfigByClusterName('test')],
    ['delete', () => deleteClusterKubeconfig('test')],
    ['rename', () => updateStatelessClusterKubeconfig('', 'new', 'test')],
  ] as const)(
    'rejects %s cursor processing errors and releases the queue',
    async (_, operation) => {
      await storeStatelessClusterKubeconfig(btoa('contexts: [invalid yaml'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(enqueueConfigOperation<unknown>(operation)).rejects.toBeInstanceOf(Error);
      await expect(enqueueConfigOperation(async () => 'released')).resolves.toBe('released');
    }
  );
});

describe('findAndReplaceKubeconfig', () => {
  beforeEach(() => {
    // Clear any existing data
    localStorage.clear();
  });

  afterEach(async () => {
    // Clear the object store instead of deleting the database
    return new Promise<void>(resolve => {
      const request = indexedDB.open('kubeconfigs', 1);
      request.onsuccess = event => {
        const db = (event.target as any).result;
        if (db) {
          const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
          const store = transaction.objectStore('kubeconfigStore');
          const clearRequest = store.clear();
          clearRequest.onsuccess = () => {
            db.close();
            resolve();
          };
          clearRequest.onerror = () => {
            db.close();
            resolve();
          };
        } else {
          resolve();
        }
      };
      request.onerror = () => resolve();
    });
  });

  it('should store first kubeconfig and verify it exists', async () => {
    const kubeconfig1 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test-cluster.example.com
contexts:
- name: test-cluster
  context:
    cluster: test-cluster
    user: test-user
users:
- name: test-user
  user:
    token: test-token-1
extensions:
- name: headlamp_info
  extension:
    cluster_name: test-cluster`);

    await storeStatelessClusterKubeconfig(kubeconfig1);

    const configs = await getStatelessClusterKubeConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0]).toBe(kubeconfig1);
  });

  it('should store second kubeconfig and verify 2 exist', async () => {
    const kubeconfig1 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test-cluster.example.com
contexts:
- name: test-cluster
  context:
    cluster: test-cluster
    user: test-user
users:
- name: test-user
  user:
    token: test-token-1
extensions:
- name: headlamp_info
  extension:
    cluster_name: test-cluster`);

    const kubeconfig2 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: second-cluster
  cluster:
    server: https://second-cluster.example.com
contexts:
- name: second-cluster
  context:
    cluster: second-cluster
    user: second-user
users:
- name: second-user
  user:
    token: test-token-2
extensions:
- name: headlamp_info
  extension:
    cluster_name: second-cluster`);

    await storeStatelessClusterKubeconfig(kubeconfig1);
    await storeStatelessClusterKubeconfig(kubeconfig2);

    const configs = await getStatelessClusterKubeConfigs();
    expect(configs).toHaveLength(2);
    expect(configs).toContain(kubeconfig1);
    expect(configs).toContain(kubeconfig2);
  });

  it('should find and replace existing kubeconfig', async () => {
    const kubeconfig1 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test-cluster.example.com
contexts:
- name: test-cluster
  context:
    cluster: test-cluster
    user: test-user
users:
- name: test-user
  user:
    token: test-token-1
extensions:
- name: headlamp_info
  extension:
    cluster_name: test-cluster`);

    const kubeconfig2 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: second-cluster
  cluster:
    server: https://second-cluster.example.com
contexts:
- name: second-cluster
  context:
    cluster: second-cluster
    user: second-user
users:
- name: second-user
  user:
    token: test-token-2
extensions:
- name: headlamp_info
  extension:
    cluster_name: second-cluster`);

    const replacementKubeconfig = btoa(`apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test-cluster-replaced.example.com
contexts:
- name: test-cluster
  context:
    cluster: test-cluster
    user: test-user
users:
- name: test-user
  user:
    token: test-token-replaced
extensions:
- name: headlamp_info
  extension:
    cluster_name: test-cluster`);

    // Store initial kubeconfigs
    await storeStatelessClusterKubeconfig(kubeconfig1);
    await storeStatelessClusterKubeconfig(kubeconfig2);

    // Verify initial state
    let configs = await getStatelessClusterKubeConfigs();
    expect(configs).toHaveLength(2);

    // Replace the first kubeconfig
    await findAndReplaceKubeconfig('test-cluster', replacementKubeconfig);

    // Verify replacement
    configs = await getStatelessClusterKubeConfigs();
    expect(configs).toHaveLength(2);
    expect(configs).toContain(replacementKubeconfig);
    expect(configs).toContain(kubeconfig2);
  });

  it('should create new kubeconfig when create=true', async () => {
    const kubeconfig1 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test-cluster.example.com
contexts:
- name: test-cluster
  context:
    cluster: test-cluster
    user: test-user
users:
- name: test-user
  user:
    token: test-token-1
extensions:
- name: headlamp_info
  extension:
    cluster_name: test-cluster`);

    const kubeconfig2 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: second-cluster
  cluster:
    server: https://second-cluster.example.com
contexts:
- name: second-cluster
  context:
    cluster: second-cluster
    user: second-user
users:
- name: second-user
  user:
    token: test-token-2
extensions:
- name: headlamp_info
  extension:
    cluster_name: second-cluster`);

    const kubeconfig3 = btoa(`apiVersion: v1
kind: Config
clusters:
- name: new-cluster
  cluster:
    server: https://new-cluster.example.com
contexts:
- name: new-cluster
  context:
    cluster: new-cluster
    user: new-user
users:
- name: new-user
  user:
    token: test-token-3
extensions:
- name: headlamp_info
  extension:
    cluster_name: new-cluster`);

    // Store initial kubeconfigs
    await storeStatelessClusterKubeconfig(kubeconfig1);
    await storeStatelessClusterKubeconfig(kubeconfig2);

    // Verify initial state
    let configs = await getStatelessClusterKubeConfigs();
    expect(configs).toHaveLength(2);

    // Add third kubeconfig with create=true
    await findAndReplaceKubeconfig('new-cluster', kubeconfig3, true);

    // Verify 3 exist
    configs = await getStatelessClusterKubeConfigs();
    expect(configs).toHaveLength(3);
    expect(configs).toContain(kubeconfig1);
    expect(configs).toContain(kubeconfig2);
    expect(configs).toContain(kubeconfig3);
  });
});

describe('fetchStatelessClusterKubeConfigs', () => {
  const clearIndexedDB = () =>
    new Promise<void>(resolve => {
      const request = indexedDB.open('kubeconfigs', 1);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains('kubeconfigStore')) {
          db.createObjectStore('kubeconfigStore', { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = (event: any) => {
        const db = event.target.result as IDBDatabase;
        const tx = db.transaction(['kubeconfigStore'], 'readwrite');
        const clearReq = tx.objectStore('kubeconfigStore').clear();

        tx.oncomplete = () => {
          db.close();
          resolve();
        };

        tx.onerror = () => {
          db.close();
          resolve();
        };

        tx.onabort = () => {
          db.close();
          resolve();
        };

        clearReq.onerror = () => {
          // The transaction handlers above finalize the promise.
        };
      };
      request.onerror = () => resolve();
    });

  beforeEach(async () => {
    await clearIndexedDB();
    store.dispatch(setStatelessConfig({ statelessClusters: null }));
  });

  afterEach(async () => {
    await clearIndexedDB();
    store.dispatch(setStatelessConfig({ statelessClusters: null }));
  });

  it('dispatches setStatelessConfig({}) when IndexedDB is empty and stale state exists', async () => {
    // Seed stale redux state (simulates a previous session leaving clusters behind)
    store.dispatch(
      setStatelessConfig({
        statelessClusters: { 'stale-cluster': { name: 'stale-cluster' } as any },
      })
    );
    expect(store.getState().config.statelessClusters).not.toBeNull();

    const dispatch = vi.fn();
    // IndexedDB is empty — fetchStatelessClusterKubeConfigs should clear stale state
    await fetchStatelessClusterKubeConfigs(dispatch);

    expect(dispatch).toHaveBeenCalledWith(setStatelessConfig({ statelessClusters: {} }));
  });

  it('does not dispatch when IndexedDB is empty and state is already clear', async () => {
    // statelessClusters is null in the store (already clean)
    expect(store.getState().config.statelessClusters).toBeNull();

    const dispatch = vi.fn();
    await fetchStatelessClusterKubeConfigs(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('toStatelessConfigState', () => {
  it('maps parsed clusters by name for redux state', () => {
    const parsedConfig = {
      clusters: [
        { name: 'alpha', meta_data: {} },
        { name: 'beta', meta_data: {} },
      ],
    } as any;

    const nextState = toStatelessConfigState(parsedConfig);

    expect(Object.keys(nextState.statelessClusters)).toEqual(['alpha', 'beta']);
    expect(nextState.statelessClusters.alpha.name).toBe('alpha');
    expect(nextState.statelessClusters.beta.name).toBe('beta');
  });

  it('returns an empty statelessClusters map for missing clusters', () => {
    expect(toStatelessConfigState(undefined)).toEqual({ statelessClusters: {} });
    expect(toStatelessConfigState({} as any)).toEqual({ statelessClusters: {} });
  });
});

describe('mergeStatelessConfigState', () => {
  it('preserves existing clusters while adding parsed clusters', () => {
    const currentState = {
      alpha: { name: 'alpha', meta_data: {} },
    } as any;

    const parsedConfig = {
      clusters: [{ name: 'beta', meta_data: {} }],
    } as any;

    const nextState = mergeStatelessConfigState(currentState, parsedConfig);

    expect(Object.keys(nextState.statelessClusters)).toEqual(['alpha', 'beta']);
  });

  it('updates existing cluster entries when parsed data has same key', () => {
    const currentState = {
      alpha: { name: 'alpha', meta_data: { old: true } },
    } as any;

    const parsedConfig = {
      clusters: [{ name: 'alpha', meta_data: { old: false, fresh: true } }],
    } as any;

    const nextState = mergeStatelessConfigState(currentState, parsedConfig);

    expect(nextState.statelessClusters.alpha.meta_data).toEqual({ old: false, fresh: true });
  });

  it('does not drop pre-existing clusters when a renamed cluster is re-parsed', () => {
    // Simulates the ClusterNameEditor bug: after renaming "alpha", parseKubeConfig
    // returns only the renamed cluster's config. Without merging, all other stateless
    // clusters are wiped from the UI until the next periodic refresh.
    const sessionClusters = {
      alpha: { name: 'alpha', meta_data: {} },
      beta: { name: 'beta', meta_data: {} },
      gamma: { name: 'gamma', meta_data: {} },
    } as any;

    // Only "alpha" (now renamed to "alpha-new") comes back from the rename parse
    const parsedConfig = {
      clusters: [{ name: 'alpha-new', meta_data: {} }],
    } as any;

    const nextState = mergeStatelessConfigState(sessionClusters, parsedConfig);

    // All three original clusters must still be present
    expect(nextState.statelessClusters).toHaveProperty('beta');
    expect(nextState.statelessClusters).toHaveProperty('gamma');
    // The newly renamed cluster should also be present
    expect(nextState.statelessClusters).toHaveProperty('alpha-new');
  });
});

describe('fetchStatelessClusterKubeConfigs corner cases', () => {
  const clearIndexedDB = () =>
    new Promise<void>(resolve => {
      const req = indexedDB.open('kubeconfigs', 1);
      req.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains('kubeconfigStore')) {
          db.createObjectStore('kubeconfigStore', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (event: any) => {
        const db = event.target.result as IDBDatabase;
        const tx = db.transaction(['kubeconfigStore'], 'readwrite');
        tx.objectStore('kubeconfigStore').clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          resolve();
        };
      };
      req.onerror = () => resolve();
    });

  beforeEach(async () => {
    await clearIndexedDB();
    store.dispatch(setStatelessConfig({ statelessClusters: null }));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearIndexedDB();
    store.dispatch(setStatelessConfig({ statelessClusters: null }));
  });

  it('dispatches update when cluster names change even if count is the same', async () => {
    await storeStatelessClusterKubeconfig('dummy-kubeconfig');

    store.dispatch(
      setStatelessConfig({
        statelessClusters: {
          alpha: { name: 'alpha', meta_data: {} } as any,
          beta: { name: 'beta', meta_data: {} } as any,
        },
      })
    );

    vi.mocked(request).mockResolvedValue({
      clusters: [
        { name: 'alpha', meta_data: {} },
        { name: 'gamma', meta_data: {} }, // 'beta' replaced by 'gamma'
      ],
    });

    const dispatch = vi.fn();
    await fetchStatelessClusterKubeConfigs(dispatch);

    expect(dispatch).toHaveBeenCalled();
  });

  it('orders a delayed polling response before a queued tag save and reads fresh data afterward', async () => {
    await storeStatelessClusterKubeconfig('old-kubeconfig');
    const oldCluster: Cluster = {
      name: 'test',
      auth_type: '',
      meta_data: { extensions: { headlamp_info: { tags: { env: 'old' } } } },
    };
    const savedCluster: Cluster = {
      ...oldCluster,
      meta_data: { extensions: { headlamp_info: { tags: { env: 'new' } } } },
    };
    let completePoll!: (value: { clusters: Cluster[] }) => void;
    const pendingPoll = new Promise<{ clusters: Cluster[] }>(resolve => {
      completePoll = resolve;
    });
    vi.mocked(request).mockReturnValueOnce(pendingPoll);
    const dispatch = vi.fn((action: ReturnType<typeof setStatelessConfig>) =>
      store.dispatch(action)
    );
    const polling = fetchStatelessClusterKubeConfigs(dispatch);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const save = vi.fn(async () => {
      await clearIndexedDB();
      await storeStatelessClusterKubeconfig('new-kubeconfig');
      dispatch(setStatelessConfig({ statelessClusters: { test: savedCluster } }));
    });
    const saving = enqueueConfigOperation(save);
    const redundantPolls = Array.from({ length: 12 }, () =>
      fetchStatelessClusterKubeConfigs(dispatch)
    );
    expect(redundantPolls.every(poll => poll === polling)).toBe(true);
    expect(save).not.toHaveBeenCalled();
    completePoll({ clusters: [oldCluster] });
    await polling;
    await saving;
    await Promise.all(redundantPolls);
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.getState().config.statelessClusters?.test).toEqual(savedCluster);
    expect(dispatch.mock.calls.map(([action]) => action.payload.statelessClusters?.test)).toEqual([
      oldCluster,
      savedCluster,
    ]);
    vi.mocked(request).mockResolvedValueOnce({ clusters: [savedCluster] });
    await fetchStatelessClusterKubeConfigs(dispatch);
    expect(JSON.parse(vi.mocked(request).mock.calls[1][1]!.body as string).kubeconfigs).toEqual([
      'new-kubeconfig',
    ]);
    expect(store.getState().config.statelessClusters?.test).toEqual(savedCluster);
  });

  it('coalesces queued refreshes and accepts a fresh refresh after a failed parse', async () => {
    await storeStatelessClusterKubeconfig('dummy-kubeconfig');
    let releaseSave!: () => void;
    const save = enqueueConfigOperation(
      () => new Promise<void>(resolve => (releaseSave = resolve))
    );
    await waitFor(() => expect(releaseSave).toBeDefined());
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(request).mockRejectedValueOnce(new Error('parse unavailable'));
    const dispatch = vi.fn();
    try {
      const polling = fetchStatelessClusterKubeConfigs(dispatch);
      expect(fetchStatelessClusterKubeConfigs(dispatch)).toBe(polling);
      expect(request).not.toHaveBeenCalled();
      releaseSave();
      await save;
      await polling;
      expect(request).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalledWith('Error getting config:', expect.any(Error));
      vi.mocked(request).mockResolvedValueOnce({ clusters: [] });
      await fetchStatelessClusterKubeConfigs(dispatch);
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      logged.mockRestore();
    }
  });

  it('releases queued server polling and tag saves after a failed browser read', async () => {
    const { fetchClusterConfig } = await import('../components/App/fetchClusterConfig');
    const { updateClusterTags } = await import('../lib/k8s/api/v1/clusterApi');
    const open = await failNextDatabaseOpen();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(request).mockResolvedValue({ clusters: [] });
    try {
      const polling = fetchStatelessClusterKubeConfigs(vi.fn());
      const serverPolling = fetchClusterConfig(store.dispatch);
      const saving = enqueueConfigOperation(() => updateClusterTags('server', { env: 'prod' }));
      await polling;
      await serverPolling;
      await saving;
      expect(logged).toHaveBeenCalledWith(
        'Error getting config:',
        expect.objectContaining({ name: 'VersionError' })
      );
      expect(vi.mocked(request).mock.calls.map(([url]) => url)).toEqual([
        '/config',
        '/cluster/server/tags',
      ]);
      await fetchStatelessClusterKubeConfigs(vi.fn());
    } finally {
      open.mockRestore();
      logged.mockRestore();
      indexedDB.deleteDatabase('tag-read-error');
    }
  });

  it.each(['delete', 'rename'])(
    'releases polling and saves after a queued %s encounters an IndexedDB open failure',
    async operation => {
      const { fetchClusterConfig } = await import('../components/App/fetchClusterConfig');
      const { deleteCluster, renameCluster, updateClusterTags } = await import(
        '../lib/k8s/api/v1/clusterApi'
      );
      const open = await failNextDatabaseOpen();
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(request).mockResolvedValue({ clusters: [] });
      try {
        const mutation = enqueueConfigOperation(() =>
          operation === 'delete'
            ? deleteCluster('server')
            : renameCluster('server', 'renamed', 'kubeconfig')
        );
        const failed = expect(mutation).rejects.toMatchObject({ name: 'VersionError' });
        const polling = fetchClusterConfig(store.dispatch);
        const saving = enqueueConfigOperation(() => updateClusterTags('server', { env: 'prod' }));
        await failed;
        await polling;
        await saving;
        expect(vi.mocked(request).mock.calls.map(([url]) => url)).toEqual([
          '/config',
          '/cluster/server/tags',
        ]);
      } finally {
        open.mockRestore();
        logged.mockRestore();
        indexedDB.deleteDatabase('tag-read-error');
      }
    }
  );

  it('does not publish a parse snapshot invalidated by an independent replacement', async () => {
    await storeStatelessClusterKubeconfig('old-document');
    let finish!: (value: { clusters: Cluster[] }) => void;
    vi.mocked(request).mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    const dispatch = vi.fn();
    const polling = fetchStatelessClusterKubeConfigs(dispatch);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await clearIndexedDB();
    await storeStatelessClusterKubeconfig('replacement-document');
    finish({ clusters: [{ name: 'old', auth_type: '' }] });
    await polling;
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses latest redux statelessClusters when parse response resolves', async () => {
    await storeStatelessClusterKubeconfig('dummy-kubeconfig');

    // Initial state before request starts.
    store.dispatch(
      setStatelessConfig({
        statelessClusters: {
          alpha: { name: 'alpha', meta_data: {} } as any,
        },
      })
    );

    let resolveRequest: (value: any) => void;
    const pendingRequest = new Promise(resolve => {
      resolveRequest = resolve;
    });

    vi.mocked(request).mockReturnValue(pendingRequest as any);

    const dispatch = vi.fn();
    const inFlight = fetchStatelessClusterKubeConfigs(dispatch);

    // State changes while /parseKubeConfig is still in-flight.
    // The decision must use this latest value, not a stale captured value.
    store.dispatch(
      setStatelessConfig({
        statelessClusters: {
          alpha: { name: 'alpha', meta_data: {} } as any,
          beta: { name: 'beta', meta_data: {} } as any,
        },
      })
    );

    resolveRequest!({
      clusters: [
        { name: 'alpha', meta_data: {} },
        { name: 'beta', meta_data: {} },
      ],
    });

    await inFlight;

    // No dispatch expected because latest store state already matches response.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches update when cluster payload changes but keys stay the same', async () => {
    await storeStatelessClusterKubeconfig('dummy-kubeconfig');

    store.dispatch(
      setStatelessConfig({
        statelessClusters: {
          alpha: {
            name: 'alpha',
            meta_data: { project: 'old' },
            cluster: { server: 'https://old.example.com' },
          } as any,
        },
      })
    );

    vi.mocked(request).mockResolvedValue({
      clusters: [
        {
          name: 'alpha',
          meta_data: { project: 'new' },
          cluster: { server: 'https://new.example.com' },
        },
      ],
    });

    const dispatch = vi.fn();
    await fetchStatelessClusterKubeConfigs(dispatch);

    // Same key set, but payload differs, so redux state must still update.
    expect(dispatch).toHaveBeenCalled();
  });

  it('does not resolve before parse request settles', async () => {
    await storeStatelessClusterKubeconfig('dummy-kubeconfig');

    let resolveRequest: (value: any) => void;
    const pendingRequest = new Promise(resolve => {
      resolveRequest = resolve;
    });

    vi.mocked(request).mockReturnValue(pendingRequest as any);

    const dispatch = vi.fn();
    const settled = vi.fn();
    const inFlight = fetchStatelessClusterKubeConfigs(dispatch).then(settled);

    // Flush microtasks and verify the function is still waiting for request.
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    resolveRequest!({
      clusters: [],
    });

    await inFlight;
    expect(settled).toHaveBeenCalledOnce();
  });
});
