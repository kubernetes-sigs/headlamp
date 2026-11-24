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
import { isShareableNode } from './graphGrouping';
import { makeGraphLookup } from './graphLookup';
import { GraphEdge, GraphNode } from './graphModel';

export type GraphFilter =
  | {
      type: 'hasErrors';
    }
  | {
      type: 'namespace';
      namespaces: Set<string>;
    }
  | {
      type: 'namespaceCluster';
      namespaceRefs: Set<string>;
    };

/**
 * Creates a stable key for a Kubernetes namespace within one cluster.
 *
 * @param cluster - Headlamp cluster name.
 * @param namespace - Kubernetes namespace name.
 * @returns A key suitable for a namespace-cluster filter set.
 */
export function namespaceClusterKey(cluster: string, namespace: string): string {
  return JSON.stringify([cluster, namespace]);
}

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
    if (filter.type === 'namespaceCluster' && filter.namespaceRefs.size > 0) {
      const namespace = node.kubeObject?.metadata?.namespace;
      const cluster = node.kubeObject?.cluster;
      return (
        !!namespace &&
        !!cluster &&
        filter.namespaceRefs.has(namespaceClusterKey(cluster, namespace))
      );
    }
    return true;
  });
}

/**
 * Adds a node and the nodes related to it, connected by edges in either direction, to
 * `visibleNodeIds`.
 *
 * A shared resource, such as a DeviceClass or a ResourceClaimTemplate (see
 * {@link isShareableNode}), is kept beside the nodes it is related to, but the search doesn't
 * go on from it to the other nodes that share it, which may be in another project or be
 * healthy. From a shared resource it only follows edges that name both ends as shared, so a
 * template still brings the DeviceClass it asks for.
 *
 * Uses an index-based queue instead of shift() for O(1) dequeue, and iterative BFS instead of
 * recursive DFS to avoid stack overflow on deep graphs.
 *
 * @param startId - The node to start from
 * @param graphLookup - Lookup structure built over the graph
 * @param visibleNodeIds - Receives the start node and the nodes related to it
 * @param expandedNodeIds - Nodes whose relations were all followed already, shared between
 * calls so no node is expanded twice
 * @param shareableCache - Remembers which nodes are shared resources, shared between calls
 */
function addRelatedNodes(
  startId: string,
  graphLookup: ReturnType<typeof makeGraphLookup>,
  visibleNodeIds: Set<string>,
  expandedNodeIds: Set<string>,
  shareableCache: Map<string, boolean>
) {
  if (expandedNodeIds.has(startId)) return;

  const isShareable = (nodeId: string) => {
    let shareable = shareableCache.get(nodeId);
    if (shareable === undefined) {
      shareable = isShareableNode(nodeId, graphLookup);
      shareableCache.set(nodeId, shareable);
    }
    return shareable;
  };

  // Each entry is a node and whether it was reached as a shared resource.
  const queue: Array<[string, boolean]> = [[startId, false]];
  const reachedAsShared = new Set<string>();
  expandedNodeIds.add(startId);
  visibleNodeIds.add(startId);
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const [nodeId, isShared] = queue[queueIndex++];
    const edges = isShared
      ? (graphLookup.getOutgoingEdges(nodeId) ?? []).filter(edge => edge.nonGroupingSide === 'both')
      : [
          ...(graphLookup.getOutgoingEdges(nodeId) ?? []),
          ...(graphLookup.getIncomingEdges(nodeId) ?? []),
        ];

    for (const edge of edges) {
      const relatedId = edge.source === nodeId ? edge.target : edge.source;
      if (!graphLookup.getNode(relatedId)) continue;

      visibleNodeIds.add(relatedId);
      if (isShareable(relatedId)) {
        if (!expandedNodeIds.has(relatedId) && !reachedAsShared.has(relatedId)) {
          reachedAsShared.add(relatedId);
          queue.push([relatedId, true]);
        }
      } else if (!expandedNodeIds.has(relatedId)) {
        expandedNodeIds.add(relatedId);
        queue.push([relatedId, false]);
      }
    }
  }
}

/**
 * Filters the graph nodes and edges based on the provided filters
 * The filters are applied using AND logic, meaning node must match all active filters
 *
 * Along with the matched node result also includes all the nodes that are related to it,
 * even if they don't match the filter, without going through shared resources (see
 * {@link addRelatedNodes})
 *
 * Important:
 * First discover every node that should remain visible, including related nodes.
 * Then keep every original edge whose source and target are both still visible.
 *
 * This avoids losing valid non-tree edges during DFS traversal.
 * The filters can be of the following types:
 * - `hasErrors`: Filters nodes that have a warning or error status based on their graph node status.
 * - `namespace`: Filters nodes by their namespace
 * - `namespaceCluster`: Filters nodes by exact namespace and cluster pairs
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

  const expandedNodeIds = new Set<string>();
  const shareableCache = new Map<string, boolean>();

  const filterStart = performance.now();
  nodes.forEach(node => {
    if (matchesAllFilters(node, filters)) {
      addRelatedNodes(node.id, graphLookup, visibleNodeIds, expandedNodeIds, shareableCache);
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
  const expandedNodeIds = new Set<string>();
  const shareableCache = new Map<string, boolean>();

  for (const nodeId of nodesToCheck) {
    const node = currentNodeMap.get(nodeId);
    if (!node) continue;

    // Check if node matches all filters (uses shared predicate for consistency with filterGraph)
    const matchesFilter = matchesAllFilters(node, filters);

    if (matchesFilter) {
      // Add node and all related nodes (same as full filter)
      addRelatedNodes(nodeId, lookup, filteredNodeIds, expandedNodeIds, shareableCache);
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
