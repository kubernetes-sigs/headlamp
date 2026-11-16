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

import { describe, expect, it } from 'vitest';
import type { LabelSelector } from './cluster';
import PDB from './podDisruptionBudget';

function makePDB(selector: LabelSelector) {
  return new PDB({
    apiVersion: 'policy/v1',
    kind: 'PodDisruptionBudget',
    metadata: {
      name: 'test-pdb',
      namespace: 'default',
      uid: 'pdb-uid',
      creationTimestamp: '2023-01-01T00:00:00Z',
    },
    spec: { minAvailable: 1, selector },
    status: {
      currentHealthy: 1,
      desiredHealthy: 1,
      disruptionsAllowed: 0,
      expectedPods: 1,
      observedGeneration: 1,
      conditions: [],
    },
  });
}

describe('PDB selectors', () => {
  it('lists matchLabels', () => {
    const pdb = makePDB({ matchLabels: { app: 'nginx', tier: 'web' } });

    expect(pdb.selectors).toEqual(['app: nginx', 'tier: web']);
  });

  it('lists matchExpressions when there are no matchLabels', () => {
    const pdb = makePDB({
      matchExpressions: [
        { key: 'tier', operator: 'In', values: ['web', 'api'] },
        { key: 'canary', operator: 'DoesNotExist', values: [] },
      ],
    });

    expect(pdb.selectors).toEqual(['tier in (api,web)', '!canary']);
  });

  it('lists matchLabels followed by matchExpressions', () => {
    const pdb = makePDB({
      matchLabels: { app: 'nginx' },
      matchExpressions: [{ key: 'env', operator: 'NotIn', values: ['dev'] }],
    });

    expect(pdb.selectors).toEqual(['app: nginx', 'env notin (dev)']);
  });

  it('returns an empty list for an empty selector', () => {
    expect(makePDB({}).selectors).toEqual([]);
  });
});
