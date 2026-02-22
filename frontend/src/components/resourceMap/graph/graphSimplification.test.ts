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
import Pod from '../../../lib/k8s/pod';
import { GraphEdge, GraphNode } from './graphModel';
import {
  EXTREME_SIMPLIFIED_NODE_LIMIT,
  SIMPLIFIED_NODE_LIMIT,
  simplifyGraph,
} from './graphSimplification';

// circular dependency fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('graphSimplification', () => {
  describe('simplifyGraph', () => {
    it('should not simplify when disabled', () => {
      const nodes: GraphNode[] = Array.from({ length: 2000 }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      }));

      const edges: GraphEdge[] = [];

      const result = simplifyGraph(nodes, edges, { enabled: false });

      expect(result.simplified).toBe(false);
      expect(result.nodes).toHaveLength(2000);
      expect(result.edges).toHaveLength(0);
    });

    it('should not simplify when node count is below threshold', () => {
      const nodes: GraphNode[] = Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      }));

      const edges: GraphEdge[] = [];

      const result = simplifyGraph(nodes, edges);

      expect(result.simplified).toBe(false);
      expect(result.nodes).toHaveLength(100);
    });

    it('should simplify when node count exceeds threshold', () => {
      const nodes: GraphNode[] = Array.from({ length: 1500 }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      }));

      const edges: GraphEdge[] = nodes.slice(1).map((node, i) => ({
        id: `edge-${i}`,
        source: nodes[0].id,
        target: node.id,
      }));

      const result = simplifyGraph(nodes, edges);

      expect(result.simplified).toBe(true);
      expect(result.nodes.length).toBeLessThanOrEqual(SIMPLIFIED_NODE_LIMIT);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeLessThan(edges.length);
    });

    it('should use extreme simplification for very large graphs', () => {
      const nodeCount = 15000;
      const nodes: GraphNode[] = Array.from({ length: nodeCount }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      }));

      const edges: GraphEdge[] = [];

      const result = simplifyGraph(nodes, edges);

      expect(result.simplified).toBe(true);
      // Should use extreme limit for graphs > EXTREME_SIMPLIFICATION_THRESHOLD
      expect(result.nodes.length).toBeLessThanOrEqual(EXTREME_SIMPLIFIED_NODE_LIMIT);
    });

    it('should preserve nodes with errors', () => {
      const nodes: GraphNode[] = [
        // Normal nodes
        ...Array.from({ length: 1200 }, (_, i) => ({
          id: `node-${i}`,
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
            status: {
              phase: 'Running',
              conditions: [{ type: 'Ready', status: 'True' }],
            },
          } as any),
        })),
        // Error nodes
        {
          id: 'error-node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'error-pod-1', namespace: 'default', uid: 'error-uid-1' },
            status: { phase: 'Failed', conditions: [] },
          } as any),
        },
        {
          id: 'error-node-2',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'error-pod-2', namespace: 'default', uid: 'error-uid-2' },
            status: {
              phase: 'Running',
              conditions: [{ type: 'Ready', status: 'False' }], // Warning status
            },
          } as any),
        },
      ];

      const edges: GraphEdge[] = [];

      const result = simplifyGraph(nodes, edges);

      expect(result.simplified).toBe(true);
      // Error nodes should be preserved
      expect(result.nodes.some(n => n.id === 'error-node-1')).toBe(true);
      expect(result.nodes.some(n => n.id === 'error-node-2')).toBe(true);
    });

    it('should preserve highly connected nodes', () => {
      const hubNode: GraphNode = {
        id: 'hub',
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: 'hub-pod', namespace: 'default', uid: 'hub-uid' },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      };

      const nodes: GraphNode[] = [
        hubNode,
        ...Array.from({ length: 1500 }, (_, i) => ({
          id: `node-${i}`,
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
            status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
          } as any),
        })),
      ];

      // Hub node connected to many nodes
      const edges: GraphEdge[] = nodes.slice(1, 501).map((node, i) => ({
        id: `edge-${i}`,
        source: hubNode.id,
        target: node.id,
      }));

      const result = simplifyGraph(nodes, edges);

      expect(result.simplified).toBe(true);
      // Hub node should be preserved due to high connectivity
      expect(result.nodes.some(n => n.id === 'hub')).toBe(true);
    });

    it('should respect custom maxNodes parameter', () => {
      const nodes: GraphNode[] = Array.from({ length: 1500 }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      }));

      const edges: GraphEdge[] = [];

      const result = simplifyGraph(nodes, edges, { maxNodes: 100 });

      expect(result.simplified).toBe(true);
      expect(result.nodes.length).toBeLessThanOrEqual(100);
    });

    it('should only keep edges between preserved nodes', () => {
      const nodes: GraphNode[] = Array.from({ length: 1500 }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      }));

      const edges: GraphEdge[] = [
        { id: 'edge-0', source: 'node-0', target: 'node-1' },
        { id: 'edge-1', source: 'node-0', target: 'node-2' },
        { id: 'edge-2', source: 'node-1', target: 'node-2' },
      ];

      const result = simplifyGraph(nodes, edges);

      expect(result.simplified).toBe(true);
      // All preserved edges should have both source and target in the result nodes
      const nodeIds = new Set(result.nodes.map(n => n.id));
      result.edges.forEach(edge => {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      });
    });

    it('should handle thresholds correctly', () => {
      // Test at exact maxNodes limit (should not simplify)
      const nodesAtLimit: GraphNode[] = Array.from({ length: SIMPLIFIED_NODE_LIMIT }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        } as any),
      }));

      const resultAtLimit = simplifyGraph(nodesAtLimit, []);
      expect(resultAtLimit.simplified).toBe(false);

      // Test just above limit (should simplify)
      const nodesAboveLimit: GraphNode[] = Array.from(
        { length: SIMPLIFIED_NODE_LIMIT + 1 },
        (_, i) => ({
          id: `node-${i}`,
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
            status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
          } as any),
        })
      );

      const resultAboveLimit = simplifyGraph(nodesAboveLimit, []);
      expect(resultAboveLimit.simplified).toBe(true);
    });
  });
});
