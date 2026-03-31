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

import { Edge, EdgeMarker, Node } from '@xyflow/react';
import { ElkExtendedEdge, ElkNode } from 'elkjs';
import ELK, { type ELK as ELKInterface } from 'elkjs/lib/elk-api';
import elkWorker from 'elkjs/lib/elk-worker.min.js?url';
import { addPerformanceMetric } from '../PerformanceStats';
import { forEachNode, getNodeWeight, GraphNode } from './graphModel';

type ElkNodeWithData = Omit<ElkNode, 'edges'> & {
  type: string;
  data: any;
  edges?: ElkEdgeWithData[];
};

type ElkEdgeWithData = ElkExtendedEdge & {
  type: string;
  data: any;
};

/**
 * PERFORMANCE: Time-based cache for expensive ELK layout results (60s TTL, 10 entry limit)
 * - Eviction policy: Oldest insertion time (not LRU - timestamps not updated on hits)
 * - ELK layout is the most expensive operation in the Resource Map pipeline
 * - Cache hit avoids re-running ELK entirely
 */
const layoutCache = new Map<
  string,
  { result: { nodes: Node[]; edges: Edge[] }; timestamp: number }
>();
const MAX_CACHE_SIZE = 10;
const CACHE_TTL = 60000; // 1 minute

/**
 * Simple string hash (djb2 variant) — O(len) time, O(1) memory.
 * Produces a 32-bit integer hash suitable for cache key differentiation.
 */
/** @internal Exported for testing */
export function hashString(str: string, seed: number = 5381): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // hash * 33 + char
  }
  return hash;
}

/**
 * Generate a cache key for the graph
 *
 * Uses a running hash over ALL nodes/edges in a single O(n) pass.
 * - Hashes every node ID and every edge (source→target) during forEachNode traversal
 * - O(n) time proportional to total string length, O(1) extra memory
 * - No arrays, no sorting, no sampling — processes the full graph
 */
/** @internal Exported for testing */
export function getGraphCacheKey(graph: GraphNode, aspectRatio: number): string {
  let nodeCount = 0;
  let edgeCount = 0;
  let nodeHash = 5381;
  let edgeHash = 5381;

  forEachNode(graph, node => {
    nodeCount++;
    nodeHash = hashString(node.id, nodeHash);

    if (node.edges && node.edges.length > 0) {
      edgeCount += node.edges.length;
      for (const edge of node.edges) {
        edgeHash = hashString(edge.source, edgeHash);
        edgeHash = hashString(edge.target, edgeHash);
      }
    }
  });

  // Include aspect ratio at full precision since ELK layout depends on exact value
  return `${nodeCount}-${edgeCount}-${nodeHash}-${edgeHash}-${aspectRatio}`;
}

/**
 * Clean up old cache entries
 *
 * Two-phase cleanup to maintain cache size limit correctly.
 * - Phase 1: Remove expired entries (>60s old)
 * - Phase 2: Re-query remaining entries and evict oldest if still over limit
 * - Why re-query: Prevents evicting already-deleted keys (would leave cache over limit)
 */
function cleanLayoutCache() {
  const now = Date.now();

  // Phase 1: Remove expired entries
  Array.from(layoutCache.entries()).forEach(([key, value]) => {
    if (now - value.timestamp > CACHE_TTL) {
      layoutCache.delete(key);
    }
  });

  // Phase 2: If still too large, remove oldest entries
  // PERFORMANCE: Re-query entries after expiry cleanup to ensure correct eviction
  if (layoutCache.size > MAX_CACHE_SIZE) {
    const currentEntries = Array.from(layoutCache.entries());
    const sortedEntries = currentEntries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sortedEntries.slice(0, layoutCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => layoutCache.delete(key));
  }
}

let elk: ELKInterface | undefined;
try {
  elk = new ELK({
    defaultLayoutOptions: {},
    workerUrl: elkWorker,
  });
} catch (e) {
  console.error('Failed to create ELK instance', e);
}

const layoutOptions = {
  nodeSize: {
    width: 220,
    height: 70,
  },
};

/**
 * Determines the partition layer for a graph node based on its weight.
 *
 * @param node The graph node to determine the partition layer for
 * @returns The ELK partition number (lower number is placed further left in layout, higher number is placed further right in layout)
 */
function getPartitionLayer(node: GraphNode): number {
  return -getNodeWeight(node);
}

/**
 * Prepare the node for the layout by converting it to the ELK node
 *
 * @param node - node
 * @param aspectRatio - aspect ratio of the container
 */
function convertToElkNode(node: GraphNode, aspectRatio: number): ElkNodeWithData {
  const isCollapsed = node.collapsed;

  const convertedEdges = node.edges
    ? (() => {
        if (node.edges.length === 0) return [];

        // Collect all node IDs in a Set for O(1) lookup
        const nodeIds = new Set<string>();
        forEachNode(node, n => nodeIds.add(n.id));

        return (
          node.edges
            // Make sure source and target exists
            .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
            .map(edge => ({
              type: 'edge',
              id: edge.id,
              sources: [edge.source],
              targets: [edge.target],
              label: edge.label,
              labels: [{ text: edge.label, width: 70, height: 20 }],
              hidden: false,
              data: edge.data,
            }))
            .filter(Boolean) as ElkEdgeWithData[]
        );
      })()
    : [];

  const elkNode: ElkNodeWithData = {
    id: node.id,
    type: 'object',
    data: node.data,
  };

  if (node.nodes) {
    if (node.collapsed) {
      elkNode.edges = undefined;
      elkNode.children = undefined;
      elkNode.width = layoutOptions.nodeSize.width;
      elkNode.height = layoutOptions.nodeSize.height;
      return elkNode;
    }

    elkNode.layoutOptions =
      convertedEdges.length > 0
        ? {
            'partitioning.activate': 'true',
            'elk.direction': 'UNDEFINED', // ELK will automatically pick direction
            'elk.edgeRouting': 'SPLINES',
            'elk.nodeSize.minimum': '(220.0,70.0)',
            'elk.nodeSize.constraints': '[MINIMUM_SIZE]',
            'elk.algorithm': 'layered',
            'elk.spacing.nodeNode': isCollapsed ? '1' : '60',
            'elk.layered.spacing.nodeNodeBetweenLayers': '60',
            'org.eclipse.elk.stress.desiredEdgeLength': isCollapsed ? '20' : '250',
            'org.eclipse.elk.stress.epsilon': '0.1',
            'elk.padding': '[left=16, top=16, right=16, bottom=16]',
          }
        : {
            // 'elk.aspectRatio': String(aspectRatio),
            'elk.algorithm': 'rectpacking',
            'elk.rectpacking.widthApproximation.optimizationGoal': 'ASPECT_RATIO_DRIVEN',
            'elk.rectpacking.packing.compaction.rowHeightReevaluation': 'true',
            'elk.edgeRouting': 'SPLINES',
            'elk.spacing.nodeNode': '20',
            'elk.padding': '[left=24, top=48, right=24, bottom=24]',
          };
    elkNode.edges = convertedEdges;
    elkNode.children =
      'collapsed' in node && node.collapsed
        ? []
        : node.nodes.map(node => convertToElkNode(node, aspectRatio));

    elkNode.width = layoutOptions.nodeSize.width;
    elkNode.height = layoutOptions.nodeSize.height;
    return elkNode;
  }

  elkNode.layoutOptions = {
    'partitioning.partition': String(getPartitionLayer(node)),
  };
  elkNode.width = layoutOptions.nodeSize.width;
  elkNode.height = layoutOptions.nodeSize.height;
  return elkNode;
}

/**
 * Convert ELK graph back to react-flow graph
 */
function convertToReactFlowGraph(elkGraph: ElkNodeWithData) {
  const edges: Edge[] = [];
  const nodes: Node[] = [];

  const pushEdges = (node: ElkNodeWithData, parent?: ElkNodeWithData) => {
    node.edges?.forEach(edge => {
      edges.push({
        id: edge.id,
        source: edge.sources[0],
        target: edge.targets[0],
        type: edge.type ?? 'customEdge',
        selectable: false,
        focusable: false,
        hidden: false,
        markerEnd: {
          type: 'arrowclosed',
        } as EdgeMarker,
        data: {
          data: edge.data,
          sections: edge.sections,
          // @ts-ignore
          label: edge?.label,
          labels: edge.labels,
          parentOffset: {
            x: (node?.x ?? 0) + (parent?.x ?? 0),
            y: (node?.y ?? 0) + (parent?.y ?? 0),
          },
        },
      });
    });
  };

  const pushNode = (node: ElkNodeWithData, parent?: ElkNodeWithData) => {
    nodes.push({
      id: node.id,
      type: node.type,
      style: {
        width: node.width,
        height: node.height,
      },
      hidden: false,
      selectable: true,
      draggable: false,
      width: node.width,
      height: node.height,
      position: { x: node.x!, y: node.y! },
      data: node.data,
      parentId: parent?.id ?? undefined,
    });
  };

  const convertElkNode = (node: ElkNodeWithData, parent?: ElkNodeWithData) => {
    pushNode(node, parent);
    pushEdges(node, parent);

    node.children?.forEach(it => {
      convertElkNode(it as ElkNodeWithData, node);
    });
  };

  pushEdges(elkGraph);
  elkGraph.children!.forEach(node => {
    convertElkNode(node as ElkNodeWithData);
  });

  return { nodes, edges };
}

/**
 * Takes a graph and returns a graph with layout applied
 * Layout will set size and position for all the elements
 * Results are cached to avoid re-computing expensive layouts
 *
 * @param graph - root node of the graph
 * @param aspectRatio - aspect ratio of the container
 * @returns
 */
export const applyGraphLayout = (graph: GraphNode, aspectRatio: number) => {
  // Guard against missing ELK instance early
  if (!elk) return Promise.resolve({ nodes: [], edges: [] });

  // Check cache first
  const cacheKey = getGraphCacheKey(graph, aspectRatio);
  const cached = layoutCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    // Only log cache hit if debug flag is set
    if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
      console.log(`[ResourceMap Performance] applyGraphLayout: CACHE HIT (key: ${cacheKey})`);
    }

    addPerformanceMetric({
      operation: 'applyGraphLayout',
      duration: 0,
      timestamp: Date.now(),
      details: {
        cacheHit: true,
        cacheKey: cacheKey.substring(0, 50),
        resultNodes: cached.result.nodes.length,
        resultEdges: cached.result.edges.length,
      },
    });

    // Return cached result by reference.
    // If downstream code mutates the node/edge objects, those mutations would be
    // visible to other callers that receive the same cached result within the TTL window.
    // In practice, the only consumer is setLayoutedGraph() which stores it in React state,
    // and the useEffect that calls this only fires when [visibleGraph, viewport] changes.
    return Promise.resolve(cached.result);
  }

  const perfStart = performance.now();

  const conversionStart = performance.now();
  const elkGraph = convertToElkNode(graph, aspectRatio);
  const conversionTime = performance.now() - conversionStart;

  // Count nodes for performance logging
  let nodeCount = 0;
  forEachNode(graph, () => nodeCount++);

  const layoutStart = performance.now();
  return elk
    .layout(elkGraph, {
      layoutOptions: {
        'elk.aspectRatio': String(aspectRatio),
      },
    })
    .then(elkGraph => {
      const layoutTime = performance.now() - layoutStart;

      const conversionBackStart = performance.now();
      const result = convertToReactFlowGraph(elkGraph as ElkNodeWithData);
      const conversionBackTime = performance.now() - conversionBackStart;

      const totalTime = performance.now() - perfStart;

      // Only log to console if debug flag is set
      if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
        console.log(
          `[ResourceMap Performance] applyGraphLayout: ${totalTime.toFixed(
            2
          )}ms (conversion: ${conversionTime.toFixed(2)}ms, ELK layout: ${layoutTime.toFixed(
            2
          )}ms, conversion back: ${conversionBackTime.toFixed(2)}ms, nodes: ${nodeCount})`
        );
      }

      addPerformanceMetric({
        operation: 'applyGraphLayout',
        duration: totalTime,
        timestamp: Date.now(),
        details: {
          conversionMs: conversionTime.toFixed(1),
          elkLayoutMs: layoutTime.toFixed(1),
          conversionBackMs: conversionBackTime.toFixed(1),
          nodes: nodeCount,
          resultNodes: result.nodes.length,
          resultEdges: result.edges.length,
          cacheHit: false,
          cacheKey: cacheKey.substring(0, 50),
        },
      });

      // Store in cache
      layoutCache.set(cacheKey, { result, timestamp: Date.now() });
      cleanLayoutCache();

      return result;
    });
};
