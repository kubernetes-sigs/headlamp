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

import { GraphEdge, GraphNode } from './graphModel';

/**
 * Constant time lookup of graph elements
 */
export interface GraphLookup<N, E> {
  /** Get list of outgoing edges from the given node */
  getOutgoingEdges(nodeId: string): E[] | undefined;
  /** Get list of incoming edges to the given node */
  getIncomingEdges(nodeId: string): E[] | undefined;
  /** Get Node by its' ID */
  getNode(nodeId: string): N | undefined;
}

/**
 * Creates a utility for constant time lookup of graph elements
 *
 * @param nodes - list of graph Nodes
 * @param edges - list of graph Edges
 * @returns lookup {@link GraphLookup}
 */
export function makeGraphLookup<N extends GraphNode, E extends GraphEdge>(
  nodes: N[],
  edges: E[]
): GraphLookup<N, E> {
  const nodeMap = new Map<string, N>();
  nodes.forEach(n => {
    nodeMap.set(n.id, n);
  });

  // Create map for incoming and outgoing edges where key is node ID
  const outgoingEdges = new Map<string, E[]>();
  const incomingEdges = new Map<string, E[]>();

  edges.forEach(edge => {
    const s = outgoingEdges.get(edge.source) ?? [];
    s.push(edge);
    outgoingEdges.set(edge.source, s);

    const t = incomingEdges.get(edge.target) ?? [];
    t.push(edge);
    incomingEdges.set(edge.target, t);
  });

  return {
    getOutgoingEdges(nodeId) {
      return outgoingEdges.get(nodeId);
    },
    getIncomingEdges(nodeId) {
      return incomingEdges.get(nodeId);
    },
    getNode(nodeId) {
      return nodeMap.get(nodeId);
    },
  };
}
