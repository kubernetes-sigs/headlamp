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
import ELK from 'elkjs';
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

const elk = new ELK({
  defaultLayoutOptions: {},
});

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
            'elk.padding': '[left=24, top=24, right=24, bottom=24]',
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
 * Layout will set size and poisiton for all the elements
 *
 * @param graph - root node of the graph
 * @param aspectRatio - aspect ratio of the container
 * @returns
 */
export const applyGraphLayout = (graph: GraphNode, aspectRatio: number) => {
  const elkGraph = convertToElkNode(graph, aspectRatio);

  return elk
    .layout(elkGraph, {
      layoutOptions: {
        'elk.aspectRatio': String(aspectRatio),
      },
    })
    .then(elkGraph => convertToReactFlowGraph(elkGraph as ElkNodeWithData));
};
