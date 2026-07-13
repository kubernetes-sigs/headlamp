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

import type { ApiError } from '../../../../lib/k8s/api/v2/ApiError';
import type { Cluster, KubeCondition } from '../../../../lib/k8s/cluster';
import { getClusterStatus, getClusterStatusLabel } from '../clusterStatus';

const CLUSTER_INVENTORY_SOURCE = 'cluster_inventory';
const CONTROL_PLANE_HEALTHY_CONDITION = 'ControlPlaneHealthy';

/** Cluster Inventory condition fields used by the cluster table. */
export type ClusterInventoryCondition = Pick<
  KubeCondition,
  'type' | 'status' | 'reason' | 'message' | 'lastTransitionTime'
>;

/** Status kinds rendered by the Cluster Inventory-aware status cell. */
export type ClusterStatusKind = 'active' | 'error' | 'unknown';

type Translate = (key: string) => string;

/** Status information used to render a Cluster Inventory-aware status cell. */
export interface ClusterStatusInfo {
  kind: ClusterStatusKind;
  text: string;
  condition: ClusterInventoryCondition | null;
}

/** Icon and palette mapping for Cluster Inventory-aware cluster statuses. */
export const STATUS_VARIANTS: Record<
  ClusterStatusKind,
  { icon: string; colorKey: 'success' | 'error' | 'unknown'; coloredText: boolean }
> = {
  active: { icon: 'mdi:cloud-check-variant', colorKey: 'success', coloredText: true },
  error: { icon: 'mdi:cloud-off', colorKey: 'error', coloredText: true },
  unknown: { icon: 'mdi:cloud-question', colorKey: 'unknown', coloredText: false },
};

/** Returns true when a cluster was discovered from Cluster Inventory. */
export function isClusterInventoryCluster(cluster: Cluster): boolean {
  return cluster?.meta_data?.source === CLUSTER_INVENTORY_SOURCE;
}

/** Returns the Cluster Inventory control plane health condition when present. */
export function getControlPlaneHealthyCondition(
  cluster: Cluster
): ClusterInventoryCondition | null {
  if (!isClusterInventoryCluster(cluster)) {
    return null;
  }

  const conditions = cluster?.meta_data?.clusterInventory?.conditions;
  if (!Array.isArray(conditions)) {
    return null;
  }

  return (
    conditions.find(
      (condition: ClusterInventoryCondition) => condition.type === CONTROL_PLANE_HEALTHY_CONDITION
    ) ?? null
  );
}

/** Builds tooltip text from a Cluster Inventory health condition. */
export function getConditionTooltip(condition: ClusterInventoryCondition): string {
  return [condition.reason, condition.message, condition.lastTransitionTime]
    .filter(Boolean)
    .join('\n');
}

/** Returns the display status, preferring Cluster Inventory health when it reports failure. */
export function getClusterStatusInfo(
  cluster: Cluster,
  error: ApiError | null | undefined,
  t: Translate
): ClusterStatusInfo {
  const condition = getControlPlaneHealthyCondition(cluster);

  if (condition?.status === 'False') {
    return { kind: 'error', text: t('translation|Control plane unhealthy'), condition };
  }

  const status = getClusterStatus(error);
  if (status === 'auth-error' || status === 'permission-error' || status === 'unavailable') {
    return { kind: 'error', text: getClusterStatusLabel(t, error), condition };
  }

  if (condition?.status === 'Unknown' || status === 'loading') {
    return { kind: 'unknown', text: '⋯', condition };
  }

  return { kind: 'active', text: getClusterStatusLabel(t, error), condition };
}

/** Returns the sortable status text for a Cluster Inventory-aware cluster status cell. */
export function getClusterStatusAccessor(
  cluster: Cluster,
  error: ApiError | null | undefined,
  t: Translate
): string | undefined {
  const condition = getControlPlaneHealthyCondition(cluster);
  if (condition?.status === 'False') {
    return t('translation|Control plane unhealthy');
  }

  const status = getClusterStatus(error);
  if (status === 'auth-error' || status === 'permission-error' || status === 'unavailable') {
    return getClusterStatusLabel(t, error);
  }

  if (condition?.status === 'Unknown') {
    return t('translation|Unknown');
  }

  return getClusterStatusLabel(t, error);
}
