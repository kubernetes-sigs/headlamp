/*
 * Copyright 2026 The Kubernetes Authors
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

export interface PreparedClusterConnection {
  kubeconfig: string | null;
  stored: boolean;
}

const preparedConnections = new Map<string, PreparedClusterConnection>();
const preparingClusters = new Set<string>();
const connectionRevisions = new Map<string, number>();

function advanceClusterConnectionRevision(cluster: string) {
  connectionRevisions.set(cluster, (connectionRevisions.get(cluster) ?? 0) + 1);
}

/** Keeps the last prepared request identity while replacement preparation is active. */
export function beginClusterConnectionPreparation(cluster: string) {
  if (!preparingClusters.has(cluster)) {
    advanceClusterConnectionRevision(cluster);
    preparingClusters.add(cluster);
  }
}

/** Publishes a connection only after all preparation work has succeeded. */
export function completeClusterConnectionPreparation(
  cluster: string,
  connection: PreparedClusterConnection
) {
  preparedConnections.set(cluster, connection);
  advanceClusterConnectionRevision(cluster);
  preparingClusters.delete(cluster);
}

/** Keeps the previous prepared connection after replacement preparation fails. */
export function failClusterConnectionPreparation(cluster: string) {
  preparingClusters.add(cluster);
}

/** Stops pinning when the retained prepared view no longer owns the replacement. */
export function releaseClusterConnectionPreparation(cluster: string) {
  preparingClusters.delete(cluster);
}

/**
 * Resolves the request connection without consulting mutable configuration while a
 * replacement is pending or after it has failed.
 */
export function getPreparedClusterConnection(
  cluster: string
): PreparedClusterConnection | undefined {
  if (!preparingClusters.has(cluster)) return undefined;
  return preparedConnections.get(cluster) ?? { stored: false, kubeconfig: null };
}

/**
 * Resolves request provenance from the last successful preparation while a
 * replacement is pending, otherwise records the current connection for future
 * replacement pinning.
 */
export async function resolveClusterRequestKubeconfig(cluster: string): Promise<string | null> {
  const prepared = getPreparedClusterConnection(cluster);
  if (prepared) return prepared.stored ? prepared.kubeconfig : null;
  const revision = connectionRevisions.get(cluster) ?? 0;
  const kubeconfig = await findKubeconfigByClusterName(cluster);
  if ((connectionRevisions.get(cluster) ?? 0) !== revision) {
    return resolveClusterRequestKubeconfig(cluster);
  }
  preparedConnections.set(cluster, { stored: kubeconfig !== null, kubeconfig });
  return kubeconfig;
}

/** Test helper for isolating process-global request snapshots. */
export function resetPreparedClusterConnections() {
  preparedConnections.clear();
  preparingClusters.clear();
  connectionRevisions.clear();
}
import { findKubeconfigByClusterName } from '../stateless/findKubeconfigByClusterName';
