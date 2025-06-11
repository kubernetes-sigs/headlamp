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
import { getMainNode, groupGraph } from './graphGrouping';
import { GraphEdge, GraphNode } from './graphModel';

describe('getMainNode', () => {
  it('returns undefined for empty array', () => {
    expect(getMainNode([])).toBeUndefined();
  });

  it('returns single node for array with one element', () => {
    const node = { id: 'test', kubeObject: { kind: 'Pod' } as any };
    expect(getMainNode([node])).toBe(node);
  });

  it('selects node with highest weight', () => {
    const nodes: GraphNode[] = [
      { id: 'pod', kubeObject: { kind: 'Pod' } as any }, // weight: 800
      { id: 'deployment', kubeObject: { kind: 'Deployment' } as any }, // weight: 980
      { id: 'service', kubeObject: { kind: 'Service' } as any }, // weight: 760
    ];

    const mainNode = getMainNode(nodes);
    expect(mainNode?.id).toBe('deployment');
  });

  it('prefers explicit weight over kind-based weight', () => {
    const nodes: GraphNode[] = [
      { id: 'deployment', kubeObject: { kind: 'Deployment' } as any }, // weight: 980
      { id: 'high-weight-pod', weight: 1500, kubeObject: { kind: 'Pod' } as any }, // explicit weight: 1500
    ];

    const mainNode = getMainNode(nodes);
    expect(mainNode?.id).toBe('high-weight-pod');
  });
});

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
    // After sorting by weight (descending) and ID (stable sort),
    // individual nodes come first, then group because no edges are present
    expect(nodeNames).toEqual(['1', '3', '4', 'Node-node1']);
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
    // After sorting by weight (descending) and ID (stable sort),
    // individual nodes come first, then group because no edges are present
    expect(instances).toEqual(['2', '4', 'Instance-instance1']);
  });

  it('groups nodes as connected components when no groupBy is specified', () => {
    const groupedGraph = groupGraph(nodes, [{ id: 'e2', source: '2', target: '4' }], {
      namespaces: [],
      k8sNodes: [],
    });
    const componentIds = groupedGraph.nodes?.map(node => node.id);

    // Find the group node (it will have edges)
    const groupNode = groupedGraph.nodes?.find(node => node.edges && node.edges.length > 0);
    const edgeIds = groupNode?.edges?.map(edge => edge.id);

    // Nodes 2 and 4 are connected by the edge and so are grouped together
    // The group gets an ID based on the main node (determined by weight and ID)
    // After sorting by weight (descending) and ID (stable sort),
    // group comes first due to having edges (+10000 weight), then individual nodes
    expect(componentIds).toEqual(['group-2', '1', '3']);
    expect(edgeIds).toEqual(['e2']);
  });

  it('handles mixed weight scenarios in connected components', () => {
    const mixedNodes: GraphNode[] = [
      { id: 'hpa', kubeObject: { kind: 'HorizontalPodAutoscaler' } as any }, // 1000
      { id: 'deployment', kubeObject: { kind: 'Deployment' } as any }, // 980
      { id: 'service', kubeObject: { kind: 'Service' } as any }, // 760
      { id: 'configmap', kubeObject: { kind: 'ConfigMap' } as any }, // 580
    ];

    const mixedEdges: GraphEdge[] = [{ id: 'e1', source: 'deployment', target: 'service' }];

    const groupedGraph = groupGraph(mixedNodes, mixedEdges, {
      namespaces: [],
      k8sNodes: [],
    });

    // Find connected component
    const connectedGroup = groupedGraph.nodes?.find(
      node => node.id.startsWith('group-') && node.edges && node.edges.length > 0
    );

    // Should be named after deployment (higher weight than service)
    expect(connectedGroup?.id).toBe('group-deployment');

    // Individual nodes should be sorted by weight
    const individualNodes = groupedGraph.nodes?.filter(node => !node.id.startsWith('group-'));
    expect(individualNodes?.map(n => n.id)).toEqual(['hpa', 'configmap']);
  });
});
