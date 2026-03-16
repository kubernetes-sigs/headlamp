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

import { getNodeWeight, GraphNode } from './graphModel';

describe('getNodeWeight', () => {
  it('correctly assigns default weights to different Kubernetes resource types', () => {
    const testCases = [
      { kind: 'HorizontalPodAutoscaler', expectedWeight: 1000 },
      { kind: 'Deployment', expectedWeight: 980 },
      { kind: 'ReplicaSet', expectedWeight: 960 },
      { kind: 'StatefulSet', expectedWeight: 960 },
      { kind: 'DaemonSet', expectedWeight: 960 },
      { kind: 'CronJob', expectedWeight: 960 },
      { kind: 'ServiceAccount', expectedWeight: 960 },
      { kind: 'Job', expectedWeight: 920 },
      { kind: 'Pod', expectedWeight: 800 },
      { kind: 'Service', expectedWeight: 790 },
      { kind: 'ConfigMap', expectedWeight: 790 },
      { kind: 'Secret', expectedWeight: 790 },
      { kind: 'Ingress', expectedWeight: 780 },
      { kind: 'UnknownResource', expectedWeight: 500 }, // default weight
    ];

    testCases.forEach(({ kind, expectedWeight }) => {
      const node: GraphNode = {
        id: `test-${kind}`,
        kubeObject: { kind } as any,
      };
      expect(getNodeWeight(node)).toBe(expectedWeight);
    });
  });

  it('honors explicit weight over default kind-based weight', () => {
    const node: GraphNode = {
      id: 'custom-pod',
      weight: 1500,
      kubeObject: { kind: 'Pod' } as any,
    };
    expect(getNodeWeight(node)).toBe(1500);
  });

  it('uses default weight for nodes without kubeObject', () => {
    const node: GraphNode = { id: 'plain-node' };
    expect(getNodeWeight(node)).toBe(500);
  });
});
