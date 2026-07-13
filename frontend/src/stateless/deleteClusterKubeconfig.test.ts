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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteClusterKubeconfig } from './deleteClusterKubeconfig';
import { findMatchingContexts } from './index';

vi.mock('./index', () => ({
  findMatchingContexts: vi.fn(),
  handleDataBaseError: vi.fn(),
  handleDatabaseUpgrade: vi.fn(),
}));

type Row = { key: any; kubeconfig: string };

// Provide global atob/btoa for the test environment
if (typeof (global as any).atob === 'undefined') {
  (global as any).atob = (s: string) => Buffer.from(s, 'base64').toString('utf8');
}
if (typeof (global as any).btoa === 'undefined') {
  (global as any).btoa = (s: string) => Buffer.from(s, 'utf8').toString('base64');
}

function makeFakeIndexedDB(rows: Row[]) {
  // allow tests to inspect calls
  const calls: {
    deletedKeys: any[];
    putArgs: any[];
  } = { deletedKeys: [], putArgs: [] };

  const store = {
    delete: (key: any) => {
      const req: any = {};
      // simulate async success
      setTimeout(() => {
        calls.deletedKeys.push(key);
        if (req.onsuccess) req.onsuccess({}); // event not used by code
      }, 0);
      return req;
    },
    put: (arg: any) => {
      const req: any = {};
      setTimeout(() => {
        calls.putArgs.push(arg);
        if (req.onsuccess) req.onsuccess({});
      }, 0);
      return req;
    },
    openCursor: () => {
      const req: any = {};
      // expose a method to trigger cursor iteration when onsuccess is set
      Object.defineProperty(req, 'onsuccess', {
        set(fn: (ev: any) => void) {
          // iterate through rows, calling the handler for each cursor
          // emulate asynchronous cursor behavior
          let idx = 0;
          const iterate = () => {
            const cursor =
              idx < rows.length
                ? {
                    value: rows[idx],
                    key: rows[idx].key,
                    continue: () => {
                      idx++;
                      setTimeout(iterate, 0);
                    },
                  }
                : null;
            // call handler with { target: { result: cursor } }
            setTimeout(() => fn({ target: { result: cursor } }), 0);
          };
          iterate();
        },
      });
      return req;
    },
  };

  const db = {
    transaction: (_names: string[] | string, _mode: string) => {
      void _names;
      void _mode;
      return {
        objectStore: (_name: string) => {
          void _name;
          return store;
        },
      };
    },
  };

  const requests: any[] = [];
  const open = (_name: string, _version?: number) => {
    void _name;
    void _version;
    const req: any = {};
    requests.push(req);
    // allow test to assign handlers: onupgradeneeded, onsuccess, onerror
    // when onsuccess is set, we call it with event.target.result = db
    Object.defineProperty(req, 'onsuccess', {
      set(fn: (ev: any) => void) {
        // call asynchronously to mimic real IndexedDB
        setTimeout(() => fn({ target: { result: db } }), 0);
      },
    });
    // onupgradeneeded and onerror just stored if set
    return req;
  };

  return { open, calls };
}

describe('deleteClusterKubeconfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // ensure a fresh indexedDB mock per test by setting global.indexedDB in each test
  });

  test('when no rows in store it resolves with null', async () => {
    const fake = makeFakeIndexedDB([]);
    (global as any).indexedDB = { open: fake.open };

    // make findMatchingContexts not match anything
    (findMatchingContexts as unknown as any).mockReturnValue({
      matchingKubeconfig: null,
      matchingContext: null,
    });

    await expect(deleteClusterKubeconfig('some-cluster')).resolves.toBeNull();
  });

  test('when matching context is found and no contexts remain it deletes the row and returns kubeconfig', async () => {
    // build a kubeconfig with a single context
    const kubeObj = {
      contexts: [{ name: 'ctx1', context: { cluster: 'cluster1', user: 'user1' } }],
      clusters: [{ name: 'cluster1', cluster: {} }],
      users: [{ name: 'user1', user: {} }],
      'current-context': 'ctx1',
    };
    const kube64 = (global as any).btoa(jsyaml.dump(kubeObj));
    const row = { key: 42, kubeconfig: kube64 };
    const fake = makeFakeIndexedDB([row]);
    (global as any).indexedDB = { open: fake.open };

    // mock findMatchingContexts to indicate match for this row
    (findMatchingContexts as unknown as any).mockReturnValue({
      matchingKubeconfig: { name: 'ctx1' },
      matchingContext: null,
    });

    await expect(deleteClusterKubeconfig('ctx1')).resolves.toBe(kube64);

    // ensure the delete was called for the key
    expect(fake.calls.deletedKeys).toContain(42);
  });

  test('when matching context is found and other contexts remain it updates the row and returns kubeconfig', async () => {
    // build a kubeconfig with two contexts; we'll remove ctx1 and keep ctx2
    const kubeObj = {
      contexts: [
        { name: 'ctx1', context: { cluster: 'cluster1', user: 'user1' } },
        { name: 'ctx2', context: { cluster: 'cluster2', user: 'user2' } },
      ],
      clusters: [
        { name: 'cluster1', cluster: {} },
        { name: 'cluster2', cluster: {} },
      ],
      users: [
        { name: 'user1', user: {} },
        { name: 'user2', user: {} },
      ],
      'current-context': 'ctx1',
    };
    const kube64 = (global as any).btoa(jsyaml.dump(kubeObj));
    const row = { key: 'row-key', kubeconfig: kube64 };
    const fake = makeFakeIndexedDB([row]);
    (global as any).indexedDB = { open: fake.open };

    // mock findMatchingContexts to indicate match for ctx1
    (findMatchingContexts as unknown as any).mockReturnValue({
      matchingKubeconfig: { name: 'ctx1' },
      matchingContext: null,
    });

    await expect(deleteClusterKubeconfig('ctx1')).resolves.toBe(kube64);

    // ensure put was called with updated kubeconfig that no longer contains ctx1
    expect(fake.calls.putArgs.length).toBe(1);
    const updated = fake.calls.putArgs[0] as any;
    const parsed = jsyaml.load((global as any).atob(updated.kubeconfig)) as any;
    expect(parsed.contexts.map((c: any) => c.name)).toEqual(['ctx2']);
    // current-context should be updated to ctx2
    expect(parsed['current-context']).toBe('ctx2');
  });
});
