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

import App from '../../../App';
import { KubeMetadata } from '../../../lib/k8s/KubeMetadata';
import Pod from '../../../lib/k8s/pod';
import { filterGraph, GraphFilter } from './graphFiltering';
import { GraphEdge, GraphNode } from './graphModel';

// circular dependency fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('filterGraph', () => {
  const nodes: GraphNode[] = [
    {
      id: '1',
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { namespace: 'ns1', name: 'node1' },
        status: {},
      } as any),
    },
    {
      id: '2',
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { namespace: 'ns2' } as KubeMetadata,
        status: { phase: 'Failed' },
      } as any),
    },
    {
      id: '3',
      kubeObject: new Pod({ kind: 'Pod', metadata: { namespace: 'ns3' }, status: {} } as any),
    },
    {
      id: '4',
      kubeObject: new Pod({ kind: 'Pod', metadata: { namespace: 'ns3' }, status: {} } as any),
    },
  ];

  const edges: GraphEdge[] = [
    { id: 'e1', source: '1', target: '2' },
    { id: 'e2', source: '3', target: '4' },
  ];

  it('filters nodes by namespace', () => {
    const filters: GraphFilter[] = [{ type: 'namespace', namespaces: new Set(['ns3']) }];
    const { nodes: filteredNodes } = filterGraph(nodes, edges, filters);

    // Output contains two nodes that both have same namespace ns3
    expect(filteredNodes.map(it => it.id)).toEqual(['3', '4']);
  });

  it('filters nodes by error status', () => {
    const filters: GraphFilter[] = [{ type: 'hasErrors' }];
    const { nodes: filteredNodes } = filterGraph(nodes, edges, filters);

    // Finds node 2 that has an error, and node 1 that is related to it
    expect(filteredNodes.map(it => it.id)).toEqual(['2', '1']);
  });
});
