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

import { useClustersConf } from '../../../lib/k8s';
import { Cluster } from '../../../lib/k8s/cluster';
import { getClusterInventoryDisplayName } from './ClusterInventory';

/**
 * Gets the display label for a cluster: an explicit custom name if set,
 * otherwise the owning ClusterProfile's Cluster Inventory displayName,
 * otherwise the cluster's real name.
 *
 * This is presentation-only. Cluster.name must stay untouched: it's the
 * canonical identifier used for routing, recent-cluster storage, and
 * connection tracking, and -- unlike a user-set custom name, which is
 * validated unique -- a ClusterProfile displayName is not guaranteed unique,
 * so using it as an identifier risks collisions between unrelated clusters.
 *
 * @returns The label to render for this cluster.
 */
export function getClusterDisplayLabel(cluster: Cluster): string {
  return (
    cluster.meta_data?.extensions?.headlamp_info?.customName ||
    getClusterInventoryDisplayName(cluster) ||
    cluster.name
  );
}

/**
 * Gets the clusters from the clusters configuration, sorted by their display
 * label (see getClusterDisplayLabel). Cluster.name is left untouched.
 *
 * @returns An array of clusters sorted by display label.
 */
export function getCustomClusterNames(clusters: ReturnType<typeof useClustersConf>): Cluster[] {
  if (clusters === null) {
    return [];
  }
  return Object.values(clusters).sort((a, b) =>
    getClusterDisplayLabel(a).localeCompare(getClusterDisplayLabel(b))
  );
}
