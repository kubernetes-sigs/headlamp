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

import * as jsyaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findAndReplaceKubeconfig,
  getStatelessClusterKubeConfigs,
  storeStatelessClusterKubeconfig,
} from './index';
import { updateStatelessClusterKubeconfig } from './updateStatelessClusterKubeconfig';

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

interface MockRequest extends IDBRequest {
  onsuccess: ((this: IDBRequest, ev: Event) => any) | null;
  onerror: ((this: IDBRequest, ev: Event) => any) | null;
  result: any;
  error: DOMException | null;
  source: IDBObjectStore;
  transaction: IDBTransaction;
  readyState: IDBRequestReadyState;
}

describe('updateStatelessClusterKubeconfig', () => {
  // Helper function to create mock IDB request
  function createMockRequest(): MockRequest {
    return {
      onsuccess: null,
      onerror: null,
      result: null,
      error: null,
      source: {} as IDBObjectStore,
      transaction: {} as IDBTransaction,
      readyState: 'pending' as IDBRequestReadyState,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
  }

  // Helper function to create mock cursor
  function createMockCursor(kubeconfig: string) {
    return {
      value: { kubeconfig, id: 1 },
      key: 1,
      continue: () => {},
      update: () => {},
      delete: () => {},
      source: {} as IDBObjectStore,
      direction: 'next',
      primaryKey: 1,
    };
  }
  const mockStore = {
    put: vi.fn().mockImplementation(() => {
      const request = createMockRequest();
      setTimeout(() => {
        request.onsuccess?.(new Event('success'));
      }, 0);
      return request;
    }),
    openCursor: vi.fn().mockImplementation(() => {
      const request = createMockRequest();
      return request;
    }),
  };

  const mockDB = {
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue(mockStore),
    }),
    name: 'mockDB',
    version: 1,
    objectStoreNames: ['kubeconfigs'] as unknown as DOMStringList,
    onabort: null,
    onclose: null,
    onerror: null,
    onversionchange: null,
    close: vi.fn(),
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
  } as IDBDatabase;

  beforeAll(() => {
    const mockIDBRequest = {
      result: mockDB,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    } as IDBOpenDBRequest;

    vi.stubGlobal('indexedDB', {
      open: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          mockIDBRequest.onsuccess?.({ target: { result: mockDB } } as any);
        }, 0);
        return mockIDBRequest;
      }),
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  function setupMockCursor(base64Kubeconfig: string) {
    mockStore.openCursor.mockImplementation(() => {
      const request = createMockRequest();
      setTimeout(() => {
        if (request.onsuccess) {
          const cursor = createMockCursor(base64Kubeconfig);
          const event = { target: { result: cursor } };
          request.onsuccess(event as any);
        }
      }, 0);
      return request;
    });
  }

  function createTestKubeconfig(contextName: string, extensions?: any[]) {
    return {
      contexts: [
        {
          name: contextName,
          context: {
            cluster: contextName,
            user: 'test-user',
            ...(extensions && { extensions }),
          },
        },
      ],
    };
  }

  it('should update existing kubeconfig with new custom name', async () => {
    const mockKubeconfig = createTestKubeconfig('test-cluster');
    const base64Kubeconfig = btoa(jsyaml.dump(mockKubeconfig));
    setupMockCursor(base64Kubeconfig);

    await updateStatelessClusterKubeconfig(base64Kubeconfig, 'new-name', 'test-cluster');
    expect(mockStore.put).toHaveBeenCalled();
  });

  it('should reject if no matching context is found', async () => {
    const mockKubeconfig = createTestKubeconfig('different-cluster');
    const base64Kubeconfig = btoa(jsyaml.dump(mockKubeconfig));

    await expect(
      updateStatelessClusterKubeconfig(base64Kubeconfig, 'new-name', 'test-cluster')
    ).rejects.toEqual('No context found matching the cluster name');
  });

  it('should update existing headlamp_info extension', async () => {
    const mockKubeconfig = createTestKubeconfig('test-cluster', [
      {
        name: 'headlamp_info',
        extension: {
          customName: 'old-name',
        },
      },
    ]);

    const base64Kubeconfig = btoa(jsyaml.dump(mockKubeconfig));
    setupMockCursor(base64Kubeconfig);

    await updateStatelessClusterKubeconfig(base64Kubeconfig, 'new-name', 'test-cluster');
    expect(mockStore.put).toHaveBeenCalled();
  });
});
