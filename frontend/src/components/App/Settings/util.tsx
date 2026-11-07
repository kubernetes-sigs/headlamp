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

import { Cluster } from '../../../lib/k8s/cluster';

export function isValidNamespaceFormat(namespace: string) {
  // We allow empty strings just because that's the default value in our case.
  if (!namespace) {
    return true;
  }

  // Validates that the namespace is a valid DNS-1123 label and returns a boolean.
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names
  const regex = new RegExp('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$');
  return regex.test(namespace);
}

export function isValidClusterNameFormat(name: string) {
  // We allow empty isValidClusterNameFormat just because that's the default value in our case.
  if (!name) {
    return true;
  }

  // Validates that the namespace is a valid DNS-1123 label and returns a boolean.
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names
  const regex = new RegExp('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$');
  return regex.test(name);
}

/**
 * Checks if a name is already used by a cluster, as its current name or as the original name it
 * has in the kubeconfig. The cluster being renamed can go back to its own original name, so its
 * original name doesn't count.
 *
 * @param name - The name to check.
 * @param cluster - The current name of the cluster being renamed.
 * @param clusterConf - The clusters, keyed by their current name.
 * @returns true if the name is already in use.
 */
export function isClusterNameInUse(
  name: string,
  cluster: string,
  clusterConf: { [clusterName: string]: Cluster } | null
) {
  if (!clusterConf) {
    return false;
  }

  /** These are the display names of the clusters, renamed clusters have their display name as the custom name */
  const clusterNames = Object.values(clusterConf).map(item => item.name);

  /** The original name of a cluster is the name used in the kubeconfig file. */
  const originalNames = Object.entries(clusterConf)
    .filter(([clusterName]) => clusterName !== cluster)
    .map(([, item]) => item.meta_data?.originalName)
    .filter(originalName => originalName !== undefined);

  return [...clusterNames, ...originalNames].includes(name);
}
