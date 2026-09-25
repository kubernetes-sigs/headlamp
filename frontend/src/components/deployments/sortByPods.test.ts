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

function makeDeployment(name: string, status: object) {
  return { metadata: { name }, status } as Deployment;
}

describe('sortByPods', () => {
  // The API omits replicas and availableReplicas when they are zero.
  const deployments = [
    makeDeployment('available-3-of-3', { replicas: 3, availableReplicas: 3 }),
    makeDeployment('scaled-to-zero', {}),
    makeDeployment('unavailable-0-of-2', { replicas: 2 }),
    makeDeployment('partial-1-of-2', { replicas: 2, availableReplicas: 1 }),
  ];

  const namesInOrder = (list: Deployment[]) => [...list].sort(sortByPods).map(d => d.metadata.name);

  it('sorts deployments without available replicas by their replica count', () => {
    expect(namesInOrder(deployments)).toEqual([
      'scaled-to-zero',
      'unavailable-0-of-2',
      'partial-1-of-2',
      'available-3-of-3',
    ]);
  });

  it('gives the same order no matter the initial one', () => {
    expect(namesInOrder([...deployments].reverse())).toEqual(namesInOrder(deployments));
  });
});
