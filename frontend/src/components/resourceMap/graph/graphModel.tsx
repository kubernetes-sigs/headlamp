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
  // Tier 1: Highest Level Orchestration & Application Definition
  HorizontalPodAutoscaler: 1000,
  Deployment: 980,
  StatefulSet: 970,
  DaemonSet: 960,
  CronJob: 940,
  Job: 920,

  // Tier 2: Core Runtime Components
  ReplicaSet: 850,
  Pod: 800,

  // Tier 3: Network Exposure & Routing
  Ingress: 780,
  Service: 760,
  IngressClass: 740,
  NetworkPolicy: 720,

  // Tier 4: Storage
  PersistentVolumeClaim: 680,
  StorageClass: 660,
  PersistentVolume: 640,
  CSIDriver: 620,

  // Tier 5: Configuration & Secrets
  ConfigMap: 580,
  Secret: 570,

  // Tier 6: Identity, Authorization & Admission Control
  ServiceAccount: 550,
  ClusterRole: 540,
  ClusterRoleBinding: 535,
  Role: 530,
  RoleBinding: 525,
  MutatingWebhookConfiguration: 510,
  ValidatingWebhookConfiguration: 500,

  // Tier 7: Supporting Network Resources (Often Derived)
  EndpointSlice: 450,
  Endpoints: 440,

  // Tier 8: Custom Resource Definitions (Meta-level, defines new kinds)
  CustomResourceDefinition: 400,

  // Default for any other unspecified resource type
  default: 300,
} as const;

/**
 * These thresholds define the minimum weight for a node to be included in a partition layer.
 * They are derived by looking at the `DEFAULT_NODE_WEIGHTS` and grouping them
 * into partition layers sorted in descending order.
 */
export const PARTITION_LAYER_THRESHOLDS: readonly number[] = [
  1000, // Layer 0: Top-tier controllers (e.g., HorizontalPodAutoscaler)
  920, // Layer 1: Main workload controllers (e.g., Deployment, StatefulSet, Job)
  800, // Layer 2: Core runtime components (e.g., ReplicaSet, Pod)
  720, // Layer 3: Network exposure and policy (e.g., Ingress, Service, NetworkPolicy)
  620, // Layer 4: Storage resources (e.g., PersistentVolumeClaim, StorageClass)
  570, // Layer 5: Configuration data (e.g., ConfigMap, Secret)
  500, // Layer 6: RBAC and admission control (e.g., ServiceAccount, Role, Webhooks)
  440, // Layer 7: Derived network resources (e.g., EndpointSlice, Endpoints)
  400, // Layer 8: Meta-definitions (e.g., CustomResourceDefinition)
  300, // Layer 9: Default-weighted items or other low-priority resources
] as const; // Ensure sorted descending, though manually defined this way.

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
