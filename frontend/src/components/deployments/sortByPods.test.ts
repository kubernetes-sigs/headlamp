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

import type Deployment from '../../lib/k8s/deployment';
import { sortByPods } from './sortByPods';

function makeDeployment(
  name: string,
  status?: Partial<Deployment['status']>,
  spec?: Partial<Deployment['spec']>
) {
  return { metadata: { name }, status, spec } as Deployment;
}

describe('sortByPods', () => {
  // The API omits spec.replicas and readyReplicas when they are zero.
  const deployments = [
    makeDeployment('ready-3-of-3', { replicas: 3, readyReplicas: 3 }, { replicas: 3 }),
    makeDeployment('scaled-to-zero', {}, { replicas: 0 }),
    makeDeployment('unready-0-of-2', { replicas: 2 }, { replicas: 2 }),
    makeDeployment('partial-1-of-2', { replicas: 2, readyReplicas: 1 }, { replicas: 2 }),
  ];

  const namesInOrder = (list: Deployment[]) => [...list].sort(sortByPods).map(d => d.metadata.name);

  it('sorts deployments without ready replicas by their desired spec.replicas count', () => {
    expect(namesInOrder(deployments)).toEqual([
      'scaled-to-zero',
      'unready-0-of-2',
      'partial-1-of-2',
      'ready-3-of-3',
    ]);
  });

  it('breaks ties using spec.replicas rather than status.replicas or availableReplicas', () => {
    const tied = [
      makeDeployment(
        'desired-3-avail-only',
        { replicas: 2, readyReplicas: 1, availableReplicas: 2 },
        { replicas: 3 }
      ),
      makeDeployment(
        'desired-2-ready-1',
        { replicas: 4, readyReplicas: 1, availableReplicas: 0 },
        { replicas: 2 }
      ),
    ];
    expect(namesInOrder(tied)).toEqual(['desired-2-ready-1', 'desired-3-avail-only']);
  });

  it('gives the same order no matter the initial one', () => {
    expect(namesInOrder([...deployments].reverse())).toEqual(namesInOrder(deployments));
  });

  it('handles deployments with undefined status without throwing', () => {
    const listWithUndefinedStatus = [
      makeDeployment('no-status', undefined, undefined),
      makeDeployment('ready-1', { replicas: 1, readyReplicas: 1 }, { replicas: 1 }),
      makeDeployment('empty-status', {}, {}),
    ];
    expect(() => namesInOrder(listWithUndefinedStatus)).not.toThrow();
    expect(namesInOrder(listWithUndefinedStatus)).toEqual(['no-status', 'empty-status', 'ready-1']);
  });
});
