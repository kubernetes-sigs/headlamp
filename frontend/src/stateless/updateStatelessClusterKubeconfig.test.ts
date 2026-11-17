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

import { IDBCursor, IDBFactory } from 'fake-indexeddb';
import * as jsyaml from 'js-yaml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeBase64, encodeBase64 } from '../helpers/base64';
import type { KubeconfigObject } from '../lib/k8s/kubeconfig';
import { getStatelessClusterKubeConfigs, storeStatelessClusterKubeconfig } from './index';
import { updateStatelessClusterKubeconfig } from './updateStatelessClusterKubeconfig';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function document(name: string, customName?: string) {
  return encodeBase64(
    jsyaml.dump({
      contexts: [
        {
          name,
          context: {
            cluster: name,
            user: name,
            extensions: [
              { name: 'other', extension: { retained: true } },
              ...(customName
                ? [
                    {
                      name: 'headlamp_info',
                      extension: { customName, tags: { env: 'prod' }, unknown: 'retained' },
                    },
                  ]
                : []),
            ],
          },
        },
      ],
      clusters: [{ name, cluster: {} }],
      users: [{ name, user: {} }],
    })
  );
}

it.each([undefined, 'Previous'])(
  'adds or replaces customName %s without losing extensions',
  async previous => {
    await storeStatelessClusterKubeconfig(document('target', previous));
    await updateStatelessClusterKubeconfig('', 'Pretty', previous ?? 'target');
    const [stored] = await getStatelessClusterKubeConfigs();
    const parsed = jsyaml.load(decodeBase64(stored)) as KubeconfigObject;
    const extensions = parsed.contexts?.[0].context.extensions ?? [];
    expect(extensions.find(extension => extension.name === 'other')?.extension).toEqual({
      retained: true,
    });
    const headlamp = extensions.filter(extension => extension.name === 'headlamp_info');
    expect(headlamp).toHaveLength(1);
    expect(headlamp[0].extension).toEqual(
      previous
        ? { customName: 'Pretty', tags: { env: 'prod' }, unknown: 'retained' }
        : { customName: 'Pretty' }
    );
  }
);

it('changes only the document containing the target context', async () => {
  const unrelated = document('other');
  await storeStatelessClusterKubeconfig(unrelated);
  await storeStatelessClusterKubeconfig(document('target'));
  await updateStatelessClusterKubeconfig('', 'Pretty', 'target');
  expect(await getStatelessClusterKubeConfigs()).toContain(unrelated);
});

it('rejects a missing context', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await storeStatelessClusterKubeconfig(document('target'));
  await expect(updateStatelessClusterKubeconfig('', 'Pretty', 'missing')).rejects.toThrow(
    'not found'
  );
});

it('rejects failed writes without committing a renamed document', async () => {
  const original = document('target');
  await storeStatelessClusterKubeconfig(original);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(IDBCursor.prototype, 'update').mockImplementationOnce(() => {
    throw new Error('write unavailable');
  });
  await expect(updateStatelessClusterKubeconfig('', 'Pretty', 'target')).rejects.toThrow(
    'write unavailable'
  );
  await expect(getStatelessClusterKubeConfigs()).resolves.toEqual([original]);
});
