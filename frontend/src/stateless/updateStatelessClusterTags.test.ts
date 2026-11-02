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

import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import * as yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeBase64, encodeBase64 } from '../helpers/base64';
import type { KubeconfigObject } from '../lib/k8s/kubeconfig';
import {
  readStatelessClusterTagTarget,
  updateStatelessClusterTags,
} from './updateStatelessClusterTags';

async function seed(
  extensions?: KubeconfigObject['contexts'][number]['context']['extensions'],
  name = 'original',
  additionalContexts: KubeconfigObject['contexts'] = [],
  key = 'file'
) {
  const config = {
    clusters: [{ name: 'cluster', cluster: { server: 'https://original.example' } }],
    contexts: [
      { name, context: { cluster: 'cluster', user: 'user', extensions } },
      ...additionalContexts,
    ],
  };
  const encoded = encodeBase64(yaml.dump(config));
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kubeconfigs', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('kubeconfigStore', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kubeconfigStore', 'readwrite');
    tx.objectStore('kubeconfigStore').put({ key, kubeconfig: encoded, unrelated: true });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

describe('updateStatelessClusterTags', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('creates tags and resolves only after they can be read in another transaction', async () => {
    await seed();
    const updated = await updateStatelessClusterTags('original', { env: 'prod' });
    const parsed = yaml.load(decodeBase64(updated!)) as KubeconfigObject;
    expect(parsed.contexts[0].context.extensions).toEqual([
      { name: 'headlamp_info', extension: { tags: { env: 'prod' } } },
    ]);
    // A second transaction starts from the committed document, not the original.
    const cleared = await updateStatelessClusterTags('original', {});
    expect(yaml.load(decodeBase64(cleared!))).toMatchObject({
      contexts: [{ context: { extensions: [{ extension: { tags: {} } }] } }],
    });
  });

  it('finds renamed contexts and preserves customName and other extension fields', async () => {
    await seed([
      { name: 'other', extension: { customName: 'untouched' } },
      { name: 'headlamp_info', extension: { customName: 'renamed', tags: { env: 'dev' } } },
    ]);
    const updated = await updateStatelessClusterTags('renamed', { env: 'prod' });
    expect(yaml.load(decodeBase64(updated!))).toMatchObject({
      contexts: [
        {
          name: 'original',
          context: {
            extensions: [
              { name: 'other', extension: { customName: 'untouched' } },
              {
                name: 'headlamp_info',
                extension: { customName: 'renamed', tags: { env: 'prod' } },
              },
            ],
          },
        },
      ],
    });
  });

  it('does not replace another context when no match exists', async () => {
    await seed();
    expect(await updateStatelessClusterTags('missing', { env: 'prod' })).toBeNull();
  });

  it('targets the effective display name rather than another context original name', async () => {
    await seed([{ name: 'headlamp_info', extension: { customName: 'renamed' } }], 'original', [
      {
        name: 'other',
        context: {
          cluster: 'cluster',
          user: 'user',
          extensions: [{ name: 'headlamp_info', extension: { customName: 'original' } }],
        },
      },
    ]);
    const updated = await updateStatelessClusterTags('original', { env: 'prod' });
    const parsed = yaml.load(decodeBase64(updated!)) as KubeconfigObject;
    expect(parsed.contexts[0].context.extensions).toEqual([
      { name: 'headlamp_info', extension: { customName: 'renamed' } },
    ]);
    expect(parsed.contexts[1].context.extensions).toEqual([
      { name: 'headlamp_info', extension: { customName: 'original', tags: { env: 'prod' } } },
    ]);
  });

  it.each([
    ['team/prod', 'team--prod'],
    ['my cluster', 'my__cluster'],
  ])('updates the normalized original name %s as %s', async (original, normalized) => {
    await seed(undefined, original);
    const updated = await updateStatelessClusterTags(normalized, { env: 'prod' });
    expect(yaml.load(decodeBase64(updated!))).toMatchObject({
      contexts: [
        { name: original, context: { extensions: [{ extension: { tags: { env: 'prod' } } }] } },
      ],
    });
  });

  it('does not use normalized names when an explicit cluster ID does not match', async () => {
    await seed(undefined, 'team/prod');
    expect(await updateStatelessClusterTags('team--prod', {}, 'other+context')).toBeNull();
  });

  it('does not match the normalized original name of a renamed context', async () => {
    await seed([{ name: 'headlamp_info', extension: { customName: 'renamed' } }], 'team/prod');
    expect(await updateStatelessClusterTags('team--prod', {})).toBeNull();
    expect(await updateStatelessClusterTags('renamed', { env: 'prod' })).not.toBeNull();
  });

  it('rejects database open failures rather than treating them as non-stateless', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    await expect(updateStatelessClusterTags('original', {})).rejects.toThrow(
      'database unavailable'
    );
  });

  it('rejects a replacement server before changing its tags', async () => {
    await seed();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(
      updateStatelessClusterTags('original', { env: 'prod' }, undefined, 'https://replaced.example')
    ).rejects.toThrow('was replaced');
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it('rejects replacement authentication at the same endpoint without writing', async () => {
    await seed();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(
      updateStatelessClusterTags(
        'original',
        { env: 'prod' },
        undefined,
        'https://original.example',
        'oidc'
      )
    ).rejects.toThrow('authentication was replaced');
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it('rejects aborted writes', async () => {
    await seed();
    const update = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    await expect(updateStatelessClusterTags('original', { env: 'prod' })).rejects.toThrow(
      'quota exceeded'
    );
    update.mockRestore();
  });

  it('rejects duplicate custom names across stored kubeconfigs before writing either entry', async () => {
    const extensions = [{ name: 'headlamp_info', extension: { customName: 'shared' } }];
    await seed(extensions, 'first', [], 'file-a');
    await seed(extensions, 'second', [], 'file-b');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(updateStatelessClusterTags('shared', { env: 'prod' })).rejects.toThrow(
      'Ambiguous browser kubeconfig context'
    );
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it('revalidates unique ownership after a new conflicting document is imported', async () => {
    const extensions = [{ name: 'headlamp_info', extension: { customName: 'shared' } }];
    await seed(extensions, 'first', [], 'file-a');
    const updated = await updateStatelessClusterTags('shared', { env: 'prod' });
    expect(await readStatelessClusterTagTarget('shared')).toBe(updated);
    await seed(extensions, 'second', [], 'file-b');
    await expect(readStatelessClusterTagTarget('shared')).rejects.toThrow('Ambiguous');
  });

  it('rejects duplicate custom names within a kubeconfig before writing', async () => {
    const extensions = [{ name: 'headlamp_info', extension: { customName: 'shared' } }];
    await seed(extensions, 'first', [
      { name: 'second', context: { cluster: 'cluster', user: 'user', extensions } },
    ]);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(updateStatelessClusterTags('shared', { env: 'prod' })).rejects.toThrow(
      'Ambiguous browser kubeconfig context'
    );
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });
});
