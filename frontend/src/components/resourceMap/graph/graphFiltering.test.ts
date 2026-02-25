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
import { filterGraph, filterGraphIncremental, GraphFilter } from './graphFiltering';
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
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    },
    {
      id: '2',
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { namespace: 'ns2' } as KubeMetadata,
        status: { phase: 'Failed', conditions: [] },
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

describe('filterGraphIncremental', () => {
  it('should only process changed nodes for small changes', () => {
    // Create 100 nodes
    const allNodes: GraphNode[] = Array.from({ length: 100 }, (_, i) => ({
      id: `pod-${i}`,
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    }));

    const allEdges: GraphEdge[] = [];

    // Previous filtered: all 100 nodes
    const prevFilteredNodes: GraphNode[] = [...allNodes];
    const prevFilteredEdges: GraphEdge[] = [];

    // Changes: 2 pods modified (2% change)
    const modifiedNodeIds = new Set(['pod-5', 'pod-10']);

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      new Set(),
      modifiedNodeIds,
      new Set(),
      allNodes,
      allEdges,
      [] // No filters
    );

    // Should return all 100 nodes (modified nodes still pass empty filter)
    expect(result.nodes).toHaveLength(100);
  });

  it('should handle added nodes that pass filter', () => {
    const existingNode: GraphNode = {
      id: 'pod-1',
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    };

    const newNode: GraphNode = {
      id: 'pod-2',
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { name: 'pod-2', namespace: 'default', uid: 'uid-2' },
        status: { phase: 'Failed', conditions: [] },
      } as any),
    };

    const allNodes: GraphNode[] = [existingNode, newNode];
    const allEdges: GraphEdge[] = [];

    const prevFilteredNodes: GraphNode[] = [];
    const prevFilteredEdges: GraphEdge[] = [];

    // pod-2 was added
    const addedNodeIds = new Set(['pod-2']);

    const filters: GraphFilter[] = [{ type: 'hasErrors' }];

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      addedNodeIds,
      new Set(),
      new Set(),
      allNodes,
      allEdges,
      filters
    );

    // Should include pod-2 (has error)
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('pod-2');
  });

  it('should handle deleted nodes correctly', () => {
    const remainingNode: GraphNode = {
      id: 'pod-1',
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    };

    const allNodes: GraphNode[] = [remainingNode];
    const allEdges: GraphEdge[] = [];

    // Previous had 2 nodes
    const prevFilteredNodes: GraphNode[] = [
      remainingNode,
      {
        id: 'pod-2',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-2', namespace: 'default', uid: 'uid-2' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
    ];
    const prevFilteredEdges: GraphEdge[] = [];

    // pod-2 was deleted
    const deletedNodeIds = new Set(['pod-2']);

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      new Set(),
      new Set(),
      deletedNodeIds,
      allNodes,
      allEdges,
      []
    );

    // Should only have pod-1
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('pod-1');
  });

  it('should handle modified nodes that no longer pass filter', () => {
    // This test validates that when a node is modified and no longer passes the filter,
    // it gets removed from results
    const allNodes: GraphNode[] = [
      {
        id: 'pod-1',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
          status: {
            phase: 'Running',
            conditions: [{ type: 'Ready', status: 'True' }], // Ready = success status
          },
        } as any),
      },
    ];

    const allEdges: GraphEdge[] = [];

    // Previous: pod-1 had Failed status (passed error filter)
    const prevFilteredNodes: GraphNode[] = [
      {
        id: 'pod-1',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
          status: { phase: 'Failed', conditions: [] },
        } as any),
      },
    ];
    const prevFilteredEdges: GraphEdge[] = [];

    // pod-1 was modified (status changed to Running with Ready=True)
    const modifiedNodeIds = new Set(['pod-1']);

    const filters: GraphFilter[] = [{ type: 'hasErrors' }];

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      new Set(),
      modifiedNodeIds,
      new Set(),
      allNodes,
      allEdges,
      filters
    );

    // pod-1 no longer passes error filter (now Running/Ready), should be removed
    expect(result.nodes).toHaveLength(0);
  });

  it('should match full filterGraph results for realistic WebSocket scenario', () => {
    // Simulate 2000-pod cluster with 1% change (20 pods modified)
    const allNodes: GraphNode[] = Array.from({ length: 2000 }, (_, i) => ({
      id: `pod-${i}`,
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: {
          name: `pod-${i}`,
          namespace: i % 10 === 0 ? 'kube-system' : 'default',
          uid: `uid-${i}`,
          resourceVersion: i >= 1980 ? '2' : '1', // Last 20 pods have new resourceVersion
        },
        status: { phase: i >= 1980 && i % 2 === 0 ? 'Failed' : 'Running' },
      } as any),
    }));

    const allEdges: GraphEdge[] = [];

    const filters: GraphFilter[] = [];

    // Get full filter baseline
    const fullResult = filterGraph(allNodes, allEdges, filters);

    // Previous filtered result (before changes)
    const prevNodes: GraphNode[] = Array.from({ length: 2000 }, (_, i) => ({
      id: `pod-${i}`,
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: {
          name: `pod-${i}`,
          namespace: i % 10 === 0 ? 'kube-system' : 'default',
          uid: `uid-${i}`,
          resourceVersion: '1',
        },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    }));

    const prevFilteredResult = filterGraph(prevNodes, [], filters);

    // Simulate incremental: 20 pods modified (1%)
    const modifiedNodeIds = new Set(allNodes.slice(1980).map(n => n.id));

    const incrementalResult = filterGraphIncremental(
      prevFilteredResult.nodes,
      prevFilteredResult.edges,
      new Set(),
      modifiedNodeIds,
      new Set(),
      allNodes,
      allEdges,
      filters
    );

    // Results should be identical
    expect(incrementalResult.nodes).toHaveLength(fullResult.nodes.length);
    expect(incrementalResult.nodes.map(n => n.id).sort()).toEqual(
      fullResult.nodes.map(n => n.id).sort()
    );
  });

  it('should handle namespace filter with added nodes', () => {
    const allNodes: GraphNode[] = [
      {
        id: 'pod-1',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
      {
        id: 'pod-2',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-2', namespace: 'production', uid: 'uid-2' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
      {
        id: 'pod-3',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-3', namespace: 'default', uid: 'uid-3' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
    ];

    const allEdges: GraphEdge[] = [];

    // Previous: showing pod-1 in default namespace
    const prevFilteredNodes: GraphNode[] = [allNodes[0]];
    const prevFilteredEdges: GraphEdge[] = [];

    // pod-3 was added to default namespace
    const addedNodeIds = new Set(['pod-3']);

    // Filter by 'default' namespace (same filter as before)
    const filters: GraphFilter[] = [{ type: 'namespace', namespaces: new Set(['default']) }];

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      addedNodeIds,
      new Set(),
      new Set(),
      allNodes,
      allEdges,
      filters
    );

    // Should show pod-1 and pod-3 (default namespace), not pod-2 (production)
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['pod-1', 'pod-3']);
  });

  it('should preserve edges between filtered nodes', () => {
    const allNodes: GraphNode[] = Array.from({ length: 3 }, (_, i) => ({
      id: `pod-${i}`,
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    }));

    const allEdges: GraphEdge[] = [
      { id: 'edge-1', source: 'pod-0', target: 'pod-1' },
      { id: 'edge-2', source: 'pod-1', target: 'pod-2' },
    ];

    const prevFilteredNodes: GraphNode[] = [...allNodes];
    const prevFilteredEdges: GraphEdge[] = [...allEdges];

    // pod-1 was modified
    const modifiedNodeIds = new Set(['pod-1']);

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      new Set(),
      modifiedNodeIds,
      new Set(),
      allNodes,
      allEdges,
      []
    );

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.edges.map(e => e.id).sort()).toEqual(['edge-1', 'edge-2']);
  });

  it('should handle complex multi-change scenario', () => {
    // Realistic scenario: 50 pod cluster with multiple changes
    const allNodes: GraphNode[] = [
      // Nodes 0-9: unchanged Running
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `pod-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      })),
      // Node 10: Modified to Failed
      {
        id: 'pod-10',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-10', namespace: 'default', uid: 'uid-10' },
          status: { phase: 'Failed', conditions: [] },
        } as any),
      },
      // Nodes 11-19: unchanged Running
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `pod-${i + 11}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i + 11}`, namespace: 'default', uid: `uid-${i + 11}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      })),
      // Node 20: Modified to Failed
      {
        id: 'pod-20',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-20', namespace: 'default', uid: 'uid-20' },
          status: { phase: 'Failed', conditions: [] },
        } as any),
      },
      // Nodes 21-29: unchanged Running
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `pod-${i + 21}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i + 21}`, namespace: 'default', uid: `uid-${i + 21}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      })),
      // Node 30: Modified to Failed
      {
        id: 'pod-30',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-30', namespace: 'default', uid: 'uid-30' },
          status: { phase: 'Failed', conditions: [] },
        } as any),
      },
      // Nodes 31-47: unchanged Running (note: pod-48 and pod-49 deleted)
      ...Array.from({ length: 17 }, (_, i) => ({
        id: `pod-${i + 31}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i + 31}`, namespace: 'default', uid: `uid-${i + 31}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      })),
      // Add 5 new Running nodes
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `new-pod-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `new-pod-${i}`, namespace: 'default', uid: `new-uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      })),
    ];

    const allEdges: GraphEdge[] = [];

    // Previous: no errors (empty filtered result)
    const prevFilteredNodes: GraphNode[] = [];
    const prevFilteredEdges: GraphEdge[] = [];

    const addedNodeIds = new Set(['new-pod-0', 'new-pod-1', 'new-pod-2', 'new-pod-3', 'new-pod-4']);
    const modifiedNodeIds = new Set(['pod-10', 'pod-20', 'pod-30']);
    const deletedNodeIds = new Set(['pod-48', 'pod-49']);

    const filters: GraphFilter[] = [{ type: 'hasErrors' }];

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      addedNodeIds,
      modifiedNodeIds,
      deletedNodeIds,
      allNodes,
      allEdges,
      filters
    );

    // Should show 3 modified pods with Failed status (pod-10, pod-20, pod-30)
    // Added nodes are Running (don't pass error filter)
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['pod-10', 'pod-20', 'pod-30']);
  });

  it('should match full filterGraph for correctness validation', () => {
    // 500 node graph with 2% change (10 nodes changed from Running to Failed)
    const allNodes: GraphNode[] = Array.from({ length: 500 }, (_, i) => ({
      id: `pod-${i}`,
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: {
          name: `pod-${i}`,
          namespace: i % 3 === 0 ? 'kube-system' : 'default',
          uid: `uid-${i}`,
        },
        status: {
          phase: i >= 490 ? 'Failed' : 'Running',
          conditions: i >= 490 ? [] : [{ type: 'Ready', status: 'True' }],
        },
      } as any),
    }));

    const allEdges: GraphEdge[] = [];

    const filters: GraphFilter[] = [{ type: 'hasErrors' }];

    // Full filter result (baseline for comparison) - should show 10 Failed pods
    const fullResult = filterGraph(allNodes, allEdges, filters);

    // Previous state (before last 10 pods changed to Failed) - all Running/Ready
    const prevNodes: GraphNode[] = Array.from({ length: 500 }, (_, i) => ({
      id: `pod-${i}`,
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: {
          name: `pod-${i}`,
          namespace: i % 3 === 0 ? 'kube-system' : 'default',
          uid: `uid-${i}`,
        },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    }));

    const prevFilteredResult = filterGraph(prevNodes, [], filters);

    // 10 pods modified (changed from Running/Ready to Failed)
    const modifiedNodeIds = new Set(allNodes.slice(490).map(n => n.id));

    const incrementalResult = filterGraphIncremental(
      prevFilteredResult.nodes,
      prevFilteredResult.edges,
      new Set(),
      modifiedNodeIds,
      new Set(),
      allNodes,
      allEdges,
      filters
    );

    // Results should match full filter - both should have 10 Failed pods
    expect(incrementalResult.nodes).toHaveLength(fullResult.nodes.length);
    expect(incrementalResult.nodes.map(n => n.id).sort()).toEqual(
      fullResult.nodes.map(n => n.id).sort()
    );
    expect(incrementalResult.nodes).toHaveLength(10); // 10 failed pods
  });

  it('should handle related nodes via BFS for error filter', () => {
    const allNodes: GraphNode[] = [
      {
        id: 'pod-1',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
          status: { phase: 'Failed', conditions: [] },
        } as any),
      },
      {
        id: 'pod-2',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-2', namespace: 'default', uid: 'uid-2' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
      {
        id: 'pod-3',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-3', namespace: 'default', uid: 'uid-3' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
    ];

    const allEdges: GraphEdge[] = [
      { id: 'edge-1', source: 'pod-1', target: 'pod-2' },
      { id: 'edge-2', source: 'pod-2', target: 'pod-3' },
    ];

    const prevFilteredNodes: GraphNode[] = [];
    const prevFilteredEdges: GraphEdge[] = [];

    // pod-1 changed to Failed status
    const modifiedNodeIds = new Set(['pod-1']);

    const filters: GraphFilter[] = [{ type: 'hasErrors' }];

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      new Set(),
      modifiedNodeIds,
      new Set(),
      allNodes,
      allEdges,
      filters
    );

    // Should include pod-1 (error) AND related pod-2 and pod-3 via BFS
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['pod-1', 'pod-2', 'pod-3']);
    expect(result.edges).toHaveLength(2);
  });

  it('should handle empty previous filtered result', () => {
    const allNodes: GraphNode[] = [
      {
        id: 'pod-1',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
    ];

    const allEdges: GraphEdge[] = [];

    // Empty previous result
    const prevFilteredNodes: GraphNode[] = [];
    const prevFilteredEdges: GraphEdge[] = [];

    // pod-1 was added
    const addedNodeIds = new Set(['pod-1']);

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      addedNodeIds,
      new Set(),
      new Set(),
      allNodes,
      allEdges,
      []
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('pod-1');
  });

  it('should handle multiple filters with OR logic', () => {
    // Test OR logic: kube-system namespace OR has errors
    const allNodes: GraphNode[] = [
      {
        id: 'pod-1',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-1', namespace: 'kube-system', uid: 'uid-1' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
      {
        id: 'pod-2',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-2', namespace: 'default', uid: 'uid-2' },
          status: { phase: 'Failed', conditions: [] },
        } as any),
      },
      {
        id: 'pod-3',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'pod-3', namespace: 'production', uid: 'uid-3' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      },
    ];

    // No edges - so related nodes won't be pulled in
    const allEdges: GraphEdge[] = [];

    const prevFilteredNodes: GraphNode[] = [];
    const prevFilteredEdges: GraphEdge[] = [];

    // All 3 pods were added
    const addedNodeIds = new Set(['pod-1', 'pod-2', 'pod-3']);

    // OR filter: kube-system namespace OR has errors
    const filters: GraphFilter[] = [
      { type: 'namespace', namespaces: new Set(['kube-system']) },
      { type: 'hasErrors' },
    ];

    const result = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      addedNodeIds,
      new Set(),
      new Set(),
      allNodes,
      allEdges,
      filters
    );

    // Should include pod-1 (kube-system) and pod-2 (error), not pod-3 (production + no error)
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['pod-1', 'pod-2']);
  });

  it('should handle large graphs with small changes correctly', () => {
    // 5000 node graph with 1% change - validates correctness, not speed in unit test
    const allNodes: GraphNode[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `pod-${i}`,
      kubeObject: new Pod({
        kind: 'Pod',
        metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      } as any),
    }));

    const allEdges: GraphEdge[] = [];
    const prevFilteredNodes: GraphNode[] = [...allNodes];
    const prevFilteredEdges: GraphEdge[] = [];

    // Only 50 nodes changed (1%)
    const modifiedNodeIds = new Set(allNodes.slice(0, 50).map(n => n.id));

    const incrementalResult = filterGraphIncremental(
      prevFilteredNodes,
      prevFilteredEdges,
      new Set(),
      modifiedNodeIds,
      new Set(),
      allNodes,
      allEdges,
      []
    );

    const fullResult = filterGraph(allNodes, allEdges, []);

    // Results should be identical (correctness test, not speed test)
    expect(incrementalResult.nodes).toHaveLength(fullResult.nodes.length);
    expect(incrementalResult.nodes.map(n => n.id).sort()).toEqual(
      fullResult.nodes.map(n => n.id).sort()
    );
  });
});
