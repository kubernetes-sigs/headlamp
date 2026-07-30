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

/**
 * ClusterSettings defines the structure of the cluster settings object.
 */
export interface ClusterSettings {
  /** Optional default namespace to be used */
  defaultNamespace?: string;
  /** Only allow namespaces in this list to be selected */
  allowedNamespaces?: string[];
  /**
   * A Kubernetes label selector (e.g. "team=frontend,env=prod") used to dynamically
   * resolve the list of allowed namespaces from the cluster.
   */
  allowedNamespacesSelector?: string;
  /**
   * Namespaces resolved from allowedNamespacesSelector. This is a cache that is
   * refreshed when the app loads a cluster and when the selector changes.
   */
  allowedNamespacesFromSelector?: string[];
  /** This is a custom cluster name. If it is '' it is the actual cluster name. */
  currentName?: string;
  nodeShellTerminal?: {
    linuxImage?: string;
    namespace?: string;
    isEnabled?: boolean;
  };
  podDebugTerminal?: {
    debugImage?: string;
    isEnabled?: boolean;
  };
  /** Cluster appearance settings stored in localStorage */
  appearance?: {
    accentColor?: string;
    icon?: string;
  };
}

/**
 * Returns the combined list of allowed namespaces for the given cluster settings:
 * the manually configured ones plus the ones resolved from the namespace label
 * selector (if any). The result is sorted and does not contain duplicates.
 *
 * @param settings - The cluster settings.
 * @returns The combined list of allowed namespaces.
 */
export function getCombinedAllowedNamespaces(settings: ClusterSettings): string[] {
  return [
    ...new Set([
      ...(settings.allowedNamespaces || []),
      ...(settings.allowedNamespacesFromSelector || []),
    ]),
  ].sort();
}

export const DEFAULT_NODE_SHELL_LINUX_IMAGE = 'docker.io/library/busybox:latest';
export const DEFAULT_NODE_SHELL_NAMESPACE = 'default';
export const DEFAULT_POD_DEBUG_IMAGE = 'docker.io/library/busybox:latest';

/**
 * Stores the cluster settings in local storage.
 *
 * @param clusterName - The name of the cluster.
 * @param settings - The cluster settings to be stored.
 * @returns {void}
 */
export function storeClusterSettings(clusterName: string, settings: ClusterSettings) {
  if (!clusterName) {
    return;
  }
  localStorage.setItem(`cluster_settings.${clusterName}`, JSON.stringify(settings));
}

/**
 * Loads the cluster settings from local storage.
 *
 * @param clusterName - The name of the cluster.
 * @returns {ClusterSettings} - The cluster settings.
 */
export function loadClusterSettings(clusterName: string): ClusterSettings {
  if (!clusterName) {
    return {};
  }
  try {
    const raw = localStorage.getItem(`cluster_settings.${clusterName}`) || '{}';
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`cluster_settings.${clusterName} is not an object, falling back to {}.`);
      return {};
    }
    return parsed as ClusterSettings;
  } catch (error) {
    console.warn(`Failed to parse cluster_settings.${clusterName}, falling back to {}:`, error);
  }
  return {};
}
