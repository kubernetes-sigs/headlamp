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

import { IDBFactory } from 'fake-indexeddb';
import * as jsyaml from 'js-yaml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeBase64, encodeBase64 } from '../helpers/base64';
import type { KubeconfigObject } from '../lib/k8s/kubeconfig';
import { deleteClusterKubeconfig } from './deleteClusterKubeconfig';
import { getStatelessClusterKubeConfigs, storeStatelessClusterKubeconfig } from './index';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

function document(names: string[]) {
  return encodeBase64(
    jsyaml.dump({
      contexts: names.map(name => ({ name, context: { cluster: name, user: name } })),
      clusters: names.map(name => ({ name, cluster: {} })),
      users: names.map(name => ({ name, user: {} })),
      'current-context': names[0],
    })
  );
}

it('returns null when no rows match', async () => {
  await expect(deleteClusterKubeconfig('missing')).resolves.toBeNull();
});

it('commits deletion of the last context before returning its original document', async () => {
  const original = document(['first']);
  await storeStatelessClusterKubeconfig(original);
  await expect(deleteClusterKubeconfig('first')).resolves.toBe(original);
  await expect(getStatelessClusterKubeConfigs()).resolves.toEqual([]);
});

it('retains other contexts, updates current-context and removes unreferenced clusters/users', async () => {
  const original = document(['first', 'second']);
  const unrelated = document(['third']);
  await storeStatelessClusterKubeconfig(unrelated);
  await storeStatelessClusterKubeconfig(original);
  await expect(deleteClusterKubeconfig('first')).resolves.toBe(original);
  const stored = await getStatelessClusterKubeConfigs();
  expect(stored).toContain(unrelated);
  const parsed = jsyaml.load(
    decodeBase64(stored.find(value => value !== unrelated)!)
  ) as KubeconfigObject;
  expect(parsed.contexts?.map(context => context.name)).toEqual(['second']);
  expect(parsed.clusters?.map(cluster => cluster.name)).toEqual(['second']);
  expect(parsed.users?.map(user => user.name)).toEqual(['second']);
  expect(parsed['current-context']).toBe('second');
});
