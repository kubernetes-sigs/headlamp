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

import { getStatus } from '../nodes/KubeObjectStatus';
import { addPerformanceMetric } from '../PerformanceStats';
import { makeGraphLookup } from './graphLookup';
import { getNodeWeight, GraphEdge, GraphNode } from './graphModel';

/**
 * Selects the top N items from an array by a numeric score, using a min-heap.
 * Runs in O(n log k) time and O(k) memory where k = count,
 * compared to O(n log n) for a full sort.
 *
 * @param items - The full array to select from
 * @param count - How many top items to return
 * @param getScore - Function that returns a numeric score for each item (higher = better)
 * @returns The top `count` items (unordered)
 */
export function selectTopN<T>(items: T[], count: number, getScore: (item: T) => number): T[] {
  if (count <= 0) return [];
  if (items.length <= count) return items;

  // Build a min-heap of size `count` so the smallest score is at index 0.
  // For each remaining item, if its score exceeds the heap minimum, replace it.
  const heap: { item: T; score: number }[] = new Array(count);

  // Fill heap with first `count` items
  for (let i = 0; i < count; i++) {
    heap[i] = { item: items[i], score: getScore(items[i]) };
  }

  // Heapify (build min-heap)
  for (let i = Math.floor(count / 2) - 1; i >= 0; i--) {
    siftDown(heap, i, count);
  }

  // Scan remaining items; push into heap if larger than current minimum
  for (let i = count; i < items.length; i++) {
    const score = getScore(items[i]);
    if (score > heap[0].score) {
      heap[0] = { item: items[i], score };
      siftDown(heap, 0, count);
    }
  }

  return heap.map(h => h.item);
}

function siftDown(heap: { score: number }[], startIdx: number, size: number): void {
  let idx = startIdx;
  while (true) {
    let smallest = idx;
    const left = 2 * idx + 1;
    const right = 2 * idx + 2;
    if (left < size && heap[left].score < heap[smallest].score) smallest = left;
    if (right < size && heap[right].score < heap[smallest].score) smallest = right;
    if (smallest === idx) break;
    const tmp = heap[idx];
    heap[idx] = heap[smallest];
    heap[smallest] = tmp;
    idx = smallest;
  }
}

/**
 * Threshold for when to simplify the graph automatically
 */
export const SIMPLIFICATION_THRESHOLD = 1000;

/**
 * Maximum number of nodes to show when simplifying
 * Can be adjusted based on graph size
 */
export const SIMPLIFIED_NODE_LIMIT = 500;

/**
 * For extreme graphs (>10000 nodes), use even more aggressive simplification
 */
export const EXTREME_SIMPLIFICATION_THRESHOLD = 10000;
export const EXTREME_SIMPLIFIED_NODE_LIMIT = 300;

/**
 * Simplifies a large graph by keeping only the most important nodes.
 *
 * For graphs larger than the threshold, reduces the node count to keep
 * layout computation tractable and prevent the browser from becoming
 * unresponsive. Auto-adjusts simplification level based on graph size:
 * - nodes.length <= maxNodes: no simplification needed
 * - nodes.length > maxNodes: reduce to maxNodes most important nodes
 * - GraphView uses SIMPLIFICATION_THRESHOLD (1000) to decide when to enable,
 *   then passes maxNodes=500 (or 300 for extreme graphs >10000)
 *
 * Importance is based on:
 * - Node weight (higher weight = more important)
 * - Number of connections (more connected = more important, +5 points per edge)
 * - Nodes with errors/warnings (always kept, +10000 priority boost via getStatus() check)
 * - Group size (larger groups = more important, +2 per child node)
 *
 * @param nodes - List of all nodes
 * @param edges - List of all edges
 * @param options - Simplification options
 * @returns Simplified graph with important nodes and their edges
 */
export function simplifyGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: {
    maxNodes?: number;
    enabled?: boolean;
  } = {}
): { nodes: GraphNode[]; edges: GraphEdge[]; simplified: boolean } {
  // Auto-adjust maxNodes for extreme graphs to keep ELK layout performant and tractable
  const defaultMaxNodes =
    nodes.length > EXTREME_SIMPLIFICATION_THRESHOLD
      ? EXTREME_SIMPLIFIED_NODE_LIMIT
      : SIMPLIFIED_NODE_LIMIT;

  const { maxNodes = defaultMaxNodes, enabled = true } = options;

  // Don't simplify if disabled or graph is small enough
  if (!enabled || nodes.length <= maxNodes) {
    return { nodes, edges, simplified: false };
  }

  const perfStart = performance.now();

  const lookup = makeGraphLookup(nodes, edges);

  // Score each node based on importance
  const nodeScores = new Map<string, number>();

  nodes.forEach(node => {
    let score = getNodeWeight(node);

    // Boost score based on number of connections
    const outgoingEdges = lookup.getOutgoingEdges(node.id)?.length ?? 0;
    const incomingEdges = lookup.getIncomingEdges(node.id)?.length ?? 0;
    score += (outgoingEdges + incomingEdges) * 5;

    // PERFORMANCE: Always keep nodes with errors/warnings using canonical status logic
    // This ensures simplification preserves the same error/warning resources the UI shows
    // Uses getStatus() helper to match app's status logic (Deployments, Pods, etc.)
    if (node.kubeObject) {
      const status = getStatus(node.kubeObject);
      if (status !== 'success') {
        score += 10000; // High priority for error/warning nodes
      }
    }

    // Boost score for group nodes
    if (node.nodes && node.nodes.length > 0) {
      score += node.nodes.length * 2;
    }

    nodeScores.set(node.id, score);
  });

  // Select the top N nodes by score using a min-heap.
  // This is O(n log k) where k = maxNodes, instead of O(n log n) for a full sort.
  // At 20k nodes with k=300, this is ~20k × 8 ≈ 160k comparisons vs ~20k × 14 ≈ 280k.
  const topNodes = selectTopN(nodes, maxNodes, node => nodeScores.get(node.id) ?? 0);
  const topNodeIds = new Set(topNodes.map(n => n.id));

  // Keep only edges where both source and target are in topNodes
  const simplifiedEdges = edges.filter(
    edge => topNodeIds.has(edge.source) && topNodeIds.has(edge.target)
  );

  const totalTime = performance.now() - perfStart;

  // Only log to console if debug flag is set
  if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
    console.log(
      `[ResourceMap Performance] simplifyGraph: ${totalTime.toFixed(2)}ms (nodes: ${
        nodes.length
      } -> ${topNodes.length}, edges: ${edges.length} -> ${simplifiedEdges.length})`
    );
  }

  addPerformanceMetric({
    operation: 'simplifyGraph',
    duration: totalTime,
    timestamp: Date.now(),
    details: {
      nodesIn: nodes.length,
      nodesOut: topNodes.length,
      edgesIn: edges.length,
      edgesOut: simplifiedEdges.length,
      maxNodes,
    },
  });

  return { nodes: topNodes, edges: simplifiedEdges, simplified: true };
}
