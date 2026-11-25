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
import {
  collapseGraph,
  findGroupContaining,
  getGraphSize,
  getMainNode,
  getParentNode,
  groupGraph,
  UNSCHEDULED_GROUP,
} from './graphGrouping';
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

describe('graph helpers', () => {
  const smallGroup: GraphNode = {
    id: 'small-group',
    nodes: [{ id: 'small-leaf' }],
    edges: [],
  };
  const nestedGroup: GraphNode = {
    id: 'nested-group',
    nodes: [{ id: 'nested-leaf' }],
    edges: [],
  };
  const bigGroup: GraphNode = {
    id: 'big-group',
    nodes: [nestedGroup, ...Array.from({ length: 10 }, (_, index) => ({ id: `leaf-${index}` }))],
    edges: [],
  };
  const connectedGroup: GraphNode = {
    id: 'connected-group',
    nodes: [{ id: 'connected-leaf' }],
    edges: [{ id: 'edge', source: 'connected-leaf', target: 'connected-leaf' }],
  };
  const graph: GraphNode = {
    id: 'root',
    nodes: [smallGroup, bigGroup, connectedGroup],
    edges: [],
  };

  it('counts every node in nested graphs', () => {
    expect(getGraphSize(graph)).toBe(18);
  });

  it('finds direct parents and returns undefined for missing nodes', () => {
    expect(getParentNode(graph, 'nested-leaf')).toBe(nestedGroup);
    expect(getParentNode(graph, 'missing')).toBeUndefined();
  });

  it('finds groups containing nodes and nested groups', () => {
    expect(findGroupContaining(graph, 'root')).toBe(graph);
    expect(findGroupContaining(graph, 'small-leaf')).toBe(smallGroup);
    expect(findGroupContaining(graph, 'nested-leaf')).toBe(nestedGroup);
    expect(findGroupContaining(graph, 'nested-group')).toBe(nestedGroup);
    expect(findGroupContaining(graph, 'big-group', true)).toBe(graph);
    expect(findGroupContaining(graph, 'missing')).toBeUndefined();
  });

  it('collapses only large or connected unselected groups', () => {
    const collapsed = collapseGraph(graph, { expandAll: false });

    expect(collapsed.collapsed).toBe(false);
    expect(collapsed.nodes?.find(node => node.id === 'small-group')?.collapsed).toBe(false);
    expect(collapsed.nodes?.find(node => node.id === 'big-group')?.collapsed).toBe(true);
    expect(collapsed.nodes?.find(node => node.id === 'connected-group')?.collapsed).toBe(true);
  });

  it('keeps every group open when expandAll is enabled', () => {
    const expanded = collapseGraph(graph, { expandAll: true });

    expect(expanded.nodes?.every(node => node.collapsed === false)).toBe(true);
  });

  it('keeps only the selected non-root group at the root', () => {
    const selected = collapseGraph(graph, {
      selectedNodeId: 'nested-leaf',
      expandAll: false,
    });

    expect(selected.nodes).toHaveLength(1);
    expect(selected.nodes?.[0].id).toBe('nested-group');
    expect(selected.nodes?.[0].collapsed).toBe(false);
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

  it('associates namespace kubeObjects with namespace groups', () => {
    const namespace = {
      kind: 'Namespace',
      metadata: { name: 'ns1', uid: 'ns1-uid' },
    } as any;

    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'namespace',
      namespaces: [namespace],
      k8sNodes: [],
    });

    const namespaceGroup = groupedGraph.nodes?.find(node => node.label === 'ns1');
    expect(namespaceGroup?.kubeObject).toBe(namespace);
    expect(namespaceGroup?.id).toBe('ns1-uid');
  });

  it('groups nodes by node', () => {
    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'node',
      namespaces: [],
      k8sNodes: [],
    });
    const nodeNames = groupedGraph.nodes?.map(node => node.id);

    // Pods 1, 3 and 4 have no nodeName and are grouped into Node-Unscheduled
    // Pod 2 has nodeName 'node1' and is grouped into Node-node1
    expect(nodeNames).toHaveLength(2);
    expect(nodeNames).toEqual(expect.arrayContaining(['Node-Unscheduled', 'Node-node1']));
  });

  it('groups connected components by the pod node', () => {
    const componentNodes: GraphNode[] = [
      {
        id: 'deployment',
        kubeObject: { kind: 'Deployment', metadata: { name: 'deployment' } } as KubeObject,
      },
      {
        id: 'scheduled-pod',
        kubeObject: {
          kind: 'Pod',
          metadata: { name: 'scheduled-pod' },
          spec: { nodeName: 'node2' },
        } as any as KubeObject,
      },
    ];

    const groupedGraph = groupGraph(
      componentNodes,
      [{ id: 'deployment-pod', source: 'deployment', target: 'scheduled-pod' }],
      {
        groupBy: 'node',
        namespaces: [],
        k8sNodes: [],
      }
    );

    const nodeGroup = groupedGraph.nodes?.find(node => node.id === 'Node-node2');
    expect(nodeGroup?.nodes?.[0].id).toBe('group-deployment');
  });

  it('prefers unscheduled pods when grouping mixed connected components', () => {
    const componentNodes: GraphNode[] = [
      {
        id: 'deployment',
        kubeObject: { kind: 'Deployment', metadata: { name: 'deployment' } } as KubeObject,
      },
      {
        id: 'scheduled-pod',
        kubeObject: {
          kind: 'Pod',
          metadata: { name: 'scheduled-pod' },
          spec: { nodeName: 'node2' },
        } as any as KubeObject,
      },
      {
        id: 'unscheduled-pod',
        kubeObject: {
          kind: 'Pod',
          metadata: { name: 'unscheduled-pod' },
        } as KubeObject,
      },
    ];

    const groupedGraph = groupGraph(
      componentNodes,
      [
        { id: 'deployment-pod', source: 'deployment', target: 'scheduled-pod' },
        { id: 'pod-pod', source: 'scheduled-pod', target: 'unscheduled-pod' },
      ],
      {
        groupBy: 'node',
        namespaces: [],
        k8sNodes: [],
      }
    );

    const unscheduledGroup = groupedGraph.nodes?.find(node => node.label === UNSCHEDULED_GROUP);
    expect(unscheduledGroup?.nodes?.[0].id).toBe('group-deployment');
  });

  it('leaves non-Pod resources ungrouped when grouping by node', () => {
    const deployment = {
      id: 'deployment',
      kubeObject: { kind: 'Deployment', metadata: { name: 'deployment' } } as KubeObject,
    };

    const groupedGraph = groupGraph([deployment], edges, {
      groupBy: 'node',
      namespaces: [],
      k8sNodes: [],
    });

    expect(groupedGraph.nodes).toEqual([deployment]);
  });

  it('associates k8sNode kubeObject with node groups when k8sNodes are provided', () => {
    const k8sNodeObject = {
      kind: 'Node',
      metadata: { name: 'node1', uid: 'node1-uid' },
    } as any;

    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'node',
      namespaces: [],
      k8sNodes: [k8sNodeObject],
    });

    const nodeGroup = groupedGraph.nodes?.find(node => node.label === 'node1');

    // The group should have the k8sNode kubeObject associated with it
    expect(nodeGroup).toBeDefined();
    expect(nodeGroup?.kubeObject).toBe(k8sNodeObject);
    // The group ID should be updated to the node's UID
    expect(nodeGroup?.id).toBe('node1-uid');
  });

  it('does not associate k8sNode when k8sNodes list is empty', () => {
    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'node',
      namespaces: [],
      k8sNodes: [],
    });

    const nodeGroup = groupedGraph.nodes?.find(node => node.id === 'Node-node1');

    // Without k8sNodes data, the group should not have a kubeObject
    expect(nodeGroup).toBeDefined();
    expect(nodeGroup?.kubeObject).toBeUndefined();
  });

  it('does not link a kubeObject to the Unscheduled group', () => {
    const nodeNamedUnscheduled = {
      kind: 'Node',
      metadata: { name: UNSCHEDULED_GROUP, uid: 'unscheduled-node-uid' },
    } as any;
    const groupedGraph = groupGraph(nodes, edges, {
      groupBy: 'node',
      namespaces: [],
      k8sNodes: [nodeNamedUnscheduled],
    });

    const unscheduledGroup = groupedGraph.nodes?.find(node => node.label === UNSCHEDULED_GROUP);
    expect(unscheduledGroup).toBeDefined();
    expect(unscheduledGroup?.kubeObject).toBeUndefined();
    expect(unscheduledGroup?.nodes?.length).toBe(3);
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

  it('does not merge separate components through shared RWX PVC', () => {
    const rwxPvc: GraphNode = {
      id: 'pvc-rwx',
      kubeObject: {
        kind: 'PersistentVolumeClaim',
        metadata: { name: 'pvc-rwx', namespace: 'ns1' } as any,
        spec: { accessModes: ['ReadWriteMany'] },
      } as any,
    };

    const deploymentA: GraphNode = { id: 'deploy-a', kubeObject: { kind: 'Deployment' } as any };
    const podA: GraphNode = { id: 'pod-a', kubeObject: { kind: 'Pod' } as any };
    const deploymentB: GraphNode = { id: 'deploy-b', kubeObject: { kind: 'Deployment' } as any };
    const podB: GraphNode = { id: 'pod-b', kubeObject: { kind: 'Pod' } as any };

    const groupedGraph = groupGraph(
      [deploymentA, podA, deploymentB, podB, rwxPvc],
      [
        { id: 'e-a', source: 'deploy-a', target: 'pod-a' },
        { id: 'e-b', source: 'deploy-b', target: 'pod-b' },
        // Edges from RWX PVC to pods should be marked with a nonGroupingSide (simulating what relations.tsx does)
        { id: 'e-a-pvc', source: 'pvc-rwx', target: 'pod-a', nonGroupingSide: 'source' },
        { id: 'e-b-pvc', source: 'pvc-rwx', target: 'pod-b', nonGroupingSide: 'source' },
      ],
      { namespaces: [], k8sNodes: [] }
    );

    const connectedGroups = (groupedGraph.nodes ?? []).filter(
      node => node.id.startsWith('group-') && (node.edges?.length ?? 0) > 0
    );
    expect(connectedGroups).toHaveLength(2);

    // The original shared PVC node should not appear directly in grouped output.
    expect((groupedGraph.nodes ?? []).some(n => n.id === 'pvc-rwx')).toBe(false);

    const groupNodeIds = (group: GraphNode) => new Set((group.nodes ?? []).map(n => n.id));

    const groupA = connectedGroups.find(g => groupNodeIds(g).has('deploy-a'));
    const groupB = connectedGroups.find(g => groupNodeIds(g).has('deploy-b'));
    expect(groupA).toBeDefined();
    expect(groupB).toBeDefined();

    expect(groupNodeIds(groupA!).has('pod-a')).toBe(true);
    expect(groupNodeIds(groupB!).has('pod-b')).toBe(true);
    // Each group should only contain its own workload, not the other one.
    expect(groupNodeIds(groupA!).has('deploy-b')).toBe(false);
    expect(groupNodeIds(groupA!).has('pod-b')).toBe(false);
    expect(groupNodeIds(groupB!).has('deploy-a')).toBe(false);
    expect(groupNodeIds(groupB!).has('pod-a')).toBe(false);

    const pvcNodesByGroup = connectedGroups.map(group =>
      (group.nodes ?? []).filter(node => node.kubeObject?.kind === 'PersistentVolumeClaim')
    );

    expect(pvcNodesByGroup[0]).toHaveLength(1);
    expect(pvcNodesByGroup[1]).toHaveLength(1);

    const pvc0 = pvcNodesByGroup[0][0];
    const pvc1 = pvcNodesByGroup[1][0];

    expect(pvc0.id).not.toEqual(pvc1.id);
    expect(pvc0.id).not.toEqual('pvc-rwx');
    expect(pvc1.id).not.toEqual('pvc-rwx');
    expect(pvc0.id.startsWith('pvc-rwx--group-')).toBe(true);
    expect(pvc1.id.startsWith('pvc-rwx--group-')).toBe(true);

    // Each group should reference its own cloned PVC ID (not the original PVC ID), and
    // the cloned PVC node should preserve the original PVC's kubeObject data.
    connectedGroups.forEach(group => {
      const edgeIds = new Set((group.edges ?? []).flatMap(e => [e.source, e.target]));
      expect(edgeIds.has('pvc-rwx')).toBe(false);

      const pvc = (group.nodes ?? []).find(n => n.kubeObject?.kind === 'PersistentVolumeClaim');
      expect(pvc).toBeDefined();
      expect(edgeIds.has(pvc!.id)).toBe(true);
      expect((pvc!.kubeObject as any)?.spec?.accessModes).toContain('ReadWriteMany');
    });
  });

  it('does not merge separate components through shared generic nodes', () => {
    // Verifies the nonGroupingSide logic is generic and not tied to PVCs specifically.
    const sharedNode: GraphNode = {
      id: 'shared-resource',
      kubeObject: { kind: 'ConfigMap', metadata: { name: 'shared-cm' } } as any,
    };

    const nodeA: GraphNode = { id: 'node-a', kubeObject: { kind: 'Pod' } as any };
    const nodeB: GraphNode = { id: 'node-b', kubeObject: { kind: 'Pod' } as any };

    const groupedGraph = groupGraph(
      [nodeA, nodeB, sharedNode],
      [
        {
          id: 'e-a-shared',
          source: 'shared-resource',
          target: 'node-a',
          nonGroupingSide: 'source',
        },
        {
          id: 'e-b-shared',
          source: 'shared-resource',
          target: 'node-b',
          nonGroupingSide: 'source',
        },
      ],
      { namespaces: [], k8sNodes: [] }
    );

    const connectedGroups = (groupedGraph.nodes ?? []).filter(
      node => node.id.startsWith('group-') && (node.edges?.length ?? 0) > 0
    );
    // Should result in 2 separate groups, not 1 giant group.
    expect(connectedGroups).toHaveLength(2);

    const groupA = connectedGroups.find(g => (g.nodes ?? []).some(n => n.id === 'node-a'));
    const groupB = connectedGroups.find(g => (g.nodes ?? []).some(n => n.id === 'node-b'));

    expect(groupA).toBeDefined();
    expect(groupB).toBeDefined();

    // Verify shared node is cloned, once per group, with a distinct ID.
    const sharedInA = groupA?.nodes?.find(n => n.id.startsWith('shared-resource--'));
    const sharedInB = groupB?.nodes?.find(n => n.id.startsWith('shared-resource--'));
    expect(sharedInA).toBeDefined();
    expect(sharedInB).toBeDefined();
    expect(sharedInA?.id).not.toEqual(sharedInB?.id);
  });

  it('keeps the original ID for a shared RWX PVC that only touches one component', () => {
    // Two Pods of the *same* Deployment mounting an RWX PVC don't bridge separate
    // components, so the PVC should be reattached as-is (not cloned with a synthetic ID).
    const rwxPvc: GraphNode = {
      id: 'pvc-rwx',
      kubeObject: { kind: 'PersistentVolumeClaim' } as any,
    };
    const deployment: GraphNode = { id: 'deploy-a', kubeObject: { kind: 'Deployment' } as any };
    const podA: GraphNode = { id: 'pod-a', kubeObject: { kind: 'Pod' } as any };
    const podB: GraphNode = { id: 'pod-b', kubeObject: { kind: 'Pod' } as any };

    const groupedGraph = groupGraph(
      [deployment, podA, podB, rwxPvc],
      [
        { id: 'e-dep-a', source: 'deploy-a', target: 'pod-a' },
        { id: 'e-dep-b', source: 'deploy-a', target: 'pod-b' },
        { id: 'e-a-pvc', source: 'pvc-rwx', target: 'pod-a', nonGroupingSide: 'source' },
        { id: 'e-b-pvc', source: 'pvc-rwx', target: 'pod-b', nonGroupingSide: 'source' },
      ],
      { namespaces: [], k8sNodes: [] }
    );

    const connectedGroup = (groupedGraph.nodes ?? []).find(
      node => node.id.startsWith('group-') && (node.edges?.length ?? 0) > 0
    );
    expect(connectedGroup).toBeDefined();

    const pvcNode = connectedGroup?.nodes?.find(
      n => n.kubeObject?.kind === 'PersistentVolumeClaim'
    );
    expect(pvcNode?.id).toBe('pvc-rwx');

    const edgeIds = (connectedGroup?.edges ?? []).map(e => e.id);
    expect(edgeIds).toEqual(expect.arrayContaining(['e-a-pvc', 'e-b-pvc']));
  });

  it('does not treat a standalone Pod mounting two RWX PVCs as shared', () => {
    // The Pod's only edges are both `nonGroupingSide: 'source'` (naming the PVCs, not
    // the Pod, as shareable) so even though the Pod itself has no "normal" edges and
    // touches 2 neighbors, it must not be split out as if it were the shared resource.
    // Neither PVC has more than one consumer either, so nothing here should be split:
    // the Pod and both PVCs should end up in a single, un-cloned connected component.
    const pod: GraphNode = { id: 'pod-solo', kubeObject: { kind: 'Pod' } as any };
    const pvcA: GraphNode = { id: 'pvc-a', kubeObject: { kind: 'PersistentVolumeClaim' } as any };
    const pvcB: GraphNode = { id: 'pvc-b', kubeObject: { kind: 'PersistentVolumeClaim' } as any };

    const groupedGraph = groupGraph(
      [pod, pvcA, pvcB],
      [
        { id: 'e-pod-pvc-a', source: 'pvc-a', target: 'pod-solo', nonGroupingSide: 'source' },
        { id: 'e-pod-pvc-b', source: 'pvc-b', target: 'pod-solo', nonGroupingSide: 'source' },
      ],
      { namespaces: [], k8sNodes: [] }
    );

    const connectedGroups = (groupedGraph.nodes ?? []).filter(
      node => node.id.startsWith('group-') && (node.edges?.length ?? 0) > 0
    );
    // A single group containing the Pod and both (un-cloned) PVCs, not split apart.
    expect(connectedGroups).toHaveLength(1);
    const group = connectedGroups[0];
    expect((group.nodes ?? []).map(n => n.id).sort()).toEqual(['pod-solo', 'pvc-a', 'pvc-b']);
    expect((group.edges ?? []).map(e => e.id).sort()).toEqual(['e-pod-pvc-a', 'e-pod-pvc-b']);
  });

  describe('Pods of separate workloads sharing a ResourceClaimTemplate', () => {
    const node = (id: string, kind: string): GraphNode => ({ id, kubeObject: { kind } as any });
    const nodes = [
      node('deploy-a', 'Deployment'),
      node('deploy-b', 'Deployment'),
      node('pod-a', 'Pod'),
      node('pod-b', 'Pod'),
      node('claim-a', 'ResourceClaim'),
      node('claim-b', 'ResourceClaim'),
      node('template', 'ResourceClaimTemplate'),
      node('class', 'DeviceClass'),
    ];
    const workloadEdges: GraphEdge[] = [
      { id: 'e-deploy-a', source: 'deploy-a', target: 'pod-a' },
      { id: 'e-deploy-b', source: 'deploy-b', target: 'pod-b' },
      { id: 'e-pod-a-template', source: 'pod-a', target: 'template', nonGroupingSide: 'target' },
      { id: 'e-pod-b-template', source: 'pod-b', target: 'template', nonGroupingSide: 'target' },
      { id: 'e-template-class', source: 'template', target: 'class', nonGroupingSide: 'both' },
    ];
    const claimEdges: GraphEdge[] = [
      { id: 'e-pod-a-claim', source: 'pod-a', target: 'claim-a' },
      { id: 'e-pod-b-claim', source: 'pod-b', target: 'claim-b' },
      { id: 'e-claim-a-class', source: 'claim-a', target: 'class', nonGroupingSide: 'target' },
      { id: 'e-claim-b-class', source: 'claim-b', target: 'class', nonGroupingSide: 'target' },
    ];

    const connectedGroups = (edges: GraphEdge[]) =>
      (groupGraph(nodes, edges, { namespaces: [], k8sNodes: [] }).nodes ?? []).filter(
        group => group.id.startsWith('group-') && (group.edges?.length ?? 0) > 0
      );

    const expectOneGroupPerWorkload = (groups: GraphNode[], ownNodes: string[][]) => {
      expect(groups).toHaveLength(2);
      ownNodes.forEach(ids => {
        const group = groups.find(group => group.nodes?.some(node => node.id === ids[0]))!;
        const kindOf = (id: string) => group.nodes?.find(node => node.id === id)?.kubeObject?.kind;
        const idOf = (kind: string) =>
          group.nodes?.find(node => node.kubeObject?.kind === kind)?.id;

        expect(
          (group.nodes ?? [])
            .map(node => node.id)
            .filter(id => kindOf(id) !== 'ResourceClaimTemplate' && kindOf(id) !== 'DeviceClass')
            .sort()
        ).toEqual([...ids].sort());
        expect(group.edges).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              source: idOf('ResourceClaimTemplate'),
              target: idOf('DeviceClass'),
            }),
          ])
        );
      });
    };

    it('keeps each workload in its own group with the template and its device class', () => {
      expectOneGroupPerWorkload(connectedGroups([...workloadEdges, ...claimEdges]), [
        ['deploy-a', 'pod-a', 'claim-a'],
        ['deploy-b', 'pod-b', 'claim-b'],
      ]);
    });

    it('keeps the device class when only the shared template links to it', () => {
      expectOneGroupPerWorkload(connectedGroups(workloadEdges), [
        ['deploy-a', 'pod-a'],
        ['deploy-b', 'pod-b'],
      ]);
    });
  });

  describe('DeviceClasses shared between templates and claims', () => {
    const node = (id: string, kind: string): GraphNode => ({ id, kubeObject: { kind } as any });
    const baseId = (id: string) => id.split('--')[0];

    /** The ids of the nodes in each top-level component, without the copies' suffixes. */
    const componentsOf = (nodes: GraphNode[], edges: GraphEdge[]) =>
      (groupGraph(nodes, edges, { namespaces: [], k8sNodes: [] }).nodes ?? []).map(component => ({
        ids: (component.nodes ?? [component]).map(node => baseId(node.id)).sort(),
        edges: (component.edges ?? []).map(edge => [baseId(edge.source), baseId(edge.target)]),
      }));

    it('keeps the class edge of a template next to a workload that uses the class directly', () => {
      const components = componentsOf(
        [
          node('deploy-a', 'Deployment'),
          node('pod-a', 'Pod'),
          node('template', 'ResourceClaimTemplate'),
          node('deploy-b', 'Deployment'),
          node('pod-b', 'Pod'),
          node('claim-b', 'ResourceClaim'),
          node('class', 'DeviceClass'),
        ],
        [
          { id: 'e-deploy-a', source: 'deploy-a', target: 'pod-a' },
          { id: 'e-pod-a', source: 'pod-a', target: 'template', nonGroupingSide: 'target' },
          { id: 'e-template', source: 'template', target: 'class', nonGroupingSide: 'both' },
          { id: 'e-deploy-b', source: 'deploy-b', target: 'pod-b' },
          { id: 'e-pod-b', source: 'pod-b', target: 'claim-b' },
          { id: 'e-claim-b', source: 'claim-b', target: 'class', nonGroupingSide: 'target' },
        ]
      );

      expect(components.map(component => component.ids)).toEqual(
        expect.arrayContaining([
          ['class', 'deploy-a', 'pod-a', 'template'],
          ['claim-b', 'class', 'deploy-b', 'pod-b'],
        ])
      );
      expect(components).toHaveLength(2);
      const workloadA = components.find(component => component.ids.includes('pod-a'))!;
      expect(workloadA.edges).toContainEqual(['template', 'class']);
    });

    it('keeps an unused template out of the workloads that use its class', () => {
      const components = componentsOf(
        [
          node('pod-a', 'Pod'),
          node('claim-a', 'ResourceClaim'),
          node('pod-b', 'Pod'),
          node('claim-b', 'ResourceClaim'),
          node('unused', 'ResourceClaimTemplate'),
          node('class', 'DeviceClass'),
        ],
        [
          { id: 'e-pod-a', source: 'pod-a', target: 'claim-a' },
          { id: 'e-claim-a', source: 'claim-a', target: 'class', nonGroupingSide: 'target' },
          { id: 'e-pod-b', source: 'pod-b', target: 'claim-b' },
          { id: 'e-claim-b', source: 'claim-b', target: 'class', nonGroupingSide: 'target' },
          { id: 'e-unused', source: 'unused', target: 'class', nonGroupingSide: 'both' },
        ]
      );

      expect(components.map(component => component.ids)).toEqual(
        expect.arrayContaining([
          ['claim-a', 'class', 'pod-a'],
          ['claim-b', 'class', 'pod-b'],
          ['class', 'unused'],
        ])
      );
      expect(components).toHaveLength(3);
    });

    it('shows templates and classes when no Pods or claims are selected', () => {
      const components = componentsOf(
        [
          node('template-1', 'ResourceClaimTemplate'),
          node('template-2', 'ResourceClaimTemplate'),
          node('class', 'DeviceClass'),
        ],
        [
          { id: 'e-1', source: 'template-1', target: 'class', nonGroupingSide: 'both' },
          { id: 'e-2', source: 'template-2', target: 'class', nonGroupingSide: 'both' },
        ]
      );

      expect(components.map(component => component.ids)).toEqual(
        expect.arrayContaining([
          ['class', 'template-1'],
          ['class', 'template-2'],
        ])
      );
      expect(components).toHaveLength(2);
    });

    it('shows a template that asks for two classes when no Pods are selected', () => {
      const components = componentsOf(
        [
          node('template', 'ResourceClaimTemplate'),
          node('gpu', 'DeviceClass'),
          node('nic', 'DeviceClass'),
        ],
        [
          { id: 'e-gpu', source: 'template', target: 'gpu', nonGroupingSide: 'both' },
          { id: 'e-nic', source: 'template', target: 'nic', nonGroupingSide: 'both' },
        ]
      );

      expect(components).toEqual([
        {
          ids: ['gpu', 'nic', 'template'],
          edges: expect.arrayContaining([
            ['template', 'gpu'],
            ['template', 'nic'],
          ]),
        },
      ]);
    });
  });
});

describe('collapseGraph', () => {
  const bigGraph: GraphNode = {
    id: 'root',
    nodes: [
      {
        id: 'Namespace-ns1',
        label: 'ns1',
        nodes: Array.from({ length: 15 }, (_, i) => ({
          id: `node-${i}`,
          kubeObject: { kind: 'Pod' } as any,
        })),
        edges: [],
      },
    ],
    edges: [],
  };

  it('collapses large primary groups when expandLargeGraph is false', () => {
    const collapsed = collapseGraph(bigGraph, { expandAll: false, expandLargeGraph: false });
    const nsGroup = collapsed.nodes?.find(n => n.id === 'Namespace-ns1');
    expect(nsGroup?.collapsed).toBe(true);
  });

  it('keeps large primary groups expanded when expandLargeGraph is true', () => {
    const collapsed = collapseGraph(bigGraph, { expandAll: false, expandLargeGraph: true });
    const nsGroup = collapsed.nodes?.find(n => n.id === 'Namespace-ns1');
    expect(nsGroup?.collapsed).toBe(false);
  });
});
