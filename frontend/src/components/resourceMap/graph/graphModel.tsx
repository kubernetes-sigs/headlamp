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
  /**
   * Weight determines the priority/importance of this node (higher = more important).
   * Used for sorting and determining the "main" node in groups.
   * If not specified, defaults will be used based on node type.
   */
  weight?: number;
  /** Any custom data */
  data?: any;
  /** CustomResourceDefinition for this node */
  customResourceDefinition?: string;
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

/**
 * Default node weight assignments for different Kubernetes resource types.
 * Higher weight = higher priority/importance in graph layout.
 */
const DEFAULT_NODE_WEIGHTS = {
  // Tier 1: Top-Level Orchestration & Scaling
  HorizontalPodAutoscaler: 1000,

  // Tier 2: Primary Workload Controllers
  Deployment: 980,
  StatefulSet: 960,
  DaemonSet: 960,

  // Tier 3: Job-based Workloads
  CronJob: 960,
  Job: 920,

  // Tier 4: Intermediate Controllers
  ReplicaSet: 960,

  // Tier 5: Core Runtime & Direct Dependencies
  Pod: 800,

  // All resources directly connected to Pod at the same level
  ServiceAccount: 960,
  Role: 790,
  ClusterRole: 790,
  Service: 790,
  NetworkPolicy: 790,
  PersistentVolumeClaim: 790,
  ConfigMap: 790,
  Secret: 790,

  // Tier 6: Supporting Resources
  // Network supporting resources (cascading from Service/NetworkPolicy)
  Endpoints: 780,
  EndpointSlice: 780,
  MutatingWebhookConfiguration: 780,
  ValidatingWebhookConfiguration: 780,
  IngressClass: 780,
  Ingress: 780,

  // RBAC supporting resources (cascading from ServiceAccount/Role/ClusterRole)
  RoleBinding: 800,
  ClusterRoleBinding: 800,

  // Storage supporting resources (cascading from PVC)
  StorageClass: 770,
  CSIDriver: 760,
  PersistentVolume: 750,

  // Tier 7: Meta-definitions & Extensions
  CustomResourceDefinition: 600,

  // Default for unspecified resources
  default: 500,
} as const;

/**
 * Gets the effective weight of a node, considering both explicit weight
 * and default weights based on Kubernetes resource type.
 *
 * @param node - The GraphNode to get weight for
 * @returns The effective weight (higher = more important)
 */
export function getNodeWeight(node: GraphNode): number {
  // if explicit weight is set, use it
  if (node.weight !== undefined) {
    return node.weight;
  }

  // otherwise, use default weight based on Kubernetes resource kind
  const kind = node.kubeObject?.kind;
  if (kind && kind in DEFAULT_NODE_WEIGHTS) {
    return DEFAULT_NODE_WEIGHTS[kind as keyof typeof DEFAULT_NODE_WEIGHTS];
  }

  return DEFAULT_NODE_WEIGHTS.default;
}
