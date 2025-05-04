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

import { ComponentType, ReactNode } from 'react';
import { KubeObject } from '../../../lib/k8s/KubeObject';

export type GraphNode = {
  /**
   * Unique ID for this node.
   * If this node represents a kubernetes object
   * then uid of that object is preferred.
   **/
  id: string;
  /** Display label for this node */
  label?: string;
  /** Subtitle for this node */
  subtitle?: string;
  /** Custom icon for this node */
  icon?: ReactNode;
  /**
   * If this property is set  then it means this graph Node
   * represents a kubernetes object.
   * Label and subtitle will be set based on the object's name and kind.
   */
  kubeObject?: KubeObject;
  /** A node may contain children Nodes. */
  nodes?: GraphNode[];
  /** A node may containain Edges that connect children Nodes. */
  edges?: GraphEdge[];
  /** Whether this Node is collapsed. Only applies to Nodes that have child Nodes. */
  collapsed?: boolean;
  /** Custom component to render details for this node */
  detailsComponent?: ComponentType<{ node: GraphNode }>;
  /** Any custom data */
  data?: any;
};

/**
 * Iterates graph, breadth first
 */
export function forEachNode(graph: GraphNode, cb: (item: GraphNode) => void) {
  cb(graph);
  graph.nodes?.forEach(it => forEachNode(it, cb));
}

/**
 * Edge connecting two Nodes on Map
 */
export interface GraphEdge {
  /** Unique ID */
  id: string;
  /** ID of the source Node */
  source: string;
  /** ID of the target Node */
  target: string;
  /** Optional label */
  label?: ReactNode;
  /** Custom data for this node */
  data?: any;
}

/**
 * Graph Source defines a group of Nodes and Edges
 * that can be loaded on the Map
 *
 * Graph Source may contain other GraphSources
 */
export type GraphSource = {
  /**
   * ID of the source, should be uniquie
   */
  id: string;
  /**
   * Descriptive label of the source
   */
  label: string;
  /**
   * Optional icon to display
   */
  icon?: ReactNode;
  /**
   * Controls wherther the source is shown by default
   * @default true
   */
  isEnabledByDefault?: boolean;
} & (
  | {
      /**
       * Child sources
       */
      sources: GraphSource[];
    }
  | {
      /**
       * Hooks that loads nodes and edges for this source
       */
      useData: () => { nodes?: GraphNode[]; edges?: GraphEdge[] } | null;
    }
);

export interface Relation {
  fromSource: string;
  toSource?: string;
  predicate: (from: GraphNode, to: GraphNode) => boolean;
}
