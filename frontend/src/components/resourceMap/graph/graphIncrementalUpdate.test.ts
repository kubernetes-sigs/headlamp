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
import { detectGraphChanges, shouldUseIncrementalUpdate } from './graphIncrementalUpdate';
import { GraphEdge, GraphNode } from './graphModel';

// circular dependency fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('graphIncrementalUpdate', () => {
  describe('detectGraphChanges', () => {
    it('should detect added nodes', () => {
      const prevNodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1', resourceVersion: '1' },
            status: {},
          } as any),
        },
      ];

      const currentNodes: GraphNode[] = [
        ...prevNodes,
        {
          id: 'node-2',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-2', namespace: 'default', uid: 'uid-2', resourceVersion: '1' },
            status: {},
          } as any),
        },
      ];

      const result = detectGraphChanges(prevNodes, [], currentNodes, []);

      expect(result.addedNodes.size).toBe(1);
      expect(result.addedNodes.has('node-2')).toBe(true);
      expect(result.modifiedNodes.size).toBe(0);
      expect(result.deletedNodes.size).toBe(0);
    });

    it('should detect deleted nodes', () => {
      const prevNodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1', resourceVersion: '1' },
            status: {},
          } as any),
        },
        {
          id: 'node-2',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-2', namespace: 'default', uid: 'uid-2', resourceVersion: '1' },
            status: {},
          } as any),
        },
      ];

      const currentNodes: GraphNode[] = [prevNodes[0]];

      const result = detectGraphChanges(prevNodes, [], currentNodes, []);

      expect(result.deletedNodes.size).toBe(1);
      expect(result.deletedNodes.has('node-2')).toBe(true);
      expect(result.addedNodes.size).toBe(0);
      expect(result.modifiedNodes.size).toBe(0);
    });

    it('should detect modified nodes by resourceVersion', () => {
      const prevNodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1', resourceVersion: '1' },
            status: {},
          } as any),
        },
      ];

      const currentNodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1', resourceVersion: '2' },
            status: {},
          } as any),
        },
      ];

      const result = detectGraphChanges(prevNodes, [], currentNodes, []);

      expect(result.modifiedNodes.size).toBe(1);
      expect(result.modifiedNodes.has('node-1')).toBe(true);
      expect(result.addedNodes.size).toBe(0);
      expect(result.deletedNodes.size).toBe(0);
    });

    it('should detect added edges', () => {
      const nodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
            status: {},
          } as any),
        },
      ];

      const prevEdges: GraphEdge[] = [];
      const currentEdges: GraphEdge[] = [{ id: 'edge-1', source: 'node-1', target: 'node-2' }];

      const result = detectGraphChanges(nodes, prevEdges, nodes, currentEdges);

      expect(result.addedEdges.size).toBe(1);
      expect(result.addedEdges.has('edge-1')).toBe(true);
      expect(result.deletedEdges.size).toBe(0);
    });

    it('should detect deleted edges', () => {
      const nodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
            status: {},
          } as any),
        },
      ];

      const prevEdges: GraphEdge[] = [{ id: 'edge-1', source: 'node-1', target: 'node-2' }];
      const currentEdges: GraphEdge[] = [];

      const result = detectGraphChanges(nodes, prevEdges, nodes, currentEdges);

      expect(result.deletedEdges.size).toBe(1);
      expect(result.deletedEdges.has('edge-1')).toBe(true);
      expect(result.addedEdges.size).toBe(0);
    });

    it('should calculate change percentage correctly', () => {
      const prevNodes: GraphNode[] = Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: { name: `pod-${i}`, namespace: 'default', uid: `uid-${i}` },
          status: {},
        } as any),
      }));

      // Add 10 new nodes
      const currentNodes: GraphNode[] = [
        ...prevNodes,
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `new-node-${i}`,
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: `new-pod-${i}`, namespace: 'default', uid: `new-uid-${i}` },
            status: {},
          } as any),
        })),
      ];

      const result = detectGraphChanges(prevNodes, [], currentNodes, []);

      // 10 added nodes out of 110 total = ~9.09%
      expect(result.changePercentage).toBeCloseTo(9.09, 1);
    });

    it('should handle empty previous graph', () => {
      const prevNodes: GraphNode[] = [];
      const currentNodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
            status: {},
          } as any),
        },
      ];

      const result = detectGraphChanges(prevNodes, [], currentNodes, []);

      expect(result.addedNodes.size).toBe(1);
      expect(result.changePercentage).toBe(100);
    });

    it('should handle empty current graph', () => {
      const prevNodes: GraphNode[] = [
        {
          id: 'node-1',
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: 'pod-1', namespace: 'default', uid: 'uid-1' },
            status: {},
          } as any),
        },
      ];
      const currentNodes: GraphNode[] = [];

      const result = detectGraphChanges(prevNodes, [], currentNodes, []);

      expect(result.deletedNodes.size).toBe(1);
      expect(result.changePercentage).toBe(100);
    });

    it('should handle complex changes', () => {
      const prevNodes: GraphNode[] = Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        kubeObject: new Pod({
          kind: 'Pod',
          metadata: {
            name: `pod-${i}`,
            namespace: 'default',
            uid: `uid-${i}`,
            resourceVersion: '1',
          },
          status: {},
        } as any),
      }));

      const currentNodes: GraphNode[] = [
        // Keep first 90 nodes
        ...prevNodes.slice(0, 90),
        // Modify 10 nodes (change resourceVersion)
        ...prevNodes.slice(90, 100).map(node => {
          const podData = node.kubeObject as Pod;
          return {
            ...node,
            kubeObject: new Pod({
              kind: 'Pod',
              metadata: {
                ...podData.metadata,
                resourceVersion: '2',
              },
              status: {},
            } as any),
          };
        }),
        // Add 5 new nodes
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `new-node-${i}`,
          kubeObject: new Pod({
            kind: 'Pod',
            metadata: { name: `new-pod-${i}`, namespace: 'default', uid: `new-uid-${i}` },
            status: {},
          } as any),
        })),
      ];

      const result = detectGraphChanges(prevNodes, [], currentNodes, []);

      expect(result.addedNodes.size).toBe(5);
      expect(result.modifiedNodes.size).toBe(10);
      expect(result.deletedNodes.size).toBe(0);
      // (5 + 10) / 105 = ~14.29%
      expect(result.changePercentage).toBeCloseTo(14.29, 1);
    });
  });

  describe('shouldUseIncrementalUpdate', () => {
    it('should recommend incremental update for small changes', () => {
      const changes = {
        addedNodes: new Set<string>(['node-1']),
        modifiedNodes: new Set<string>(['node-2']),
        deletedNodes: new Set<string>(),
        addedEdges: new Set<string>(),
        deletedEdges: new Set<string>(),
        changePercentage: 5,
      };

      expect(shouldUseIncrementalUpdate(changes)).toBe(true);
    });

    it('should not recommend incremental update for large changes', () => {
      const changes = {
        addedNodes: new Set<string>(Array.from({ length: 50 }, (_, i) => `node-${i}`)),
        modifiedNodes: new Set<string>(),
        deletedNodes: new Set<string>(),
        addedEdges: new Set<string>(),
        deletedEdges: new Set<string>(),
        changePercentage: 25,
      };

      expect(shouldUseIncrementalUpdate(changes)).toBe(false);
    });

    it('should use 20% threshold', () => {
      // Just below threshold
      const changesBelowThreshold = {
        addedNodes: new Set<string>(),
        modifiedNodes: new Set<string>(),
        deletedNodes: new Set<string>(),
        addedEdges: new Set<string>(),
        deletedEdges: new Set<string>(),
        changePercentage: 19.9,
      };

      expect(shouldUseIncrementalUpdate(changesBelowThreshold)).toBe(true);

      // At threshold
      const changesAtThreshold = {
        addedNodes: new Set<string>(),
        modifiedNodes: new Set<string>(),
        deletedNodes: new Set<string>(),
        addedEdges: new Set<string>(),
        deletedEdges: new Set<string>(),
        changePercentage: 20,
      };

      expect(shouldUseIncrementalUpdate(changesAtThreshold)).toBe(false);

      // Above threshold
      const changesAboveThreshold = {
        addedNodes: new Set<string>(),
        modifiedNodes: new Set<string>(),
        deletedNodes: new Set<string>(),
        addedEdges: new Set<string>(),
        deletedEdges: new Set<string>(),
        changePercentage: 20.1,
      };

      expect(shouldUseIncrementalUpdate(changesAboveThreshold)).toBe(false);
    });
  });
});
