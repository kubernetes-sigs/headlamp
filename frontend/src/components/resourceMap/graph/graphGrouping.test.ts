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

import { KubeMetadata } from '../../../lib/k8s/KubeMetadata';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { groupGraph } from './graphGrouping';
import { GraphEdge, GraphNode } from './graphModel';

describe('groupGraph', () => {
  const nodes: GraphNode[] = [
    {
      id: '1',
      kubeObject: {
        kind: 'Pod',
        metadata: {
          namespace: 'ns1',
          name: 'pod1',
          labels: { 'app.kubernetes.io/instance': 'instance1' },
        } as any as KubeMetadata,
      } as KubeObject,
    },
    {
      id: '2',
      kubeObject: {
        kind: 'Pod',
        metadata: { namespace: 'ns2', name: 'pod2' } as KubeMetadata,
        spec: { nodeName: 'node1' },
      } as any as KubeObject,
    },
    {
      id: '3',
      kubeObject: {
        kind: 'Pod',
        metadata: {
          namespace: 'ns1',
          name: 'pod3',
          labels: { 'app.kubernetes.io/instance': 'instance1' },
        } as any as KubeMetadata,
      } as KubeObject,
    },
    {
      id: '4',
      kubeObject: {
        kind: 'Pod',
        metadata: { namespace: 'ns2', name: 'pod4' } as KubeMetadata,
      } as KubeObject,
    },
  ];

  const edges: GraphEdge[] = [];

  it('groups nodes by namespace', () => {
    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'namespace',
      namespaces: [],
      k8sNodes: [],
    });
    const namespaces = groupedGraph.nodes?.map(node => node.id);

    // Nodes 1 and 3 are grouped into Namespace-ns1 group
    // Nodes 2 and 4 are grouped into Namespace-ns2 group
    expect(namespaces).toEqual(['Namespace-ns1', 'Namespace-ns2']);
  });

  it('groups nodes by node', () => {
    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'node',
      namespaces: [],
      k8sNodes: [],
    });
    const nodeNames = groupedGraph.nodes?.map(node => node.id);

    // Node 2 is grouped into Node-node1 group
    // Nodes 1, 3 and 4 don't have a node and are not grouped
    expect(nodeNames).toEqual(['Node-node1', '1', '3', '4']);
  });

  it('groups nodes by instance', () => {
    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'instance',
      namespaces: [],
      k8sNodes: [],
    });
    const instances = groupedGraph.nodes?.map(node => node.id);

    // Nodes 1 and 3 have the same instance label and grouped into Instance-instance1 group
    // Nodes 2 and 4 don't have instance label
    expect(instances).toEqual(['Instance-instance1', '2', '4']);
  });

  it('group nodes as connected components when no groupBy is specified', () => {
    const groupedGraph = groupGraph(nodes, [{ id: 'e2', source: '2', target: '4' }], {
      namespaces: [],
      k8sNodes: [],
    });
    const instances = groupedGraph.nodes?.map(node => node.id);
    const edgeIds = (groupedGraph.nodes?.[0] as GraphNode).edges?.map(edge => edge.id);

    // Nodes 2 and 4 are connected by the egde and so are grouped together
    // group-2 takes has 2 in it because it's the ID of the first node
    expect(instances).toEqual(['group-2', '1', '3']);
    expect(edgeIds).toEqual(['e2']);
  });
});
