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

  const graphLookup = makeGraphLookup(nodes, edges);
  const visibleNodeIds = new Set<string>();

  function nodeMatchesFilters(node: GraphNode): boolean {
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

  function addRelatedNode(node: GraphNode) {
    if (visibleNodeIds.has(node.id)) return;

    visibleNodeIds.add(node.id);

    graphLookup.getOutgoingEdges(node.id)?.forEach(edge => {
      const target = graphLookup.getNode(edge.target);
      if (target) {
        addRelatedNode(target);
      }
    });

    graphLookup.getIncomingEdges(node.id)?.forEach(edge => {
      const source = graphLookup.getNode(edge.source);
      if (source) {
        addRelatedNode(source);
      }
    });
  }

  nodes.forEach(node => {
    if (nodeMatchesFilters(node)) {
      addRelatedNode(node);
    }
  });

  const filteredNodes = nodes.filter(node => visibleNodeIds.has(node.id));

  const filteredEdges = edges.filter(
    edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}
