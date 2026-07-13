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
import { updateStatelessClusterKubeconfig } from './updateStatelessClusterKubeconfig';

// --- PARTIAL MOCK: keep the real module but override findMatchingContexts
vi.mock('./index', async () => {
  const actual = await vi.importActual<typeof import('./index')>('./index');
  return {
    ...actual,
    findMatchingContexts: vi.fn((clusterName: string, parsed: any) => {
      const ctx = (parsed.contexts || []).find(
        (c: any) =>
          c?.name === clusterName ||
          (c?.context?.extensions || []).some(
            (e: any) => e?.name === 'headlamp_info' && e?.extension?.customName === clusterName
          )
      );
      return { matchingKubeconfig: ctx || null, matchingContext: ctx || null };
    }),
    handleDataBaseError: vi.fn(),
    handleDatabaseUpgrade: vi.fn(),
  };
});

// Provide global atob/btoa for Node test env
if (typeof (global as any).atob === 'undefined') {
  (global as any).atob = (s: string) => Buffer.from(s, 'base64').toString('utf8');
}
if (typeof (global as any).btoa === 'undefined') {
  (global as any).btoa = (s: string) => Buffer.from(s, 'utf8').toString('base64');
}

type Row = { key: string; kubeconfig: string };

function makeFakeIndexedDB(rows: Row[], opts?: { failPut?: boolean }) {
  const calls: { deletedKeys: any[]; putArgs: any[] } = { deletedKeys: [], putArgs: [] };

  const store = {
    delete: (key: any) => {
      const req: any = {};
      setTimeout(() => {
        calls.deletedKeys.push(key);
        req.onsuccess?.({});
      }, 0);
      return req;
    },
    put: (arg: any) => {
      const req: any = {};
      setTimeout(() => {
        if (opts?.failPut) {
          req.onerror?.({ target: { error: new Error('boom') } });
          return;
        }
        calls.putArgs.push(arg);
        req.onsuccess?.({});
      }, 0);
      return req;
    },
    openCursor: () => {
      const req: any = {};
      Object.defineProperty(req, 'onsuccess', {
        set(fn: (ev: any) => void) {
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
            setTimeout(() => fn({ target: { result: cursor } }), 0);
          };
          iterate();
        },
      });
      return req;
    },
  };

  const db = {
    transaction: () => ({
      objectStore: () => store,
    }),
  };

  const open = () => {
    const req: any = {};
    Object.defineProperty(req, 'onsuccess', {
      set(fn: (ev: any) => void) {
        setTimeout(() => fn({ target: { result: db } }), 0);
      },
    });
    return req;
  };

  return { open, calls };
}

function makeKubeB64({
  name,
  headlampCustomName,
  otherExts = [],
}: {
  name: string;
  headlampCustomName?: string | null;
  otherExts?: any[];
}) {
  const exts: any[] = [...otherExts];
  if (headlampCustomName !== undefined) {
    exts.push({
      name: 'headlamp_info',
      extension: headlampCustomName ? { customName: headlampCustomName } : {},
    });
  }
  const obj = {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [{ name: `${name}-cluster`, cluster: {} }],
    users: [{ name: `${name}-user`, user: {} }],
    contexts: [
      { name, context: { cluster: `${name}-cluster`, user: `${name}-user`, extensions: exts } },
    ],
    'current-context': name,
  };
  return (global as any).btoa(jsyaml.dump(obj));
}

describe('updateStatelessClusterKubeconfig (dynamic; no clusterID path)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('adds headlamp_info.customName when none exists', async () => {
    const row = {
      key: 'row-1',
      kubeconfig: makeKubeB64({ name: 'ctx1', headlampCustomName: undefined }),
    };
    const fake = makeFakeIndexedDB([row]);
    (global as any).indexedDB = { open: fake.open };

    await expect(
      updateStatelessClusterKubeconfig('IGNORED', 'Pretty Name', 'ctx1')
    ).resolves.toBeUndefined();

    expect(fake.calls.putArgs.length).toBe(1);
    const updated = fake.calls.putArgs[0] as any;
    expect(updated.key).toBe('row-1');

    const parsed = jsyaml.load((global as any).atob(updated.kubeconfig)) as any;
    const exts = parsed.contexts[0].context.extensions;
    const headlamp = exts.find((e: any) => e.name === 'headlamp_info');
    expect(headlamp).toBeTruthy();
    expect(headlamp.extension.customName).toBe('Pretty Name');
  });

  test('overwrites existing headlamp_info.customName without duplicating and preserves other extensions', async () => {
    const otherExt = { name: 'foo', extension: { a: 1 } };
    const row = {
      key: 'row-1',
      kubeconfig: makeKubeB64({
        name: 'ctx1',
        headlampCustomName: 'Old Name',
        otherExts: [otherExt],
      }),
    };
    const fake = makeFakeIndexedDB([row]);
    (global as any).indexedDB = { open: fake.open };

    await expect(
      updateStatelessClusterKubeconfig('IGNORED', 'New Name', 'ctx1')
    ).resolves.toBeUndefined();

    expect(fake.calls.putArgs.length).toBe(1);
    const parsed = jsyaml.load(
      (global as any).atob((fake.calls.putArgs[0] as any).kubeconfig)
    ) as any;
    const exts = parsed.contexts[0].context.extensions;

    const headlamps = exts.filter((e: any) => e.name === 'headlamp_info');
    expect(headlamps.length).toBe(1);
    expect(headlamps[0].extension.customName).toBe('New Name');

    const stillHasOther = exts.find((e: any) => e.name === 'foo');
    expect(stillHasOther).toBeTruthy();
    expect(stillHasOther.extension.a).toBe(1);
  });

  test('updates only the row that actually contains the target context when multiple rows exist', async () => {
    const rowA = {
      key: 'row-A',
      kubeconfig: makeKubeB64({ name: 'ctxA', headlampCustomName: undefined }),
    };
    const rowB = {
      key: 'row-B',
      kubeconfig: makeKubeB64({ name: 'ctxB', headlampCustomName: undefined }),
    };
    const fake = makeFakeIndexedDB([rowA, rowB]);
    (global as any).indexedDB = { open: fake.open };

    await expect(
      updateStatelessClusterKubeconfig('IGNORED', 'Nice B', 'ctxB')
    ).resolves.toBeUndefined();

    expect(fake.calls.putArgs.length).toBe(1);
    const updatedRow = fake.calls.putArgs[0] as any;
    expect(updatedRow.key).toBe('row-B');

    const parsedB = jsyaml.load((global as any).atob(updatedRow.kubeconfig)) as any;
    const headlamp = parsedB.contexts[0].context.extensions.find(
      (e: any) => e.name === 'headlamp_info'
    );
    expect(headlamp.extension.customName).toBe('Nice B');
  });

  test('can locate by existing customName (not just context.name)', async () => {
    const row = {
      key: 'row-1',
      kubeconfig: makeKubeB64({ name: 'ctx1', headlampCustomName: 'Pretty' }),
    };
    const fake = makeFakeIndexedDB([row]);
    (global as any).indexedDB = { open: fake.open };

    await expect(
      updateStatelessClusterKubeconfig('IGNORED', 'Even Prettier', 'Pretty')
    ).resolves.toBeUndefined();

    const updated = fake.calls.putArgs[0] as any;
    const parsed = jsyaml.load((global as any).atob(updated.kubeconfig)) as any;
    const headlamp = parsed.contexts[0].context.extensions.find(
      (e: any) => e.name === 'headlamp_info'
    );
    expect(headlamp.extension.customName).toBe('Even Prettier');
  });

  test('rejects when no matching context in any row', async () => {
    const row = {
      key: 'row-1',
      kubeconfig: makeKubeB64({ name: 'ctx1', headlampCustomName: undefined }),
    };
    const fake = makeFakeIndexedDB([row]);
    (global as any).indexedDB = { open: fake.open };

    await expect(
      updateStatelessClusterKubeconfig('IGNORED', 'Nope', 'missing-ctx')
    ).rejects.toContain('not found');
  });

  test('rejects when put fails', async () => {
    const row = {
      key: 'row-1',
      kubeconfig: makeKubeB64({ name: 'ctx1', headlampCustomName: undefined }),
    };
    const fake = makeFakeIndexedDB([row], { failPut: true });
    (global as any).indexedDB = { open: fake.open };

    await expect(updateStatelessClusterKubeconfig('IGNORED', 'Pretty', 'ctx1')).rejects.toContain(
      'Failed to update kubeconfig'
    );
  });
});
