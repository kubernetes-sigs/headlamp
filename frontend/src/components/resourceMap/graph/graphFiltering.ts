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
 * Filters the graph nodes and edges based on the provided filters
 * The filters are applied using an OR logic, meaning node will be included if it matches any of the filters
 *
 * Along with the matched node result also includes all the nodes that are related to it,
 * even if they don't match the filter
 *
 * The filters can be of the following types:
 * - `hasErrors`: Filters nodes that have errors based on their resource status. See {@link getStatus}
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

  const filteredNodes: GraphNode[] = [];
  const filteredEdges: GraphEdge[] = [];

  const visitedNodes = new Set();
  const visitedEdges = new Set();

  const graphLookup = makeGraphLookup(nodes, edges);

  /**
   * Add all the nodes that are related to the given node
   * Related means connected by an edge
   * @param node - Given node
   */
  function pushRelatedNodes(node: GraphNode) {
    if (visitedNodes.has(node.id)) return;
    visitedNodes.add(node.id);
    filteredNodes.push(node);

    graphLookup.getOutgoingEdges(node.id)?.forEach(edge => {
      const targetNode = graphLookup.getNode(edge.target);
      if (targetNode && !visitedNodes.has(targetNode.id)) {
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.add(edge.id);
          filteredEdges.push(edge);
        }
        pushRelatedNodes(targetNode);
      }
    });

    graphLookup.getIncomingEdges(node.id)?.forEach(edge => {
      const sourceNode = graphLookup.getNode(edge.source);
      if (sourceNode && !visitedNodes.has(sourceNode.id)) {
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.add(edge.id);
          filteredEdges.push(edge);
        }
        pushRelatedNodes(sourceNode);
      }
    });
  }

  nodes.forEach(node => {
    let keep = true;

    filters.forEach(filter => {
      if (filter.type === 'hasErrors') {
        keep &&=
          'kubeObject' in node &&
          node.kubeObject !== undefined &&
          getStatus(node.kubeObject) !== 'success';
      }
      if (filter.type === 'namespace' && filter.namespaces.size > 0) {
        keep &&=
          'kubeObject' in node &&
          node.kubeObject !== undefined &&
          !!node.kubeObject.metadata?.namespace &&
          filter.namespaces.has(node.kubeObject?.metadata?.namespace);
      }
    });

    if (keep) {
      pushRelatedNodes(node);
    }
  });

  return {
    edges: filteredEdges,
    nodes: filteredNodes,
  };
}
