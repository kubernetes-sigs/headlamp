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

import { addPerformanceMetric } from '../PerformanceStats';
import { GraphEdge, GraphNode } from './graphModel';

/**
 * Represents the changes between two graph states
 */
export interface GraphChanges {
  addedNodes: Set<string>;
  modifiedNodes: Set<string>;
  deletedNodes: Set<string>;
  addedEdges: Set<string>;
  deletedEdges: Set<string>;
  changePercentage: number;
}

/**
 * Detect changes between previous and current graph
 * This enables incremental updates when only a small percentage of resources change.
 *
 * Detects added, modified, and deleted nodes and edges by comparing IDs and
 * resourceVersion metadata. When the change percentage is small, downstream
 * incremental filtering can skip reprocessing unchanged nodes.
 *
 * @param prevNodes - Previous graph nodes
 * @param prevEdges - Previous graph edges
 * @param currentNodes - Current graph nodes
 * @param currentEdges - Current graph edges
 * @returns Details about what changed
 */
export function detectGraphChanges(
  prevNodes: GraphNode[],
  prevEdges: GraphEdge[],
  currentNodes: GraphNode[],
  currentEdges: GraphEdge[]
): GraphChanges {
  const perfStart = performance.now();

  // Use Set for O(1) average-time lookups instead of O(n) array.includes()
  // For large graphs, this reduces membership checks from linear to constant time on average.
  const prevNodeIds = new Set(prevNodes.map(n => n.id));
  const currentNodeIds = new Set(currentNodes.map(n => n.id));
  const prevEdgeIds = new Set(prevEdges.map(e => e.id));
  const currentEdgeIds = new Set(currentEdges.map(e => e.id));

  // Find added nodes
  const addedNodes = new Set<string>();
  currentNodeIds.forEach(id => {
    if (!prevNodeIds.has(id)) {
      addedNodes.add(id);
    }
  });

  // Find deleted nodes
  const deletedNodes = new Set<string>();
  prevNodeIds.forEach(id => {
    if (!currentNodeIds.has(id)) {
      deletedNodes.add(id);
    }
  });

  // Find modified nodes (same ID but different resourceVersion)
  const modifiedNodes = new Set<string>();
  const prevNodeMap = new Map(prevNodes.map(n => [n.id, n]));
  const currentNodeMap = new Map(currentNodes.map(n => [n.id, n]));

  currentNodeIds.forEach(id => {
    if (!addedNodes.has(id) && prevNodeIds.has(id)) {
      const prevNode = prevNodeMap.get(id);
      const currentNode = currentNodeMap.get(id);

      if (prevNode && currentNode && prevNode.kubeObject && currentNode.kubeObject) {
        const prevVersion = prevNode.kubeObject.metadata.resourceVersion;
        const currentVersion = currentNode.kubeObject.metadata.resourceVersion;

        if (prevVersion !== currentVersion) {
          modifiedNodes.add(id);
        }
      }
    }
  });

  // Find added/deleted edges
  const addedEdges = new Set<string>();
  currentEdgeIds.forEach(id => {
    if (!prevEdgeIds.has(id)) {
      addedEdges.add(id);
    }
  });

  const deletedEdges = new Set<string>();
  prevEdgeIds.forEach(id => {
    if (!currentEdgeIds.has(id)) {
      deletedEdges.add(id);
    }
  });

  // Calculate change percentage
  const totalNodes = Math.max(prevNodes.length, currentNodes.length);
  const changedNodes = addedNodes.size + modifiedNodes.size + deletedNodes.size;
  const changePercentage = totalNodes > 0 ? (changedNodes / totalNodes) * 100 : 0;

  const totalTime = performance.now() - perfStart;

  // Only log to console if debug flag is set
  if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
    console.log(
      `[ResourceMap Performance] detectGraphChanges: ${totalTime.toFixed(
        2
      )}ms (${changePercentage.toFixed(1)}% changed: +${addedNodes.size} ~${modifiedNodes.size} -${
        deletedNodes.size
      })`
    );
  }

  addPerformanceMetric({
    operation: 'detectGraphChanges',
    duration: totalTime,
    timestamp: Date.now(),
    details: {
      changePercentage: changePercentage.toFixed(1),
      addedNodes: addedNodes.size,
      modifiedNodes: modifiedNodes.size,
      deletedNodes: deletedNodes.size,
      addedEdges: addedEdges.size,
      deletedEdges: deletedEdges.size,
    },
  });

  return {
    addedNodes,
    modifiedNodes,
    deletedNodes,
    addedEdges,
    deletedEdges,
    changePercentage,
  };
}

/**
 * Determines if incremental update is beneficial
 * Incremental updates are faster when less than 20% of the graph changes
 */
export function shouldUseIncrementalUpdate(changes: GraphChanges): boolean {
  return changes.changePercentage < 20;
}
