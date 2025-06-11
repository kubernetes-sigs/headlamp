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

import { groupBy } from 'lodash';
import Namespace from '../../../lib/k8s/namespace';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { makeGraphLookup } from './graphLookup';
import { forEachNode, getNodeWeight, GraphEdge, GraphNode } from './graphModel';

export type GroupBy = 'node' | 'namespace' | 'instance';

/**
 * Returns the amount of nodes in the graph
 */
export const getGraphSize = (graph: GraphNode) => {
  let size = 0;

  forEachNode(graph, () => {
    size++;
  });

  return size;
};

/**
 * Identifies and groups connected components from a set of nodes and edges.
 * Connected component is a subgraph where all nodes are connected to each other
 * but not to any other node in the graph. Essentialy a separate subgraph
 *
 * @param nodes - An array of `KubeObjectNode` representing the nodes in the graph
 * @param edges - An array of `GraphEdge` representing the edges in the graph
 * @returns An array of `GraphNode` where each element is either a single node
 *          or a group node containing multiple nodes and edges
 */
const getConnectedComponents = (nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] => {
  const components: GraphNode[] = [];

  const graphLookup = makeGraphLookup(nodes, edges);

  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();

  /**
   * Recursively finds all nodes in the connected component of a given node
   * This function performs a depth-first search (DFS) to traverse and collect all nodes
   * that are part of the same connected component as the provided node
   *
   * @param node - The starting node for the connected component search
   * @param componentNodes - An array to store the nodes that are part of the connected component
   */
  const findConnectedComponent = (
    node: GraphNode,
    componentNodes: GraphNode[],
    componentEdges: GraphEdge[]
  ) => {
    visitedNodes.add(node.id);
    componentNodes.push(node);

    // Outgoing edges
    graphLookup.getOutgoingEdges(node.id)?.forEach(edge => {
      // Always collect the edge if we haven't yet
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        componentEdges.push(edge);
      }

      // Only recurse further if we haven't visited the target node
      if (!visitedNodes.has(edge.target)) {
        const targetNode = graphLookup.getNode(edge.target);
        if (targetNode) {
          findConnectedComponent(targetNode, componentNodes, componentEdges);
        }
      }
    });

    // Incoming edges
    graphLookup.getIncomingEdges(node.id)?.forEach(edge => {
      // Always collect the edge if we haven't yet
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        componentEdges.push(edge);
      }

      // Only recurse further if we haven't visited the source node
      if (!visitedNodes.has(edge.source)) {
        const sourceNode = graphLookup.getNode(edge.source);
        if (sourceNode) {
          findConnectedComponent(sourceNode, componentNodes, componentEdges);
        }
      }
    });
  };

  // Iterate over each node and find connected components
  nodes.forEach(node => {
    if (!visitedNodes.has(node.id)) {
      const componentNodes: GraphNode[] = [];
      const componentEdges: GraphEdge[] = [];
      findConnectedComponent(node, componentNodes, componentEdges);
      const mainNode = getMainNode(componentNodes);

      const id = 'group-' + (mainNode?.id ?? 'unknown');
      components.push({
        id: id,
        nodes: componentNodes,
        edges: componentEdges,
      });
    }
  });

  return components.map(it => (it.nodes?.length === 1 ? it.nodes[0] : it));
};

/**
 * Try to find a "main" node in the group based on weight.
 * Higher weight nodes are considered more important.
 *
 * @param nodes - Array of nodes to find the main node from
 * @returns The node with the highest weight (most important), or undefined if array is empty
 */
export const getMainNode = (nodes: GraphNode[]): GraphNode | undefined => {
  if (nodes.length === 0) {
    return undefined;
  }

  if (nodes.length === 1) {
    return nodes[0];
  }

  // Find node with the highest weight
  let mainNode = nodes[0];
  let maxWeight = getNodeWeight(mainNode);

  for (let i = 1; i < nodes.length; i++) {
    const currentWeight = getNodeWeight(nodes[i]);
    if (currentWeight > maxWeight) {
      maxWeight = currentWeight;
      mainNode = nodes[i];
    }
  }

  return mainNode;
};

/**
 * Groups a list of nodes into 'group' type nodes
 * Groping property is determined by the accessor
 *
 * @param nodes - list of nodes
 * @param accessor - function returning which property to group by
 * @param param.label - label prefix for the group
 * @param param.allowSingleMemberGroup - won't create groups with single members if set to false
 * @returns List of created groups
 */
const groupByProperty = (
  nodes: GraphNode[],
  accessor: (n: GraphNode) => string | null | undefined,
  {
    label,
    allowSingleMemberGroup = false,
  }: {
    label: string;
    allowSingleMemberGroup?: boolean;
  }
) => {
  const groups = Object.entries(
    groupBy(nodes, node => {
      return accessor(node);
    })
  ).map(
    ([property, components]): GraphNode => ({
      id: label + '-' + property,
      nodes: components,
      edges: [],
      subtitle: label,
      label: property,
    })
  );

  const result = groups
    .flatMap(it => {
      const nonGroup = it.id.includes('undefined');
      const hasOneMember = it.nodes?.length === 1;

      return nonGroup || (hasOneMember && !allowSingleMemberGroup) ? it.nodes : [it];
    })
    .filter(Boolean) as GraphNode[];

  return result;
};

/**
 * Groups the graph into separate 'group' Nodes
 * Nodes within groups are sorted by weight and size
 *
 * @param nodes - List of nodes
 * @param edges - List of edge
 * @param params.groupBy - group by which property
 * @returns Graph, a single root node with groups as its' children
 */
export function groupGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  {
    groupBy,
    namespaces,
    k8sNodes,
  }: { groupBy?: GroupBy; namespaces: Namespace[]; k8sNodes: Node[] }
): GraphNode {
  const root: GraphNode = {
    id: 'root',
    label: 'root',
    nodes: [],
    edges: [],
  };

  let components: GraphNode[] = getConnectedComponents(nodes, edges);

  if (groupBy === 'namespace') {
    // Create groups based on the Kube resource namespace
    components = groupByProperty(
      components,
      component => {
        if (component.nodes) {
          return component.nodes.find(node => node.kubeObject)?.kubeObject?.metadata?.namespace;
        }
        return component.kubeObject?.metadata?.namespace;
      },
      { label: 'Namespace', allowSingleMemberGroup: true }
    );

    components.forEach(component => {
      if (!component.kubeObject) {
        component.kubeObject = namespaces.find(
          namespace => namespace.metadata.name === component.label
        );
        if (component.kubeObject) {
          component.id = component.kubeObject.metadata.uid;
        }
      }
    });
  }

  if (groupBy === 'node') {
    // Create groups based on the Kube resource node
    components = groupByProperty(
      components,
      component => {
        if (component.nodes) {
          return (component.nodes.find(node => node.kubeObject?.kind === 'Pod')?.kubeObject as Pod)
            ?.spec?.nodeName;
        }

        return (component.kubeObject as Pod)?.spec?.nodeName;
      },
      { label: 'Node', allowSingleMemberGroup: true }
    );

    components.forEach(component => {
      if (!component.kubeObject) {
        component.kubeObject = k8sNodes.find(
          namespace => namespace.metadata.name === component.label
        );
        if (component.kubeObject) {
          component.id = component.kubeObject.metadata.uid;
        }
      }
    });
  }

  if (groupBy === 'instance') {
    // Create groups based on the instance label from metadata (if it exists)
    components = groupByProperty(
      components,
      node => {
        if (node.nodes) {
          const mainNode = getMainNode(node.nodes.filter(node => !node.nodes) as GraphNode[]);
          return mainNode?.kubeObject?.metadata?.labels?.['app.kubernetes.io/instance'];
        }
        return node.kubeObject?.metadata?.labels?.['app.kubernetes.io/instance'];
      },
      { label: 'Instance' }
    );
  }

  root.nodes?.push(...components);

  // Sort nodes within each group node using weight-based sorting
  forEachNode(root, node => {
    /**
     * Sort elements, giving priority to both weight and bigger groups
     */
    const getNodeSortedWeight = (n: GraphNode): number => {
      // base weight from the node's explicit weight or type-based default
      let weight = getNodeWeight(n);

      // additional weight for groups with edges (connected components)
      if (n.edges && n.nodes) {
        const hasEdges = n.edges.length > 0;
        const nodeCount = n.nodes.length;

        if (hasEdges) {
          weight += 10000; // weight boost for groups with connections
        }

        // add weight based on group size
        weight += nodeCount * 10;
      }

      return weight;
    };

    if (node.nodes) {
      node.nodes.sort((a, b) => getNodeSortedWeight(b) - getNodeSortedWeight(a));
    }
  });

  return root;
}

/**
 * Walks the graph do find the parent of the given node
 */
export function getParentNode(graph: GraphNode, elementId: string): GraphNode | undefined {
  let result: GraphNode | undefined;

  forEachNode(graph, node => {
    if (node.nodes?.find(it => it.id === elementId)) {
      result = node;
    }
  });

  return result;
}

/**
 * Finds a Node with a group type that contains a given node
 * @param graph - graph which contains the Node
 * @param elementId - ID of a given Node
 * @param strict - If set to false will try to find closest group, if set to true always returns the parent
 * @returns
 */
export function findGroupContaining(
  graph: GraphNode,
  elementId: string,
  strict?: boolean
): GraphNode | undefined {
  // Group is actually selcted, not a node inside a group
  if (graph.id === elementId && !strict) return graph;

  // Node is inside this group
  if (graph.nodes?.find(it => (strict ? it.id === elementId : it.id === elementId && !it.nodes))) {
    return graph;
  }

  if (graph.nodes) {
    let res: GraphNode | undefined;
    graph.nodes?.some(node => {
      const group = findGroupContaining(node, elementId);
      if (group) {
        res = group;
        return true;
      }
      return false;
    });
    if (res) {
      return res;
    }
  }

  return undefined;
}

/**
 * Given a graph with groups, this function will 'collapse' all groups without
 * the selected node. 'Collapsing' means that group won't show all children but
 * only a preview
 *
 * If selectedNodeId is passed, only shows group containing that node
 *
 * @param graph Single graph node
 * @param params.selectedNodeId Graph node that is selected
 * @param params.expandAll Display all the children within all groups
 * @returns Collapsed graph
 */
export function collapseGraph(
  graph: GraphNode,
  { selectedNodeId = 'root', expandAll }: { selectedNodeId?: string; expandAll: boolean }
) {
  let root = { ...graph };
  let selectedGroup: GraphNode | undefined;

  if (selectedNodeId) {
    selectedGroup = findGroupContaining(graph, selectedNodeId);
  }

  /**
   * Recursively collapse graph starting from a given Node
   * Hides children if necessary
   * @param group - given Node
   * @returns Collapsed node
   */
  const collapseGroup = (group: GraphNode): GraphNode => {
    const isBig = (group.nodes?.length ?? 0) > 10 || (group.edges?.length ?? 0) > 0;
    const isSelectedGroup = selectedGroup?.id === group.id;
    const isRoot = group.id === 'root';

    const collapsed = !expandAll && !isRoot && !isSelectedGroup && isBig;

    return {
      ...group,
      nodes: group.nodes?.map(collapseGroup),
      edges: group.edges,
      collapsed,
    } as GraphNode;
  };

  if (selectedGroup && selectedGroup.id !== 'root') {
    root.nodes = [selectedGroup];
  }

  root = collapseGroup(root);

  return root;
}
