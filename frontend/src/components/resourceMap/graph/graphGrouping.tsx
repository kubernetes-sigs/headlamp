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
import { addPerformanceMetric } from '../PerformanceStats';
import { makeGraphLookup } from './graphLookup';
import { forEachNode, getNodeWeight, GraphEdge, GraphNode } from './graphModel';

export type GroupBy = 'node' | 'namespace' | 'instance';

/** Label used for pods that have not been assigned to a Kubernetes Node. */
export const UNSCHEDULED_GROUP = 'Unscheduled';

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
 * Iteratively finds all nodes in the connected component of a given node.
 * Performs a breadth-first search (BFS) to traverse and collect all nodes
 * that are part of the same connected component as the provided node.
 *
 * PERFORMANCE: Uses an index-based queue instead of Array.shift() to achieve
 * O(1) amortized dequeue and avoid the O(n²) behavior that shift()-based
 * queues can exhibit on large components. The resulting BFS traversal runs
 * in O(n) time with respect to the number of nodes in the component.
 *
 * PERFORMANCE: Uses iterative BFS instead of recursive DFS to avoid recursion
 * depth limits and potential stack overflows on deep or dense graphs. The
 * iterative approach removes dependence on call stack depth and is suitable
 * for handling large graphs safely.
 *
 * @param graphLookup - Lookup structure over the nodes/edges being searched
 * @param startNode - The starting node for the connected component search
 * @param visitedNodes - Set of node IDs already assigned to a component, updated in place
 * @param visitedEdges - Set of edge IDs already collected, updated in place
 * @param componentNodes - An array to store the nodes that are part of the connected component
 * @param componentEdges - An array to store the edges that are part of the connected component
 */
const findConnectedComponent = (
  graphLookup: ReturnType<typeof makeGraphLookup>,
  startNode: GraphNode,
  visitedNodes: Set<string>,
  visitedEdges: Set<string>,
  componentNodes: GraphNode[],
  componentEdges: GraphEdge[]
) => {
  const queue: GraphNode[] = [startNode];
  // PERFORMANCE: Index-based queue for O(1) dequeue instead of O(n) shift()
  let queueIndex = 0;
  visitedNodes.add(startNode.id);
  componentNodes.push(startNode);

  while (queueIndex < queue.length) {
    const node = queue[queueIndex++]; // O(1) operation vs shift() which is O(n)

    // Outgoing edges
    const outgoing = graphLookup.getOutgoingEdges(node.id);
    if (outgoing) {
      for (const edge of outgoing) {
        // Always collect the edge if we haven't yet
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.add(edge.id);
          componentEdges.push(edge);
        }

        // Only add to queue if we haven't visited the target node
        if (!visitedNodes.has(edge.target)) {
          const targetNode = graphLookup.getNode(edge.target);
          if (targetNode) {
            visitedNodes.add(edge.target);
            componentNodes.push(targetNode);
            queue.push(targetNode);
          }
        }
      }
    }

    // Incoming edges
    const incoming = graphLookup.getIncomingEdges(node.id);
    if (incoming) {
      for (const edge of incoming) {
        // Always collect the edge if we haven't yet
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.add(edge.id);
          componentEdges.push(edge);
        }

        // Only add to queue if we haven't visited the source node
        if (!visitedNodes.has(edge.source)) {
          const sourceNode = graphLookup.getNode(edge.source);
          if (sourceNode) {
            visitedNodes.add(edge.source);
            componentNodes.push(sourceNode);
            queue.push(sourceNode);
          }
        }
      }
    }
  }
};

/**
 * Computes connected components for a node/edge set and returns them as group nodes,
 * without collapsing single-node components down to plain nodes (that happens once in
 * {@link getConnectedComponents}, after any shared nodes have been cloned back in).
 *
 * @param nodes - Nodes to search for connected components
 * @param graphLookup - Lookup structure built over `nodes` and their edges
 * @returns Group nodes, one per connected component found
 */
const getConnectedComponentGroups = (
  nodes: GraphNode[],
  graphLookup: ReturnType<typeof makeGraphLookup>
): GraphNode[] => {
  const components: GraphNode[] = [];
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();

  nodes.forEach(node => {
    if (!visitedNodes.has(node.id)) {
      const componentNodes: GraphNode[] = [];
      const componentEdges: GraphEdge[] = [];
      findConnectedComponent(
        graphLookup,
        node,
        visitedNodes,
        visitedEdges,
        componentNodes,
        componentEdges
      );
      const mainNode = getMainNode(componentNodes);

      components.push({
        id: 'group-' + (mainNode?.id ?? 'unknown'),
        nodes: componentNodes,
        edges: componentEdges,
      });
    }
  });

  return components;
};

/**
 * Finds nodes that must not be allowed to merge otherwise-separate components together.
 *
 * A node qualifies as "shared" when *every* edge touching it names that same node as
 * its {@link GraphEdge.nonGroupingSide} and it has more than one distinct neighbor.
 * A ReadWriteMany PVC mounted by several unrelated Deployments is the motivating
 * example (see #4310): without this check, the shared PVC would connect all of those
 * Deployments into a single connected component.
 *
 * Checking `nonGroupingSide` against this specific node (rather than a plain boolean
 * on the edge) matters for the *other* endpoint: e.g. a standalone Pod mounting two
 * RWX PVCs has two edges that are both non-grouping, but neither names the Pod as
 * their `nonGroupingSide` (they name the PVCs), so the Pod itself is correctly never
 * treated as shared even though it has no "normal" edges and touches >1 neighbor.
 *
 * @param nodes - All nodes in the graph
 * @param graphLookup - Lookup structure built over `nodes` and their edges
 * @returns Set of node IDs that should be treated as shared
 */
const findSharedNodeIds = (
  nodes: GraphNode[],
  graphLookup: ReturnType<typeof makeGraphLookup>
): Set<string> => {
  const sharedNodeIds = new Set<string>();

  nodes.forEach(node => {
    const incomingEdges = graphLookup.getIncomingEdges(node.id) ?? [];
    const outgoingEdges = graphLookup.getOutgoingEdges(node.id) ?? [];
    const allEdges = [...incomingEdges, ...outgoingEdges];

    // A node is only a shareable-resource candidate if every edge touching it names
    // *this* node (by its role on that edge) as the shareable endpoint.
    const isShareableEndpoint = (edge: GraphEdge) =>
      (edge.target === node.id && edge.nonGroupingSide === 'target') ||
      (edge.source === node.id && edge.nonGroupingSide === 'source');

    if (allEdges.length === 0 || !allEdges.every(isShareableEndpoint)) {
      return;
    }

    const neighborNodeIds = new Set<string>();
    outgoingEdges.forEach(edge => neighborNodeIds.add(edge.target));
    incomingEdges.forEach(edge => neighborNodeIds.add(edge.source));

    if (neighborNodeIds.size > 1) {
      sharedNodeIds.add(node.id);
    }
  });

  return sharedNodeIds;
};

/**
 * Computes connected components while keeping shared nodes (see {@link findSharedNodeIds})
 * from bridging otherwise unrelated components together.
 *
 * Shared nodes are removed before searching for components, then attached back to every
 * component they're actually connected to. A shared node that only ever touches a single
 * component (e.g. an RWX PVC mounted by two Pods of the *same* Deployment) is reattached
 * unchanged, preserving its original ID so exact-ID lookups (e.g. a `?node=<uid>` selection)
 * keep working. Only when a shared node genuinely bridges more than one component is it
 * cloned per-component, each clone getting a unique ID and its own copy of the incident
 * edges, so every component keeps showing its own relationship to the shared resource
 * without merging with unrelated components.
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph
 * @param sharedNodeIds - IDs of nodes to split out and reattach per-component
 * @returns Group nodes, one per connected component found in the graph without the shared nodes
 */
const getComponentsWithSharedNodesCloned = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  sharedNodeIds: Set<string>
): GraphNode[] => {
  const baseNodes = nodes.filter(node => !sharedNodeIds.has(node.id));
  const baseEdges = edges.filter(
    edge => !sharedNodeIds.has(edge.source) && !sharedNodeIds.has(edge.target)
  );

  const sharedNodesById = new Map<string, GraphNode>();
  nodes.forEach(node => {
    if (sharedNodeIds.has(node.id)) {
      sharedNodesById.set(node.id, node);
    }
  });

  // Index edges touching a shared node by that shared node's ID, so each shared node's
  // target component(s) can be resolved directly instead of every component scanning
  // every shared node.
  const edgesBySharedNode = new Map<string, GraphEdge[]>();
  edges.forEach(edge => {
    const sharedId = sharedNodeIds.has(edge.source)
      ? edge.source
      : sharedNodeIds.has(edge.target)
      ? edge.target
      : undefined;
    if (!sharedId) {
      return;
    }

    const list = edgesBySharedNode.get(sharedId) ?? [];
    list.push(edge);
    edgesBySharedNode.set(sharedId, list);
  });

  const baseGraphLookup = makeGraphLookup(baseNodes, baseEdges);
  const baseComponents = getConnectedComponentGroups(baseNodes, baseGraphLookup);

  // Map every base node back to the component it ended up in, so a shared node's incident
  // edges resolve to their component(s) in a single pass over those edges.
  const componentByNodeId = new Map<string, GraphNode>();
  baseComponents.forEach(component => {
    component.nodes?.forEach(node => componentByNodeId.set(node.id, component));
  });

  sharedNodeIds.forEach(sharedId => {
    const sharedNode = sharedNodesById.get(sharedId);
    const incidentEdges = edgesBySharedNode.get(sharedId);
    if (!sharedNode || !incidentEdges || incidentEdges.length === 0) {
      return;
    }

    const edgesByComponent = new Map<GraphNode, GraphEdge[]>();
    incidentEdges.forEach(edge => {
      const otherNodeId = edge.source === sharedId ? edge.target : edge.source;
      const component = componentByNodeId.get(otherNodeId);
      if (!component) {
        return;
      }

      const list = edgesByComponent.get(component) ?? [];
      list.push(edge);
      edgesByComponent.set(component, list);
    });

    if (edgesByComponent.size === 0) {
      return;
    }

    // Only one component is actually touched: reattach the node as-is, no cloning needed.
    if (edgesByComponent.size === 1) {
      const [[component, componentEdges]] = edgesByComponent;
      component.nodes = [...(component.nodes ?? []), sharedNode];
      component.edges = [...(component.edges ?? []), ...componentEdges];
      return;
    }

    // Genuinely bridges multiple components: clone the node per-component with a unique ID.
    edgesByComponent.forEach((componentEdges, component) => {
      const clonedId = `${sharedId}--${component.id}`;
      component.nodes = [...(component.nodes ?? []), { ...sharedNode, id: clonedId }];

      component.edges = [
        ...(component.edges ?? []),
        ...componentEdges.map(edge => ({
          ...edge,
          id: `${edge.id}--${clonedId}`,
          source: edge.source === sharedId ? clonedId : edge.source,
          target: edge.target === sharedId ? clonedId : edge.target,
        })),
      ];
    });
  });

  return baseComponents;
};

/**
 * Identifies and groups connected components from a set of nodes and edges.
 * Connected component is a subgraph where all nodes are connected to each other
 * but not to any other node in the graph. Essentially a separate subgraph.
 *
 * @param nodes - An array of `KubeObjectNode` representing the nodes in the graph
 * @param edges - An array of `GraphEdge` representing the edges in the graph
 * @returns An array of `GraphNode` where each element is either a single node
 *          or a group node containing multiple nodes and edges
 */
const getConnectedComponents = (nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] => {
  const perfStart = performance.now();

  const lookupStart = performance.now();
  const graphLookup = makeGraphLookup(nodes, edges);
  const lookupTime = performance.now() - lookupStart;

  const componentStart = performance.now();

  // Nodes only reachable via nonGroupingSide-flagged edges to more than one neighbor (e.g. a
  // ReadWriteMany PVC mounted by several unrelated Pods) must not bridge otherwise
  // separate components together, so they're searched for and handled separately below.
  const sharedNodeIds = findSharedNodeIds(nodes, graphLookup);

  const components =
    sharedNodeIds.size > 0
      ? getComponentsWithSharedNodesCloned(nodes, edges, sharedNodeIds)
      : getConnectedComponentGroups(nodes, graphLookup);

  const componentTime = performance.now() - componentStart;

  const totalTime = performance.now() - perfStart;

  // Only log to console if debug flag is set
  if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
    console.log(
      `[ResourceMap Performance] getConnectedComponents: ${totalTime.toFixed(
        2
      )}ms (lookup: ${lookupTime.toFixed(2)}ms, component detection: ${componentTime.toFixed(
        2
      )}ms, nodes: ${nodes.length}, components: ${components.length})`
    );
  }

  addPerformanceMetric({
    operation: 'getConnectedComponents',
    duration: totalTime,
    timestamp: Date.now(),
    details: {
      lookupMs: lookupTime.toFixed(1),
      componentMs: componentTime.toFixed(1),
      nodes: nodes.length,
      components: components.length,
    },
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
  const perfStart = performance.now();

  const root: GraphNode = {
    id: 'root',
    label: 'root',
    nodes: [],
    edges: [],
  };

  let components: GraphNode[] = getConnectedComponents(nodes, edges);

  const groupingStart = performance.now();

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
    // Create groups based on the Kube resource node.
    // Pods without a nodeName (e.g. pending due to quota or scheduling failures)
    // are grouped under an "Unscheduled" sentinel so they remain visible.
    components = groupByProperty(
      components,
      component => {
        let pod: Pod | undefined;
        if (component.nodes) {
          const pods = component.nodes
            .filter(node => node.kubeObject?.kind === 'Pod')
            .map(node => node.kubeObject as Pod);
          pod = pods.find(pod => !pod.spec?.nodeName) ?? pods[0];
        } else if (component.kubeObject?.kind === 'Pod') {
          pod = component.kubeObject as Pod;
        }
        if (pod) {
          return pod.spec?.nodeName ?? UNSCHEDULED_GROUP;
        }
        return undefined;
      },
      { label: 'Node', allowSingleMemberGroup: true }
    );

    components.forEach(component => {
      if (!component.kubeObject && component.label !== UNSCHEDULED_GROUP) {
        component.kubeObject = k8sNodes.find(node => node.metadata.name === component.label);
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

  const groupingTime = performance.now() - groupingStart;

  // Sort nodes within each group node using weight-based sorting
  const sortStart = performance.now();
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
  const sortTime = performance.now() - sortStart;

  const totalTime = performance.now() - perfStart;

  // Only log to console if debug flag is set
  if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
    console.log(
      `[ResourceMap Performance] groupGraph: ${totalTime.toFixed(
        2
      )}ms (grouping: ${groupingTime.toFixed(2)}ms, sorting: ${sortTime.toFixed(2)}ms, groupBy: ${
        groupBy || 'none'
      })`
    );
  }

  addPerformanceMetric({
    operation: 'groupGraph',
    duration: totalTime,
    timestamp: Date.now(),
    details: {
      groupingMs: groupingTime.toFixed(1),
      sortingMs: sortTime.toFixed(1),
      groupBy: groupBy || 'none',
      nodes: nodes.length,
      edges: edges.length,
    },
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
 * @param params.expandLargeGraph When true, keeps large primary groups expanded
 * @returns Collapsed graph
 */
export function collapseGraph(
  graph: GraphNode,
  {
    selectedNodeId = 'root',
    expandAll,
    expandLargeGraph = false,
  }: { selectedNodeId?: string; expandAll: boolean; expandLargeGraph?: boolean }
) {
  let root = { ...graph };
  let selectedGroup: GraphNode | undefined;

  const primaryNodeIds = new Set(graph.nodes?.map(n => n.id) || []);

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
    const isPrimaryGroup = primaryNodeIds.has(group.id);
    const shouldExpandPrimary = !expandLargeGraph || !isPrimaryGroup;
    const collapsed = !expandAll && !isRoot && !isSelectedGroup && isBig && shouldExpandPrimary;

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
