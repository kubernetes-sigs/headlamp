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

import { getGraphNodeStatus } from '../nodes/KubeObjectStatus';
import { addPerformanceMetric } from '../PerformanceStats';
import { makeGraphLookup } from './graphLookup';
import { GraphEdge, GraphNode } from './graphModel';

export type GraphFilter =
  | {
      type: 'hasErrors';
    }
  | {
      type: 'namespace';
      namespaces: Set<string>;
    };

/**
 * Check if a node matches all of the provided filters (AND logic).
 * Returns true if the node matches every filter, or if no filters are provided.
 * This is the single source of truth for filter matching used by both
 * filterGraph and filterGraphIncremental.
 */
export function matchesAllFilters(node: GraphNode, filters: GraphFilter[]): boolean {
  return filters.every(filter => {
    if (filter.type === 'hasErrors') {
      return getGraphNodeStatus(node) !== 'success';
    }
    if (filter.type === 'namespace' && filter.namespaces.size > 0) {
      const namespace = node.kubeObject?.metadata?.namespace;
      return !!namespace && filter.namespaces.has(namespace);
    }
    return true;
  });
}

/**
 * Filters the graph nodes and edges based on the provided filters
 * The filters are applied using AND logic, meaning node must match all active filters
 *
 * Along with the matched node result also includes all the nodes that are related to it,
 * even if they don't match the filter
 *
 * Important:
 * First discover every node that should remain visible, including related nodes.
 * Then keep every original edge whose source and target are both still visible.
 *
 * This avoids losing valid non-tree edges during DFS traversal.
 * The filters can be of the following types:
 * - `hasErrors`: Filters nodes that have a warning or error status based on their graph node status.
 * - `namespace`: Filters nodes by their namespace
 *
 * @param nodes - List of all the nodes in the graph
 * @param edges - List of all the edges in the graph
 * @param filters - List of fitlers to apply
 */
export function filterGraph(nodes: GraphNode[], edges: GraphEdge[], filters: GraphFilter[]) {
  if (filters.length === 0) {
    return { nodes, edges };
  }

  const perfStart = performance.now();
  const lookupStart = performance.now();
  const graphLookup = makeGraphLookup(nodes, edges);
  const lookupTime = performance.now() - lookupStart;
  const visibleNodeIds = new Set<string>();

  /**
   * Add all the nodes that are related to the given node using iterative approach
   * Related means connected by an edge
   *
   * Uses index-based queue instead of shift() for O(1) dequeue (shift is O(n)).
   * Uses iterative BFS instead of recursive DFS to avoid stack overflow on deep graphs.
   *
   * @param node - Given node
   */
  function pushRelatedNodes(startNode: GraphNode) {
    // Skip if already visited by a previous pushRelatedNodes call
    if (visibleNodeIds.has(startNode.id)) return;

    const queue: GraphNode[] = [startNode];
    // PERFORMANCE: Mark visited on enqueue to prevent duplicate queue entries in dense graphs.
    // Without this, the same node can be enqueued O(degree) times before being dequeued,
    // causing worst-case queue growth much larger than O(nodes+edges).
    visibleNodeIds.add(startNode.id);
    // PERFORMANCE: Index-based queue for O(1) dequeue instead of O(n) shift()
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const node = queue[queueIndex++]; // O(1) vs shift() which is O(n)

      // Process outgoing edges
      const outgoing = graphLookup.getOutgoingEdges(node.id);
      if (outgoing) {
        for (const edge of outgoing) {
          const targetNode = graphLookup.getNode(edge.target);
          if (targetNode) {
            if (!visibleNodeIds.has(edge.target)) {
              visibleNodeIds.add(edge.target);
              queue.push(targetNode);
            }
          }
        }
      }

      // Process incoming edges
      const incoming = graphLookup.getIncomingEdges(node.id);
      if (incoming) {
        for (const edge of incoming) {
          const sourceNode = graphLookup.getNode(edge.source);
          if (sourceNode) {
            if (!visibleNodeIds.has(edge.source)) {
              visibleNodeIds.add(edge.source);
              queue.push(sourceNode);
            }
          }
        }
      }
    }
  }

  const filterStart = performance.now();
  nodes.forEach(node => {
    if (matchesAllFilters(node, filters)) {
      pushRelatedNodes(node);
    }
  });
  const filterTime = performance.now() - filterStart;

  const filteredNodes = nodes.filter(node => visibleNodeIds.has(node.id));

  const filteredEdges = edges.filter(
    edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  const totalTime = performance.now() - perfStart;

  if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
    console.log(
      `[ResourceMap Performance] filterGraph: ${totalTime.toFixed(
        2
      )}ms (lookup: ${lookupTime.toFixed(2)}ms, filter: ${filterTime.toFixed(2)}ms, nodes: ${
        nodes.length
      } -> ${filteredNodes.length}, edges: ${edges.length} -> ${filteredEdges.length})`
    );
  }

  addPerformanceMetric({
    operation: 'filterGraph',
    duration: totalTime,
    timestamp: Date.now(),
    details: {
      lookupMs: lookupTime.toFixed(1),
      filterMs: filterTime.toFixed(1),
      nodesIn: nodes.length,
      nodesOut: filteredNodes.length,
      edgesIn: edges.length,
      edgesOut: filteredEdges.length,
    },
  });

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

/**
 * Incremental filter update — only processes changed nodes.
 *
 * How it works:
 * - Starts with previous filtered results
 * - Falls back to full filtering when nodes were deleted because the previous
 *   related-node closure may need to shrink
 * - Processes only added/modified nodes through filters
 * - Adds related nodes via BFS (same as full filter)
 * - Falls back to full filterGraph when a previously-matching node stops matching
 *   (because related nodes from the old closure may no longer be needed)
 * - Result: Same correctness as full filter, faster for small changes
 *
 * @param prevFilteredNodes - Previously filtered nodes
 * @param prevFilteredEdges - Unused: edges are rebuilt from scratch for correctness
 * @param addedNodeIds - IDs of added nodes
 * @param modifiedNodeIds - IDs of modified nodes
 * @param deletedNodeIds - IDs of deleted nodes
 * @param currentNodes - All current nodes
 * @param currentEdges - All current edges
 * @param filters - Filters to apply
 * @returns Incrementally updated filtered graph
 */
export function filterGraphIncremental(
  prevFilteredNodes: GraphNode[],
  _prevFilteredEdges: GraphEdge[], // Unused: edges rebuilt from scratch for correctness
  addedNodeIds: Set<string>,
  modifiedNodeIds: Set<string>,
  deletedNodeIds: Set<string>,
  currentNodes: GraphNode[],
  currentEdges: GraphEdge[],
  filters: GraphFilter[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const perfStart = performance.now();

  // Incremental updates can safely expand the previous related-node closure,
  // but deleting a matching node may require removing nodes that were included
  // only because they were related to it.
  if (deletedNodeIds.size > 0) {
    return filterGraph(currentNodes, currentEdges, filters);
  }

  // Build lookups for fast access
  const prevFilteredNodeIds = new Set(prevFilteredNodes.map(n => n.id));
  const currentNodeMap = new Map(currentNodes.map(n => [n.id, n]));

  // Check if any previously-filtered modified node no longer matches filters.
  // If so, fall back to full filtering since related nodes from the previous
  // closure may no longer be needed but we can't easily determine which ones.
  for (const id of modifiedNodeIds) {
    if (!prevFilteredNodeIds.has(id)) continue;
    const node = currentNodeMap.get(id);
    if (!node) continue;

    const stillMatches = matchesAllFilters(node, filters);

    if (!stillMatches) {
      // Fall back to full filtering for correctness
      return filterGraph(currentNodes, currentEdges, filters);
    }
  }

  // Start with previous filtered nodes
  const filteredNodeIds = new Set(prevFilteredNodeIds);

  // Process added and modified nodes through filters
  const nodesToCheck = [...addedNodeIds, ...modifiedNodeIds];
  const lookup = makeGraphLookup(currentNodes, currentEdges);

  for (const nodeId of nodesToCheck) {
    const node = currentNodeMap.get(nodeId);
    if (!node) continue;

    // Check if node matches all filters (uses shared predicate for consistency with filterGraph)
    const matchesFilter = matchesAllFilters(node, filters);

    if (matchesFilter) {
      // Add node and all related nodes (iterative BFS - same as full filter)
      const queue = [nodeId];
      let queueIndex = 0;
      // PERFORMANCE: Mark visited on enqueue to prevent duplicate queue entries in dense graphs.
      // Without this, the same node can be enqueued O(max_degree) times before being dequeued,
      // causing queue size to grow to O(nodes × max_degree) instead of O(nodes+edges).
      const visited = new Set<string>([nodeId]);

      while (queueIndex < queue.length) {
        const currentId = queue[queueIndex++]!;

        filteredNodeIds.add(currentId);

        // Add parents and children
        const incomingEdges = lookup.getIncomingEdges(currentId) || [];
        const outgoingEdges = lookup.getOutgoingEdges(currentId) || [];

        for (const edge of incomingEdges) {
          const relatedId = edge.source === currentId ? edge.target : edge.source;
          if (!visited.has(relatedId) && currentNodeMap.has(relatedId)) {
            visited.add(relatedId);
            queue.push(relatedId);
          }
        }

        for (const edge of outgoingEdges) {
          const relatedId = edge.source === currentId ? edge.target : edge.source;
          if (!visited.has(relatedId) && currentNodeMap.has(relatedId)) {
            visited.add(relatedId);
            queue.push(relatedId);
          }
        }
      }
    }
  }

  // Build final nodes array
  const resultNodes = currentNodes.filter(node => filteredNodeIds.has(node.id));

  // Filter edges - keep only edges between filtered nodes
  const resultEdges: GraphEdge[] = [];
  for (const edge of currentEdges) {
    if (filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)) {
      resultEdges.push(edge);
    }
  }

  const totalTime = performance.now() - perfStart;

  if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
    const changeRatio =
      currentNodes.length > 0
        ? ((nodesToCheck.length / currentNodes.length) * 100).toFixed(0)
        : '0';
    console.log(
      `[ResourceMap Performance] filterGraphIncremental: ${totalTime.toFixed(2)}ms ` +
        `(processed ${nodesToCheck.length}/${currentNodes.length} nodes = ${changeRatio}% changed, ` +
        `result: ${resultNodes.length} nodes)`
    );
  }

  addPerformanceMetric({
    operation: 'filterGraphIncremental',
    duration: totalTime,
    timestamp: Date.now(),
    details: {
      changedNodes: nodesToCheck.length,
      totalNodes: currentNodes.length,
      resultNodes: resultNodes.length,
    },
  });

  return { nodes: resultNodes, edges: resultEdges };
}
