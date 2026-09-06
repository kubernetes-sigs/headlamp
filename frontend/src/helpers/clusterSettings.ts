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

/**
 * Namespaces resolved from a cluster's allowedNamespacesSelector, cached in
 * localStorage. This is derived data (the source of truth is the API server), so
 * it lives under its own key instead of inside the user's cluster settings blob
 * and carries the selector it was resolved for plus a timestamp to signal staleness.
 */
export interface ResolvedAllowedNamespacesCache {
  /** The label selector this list was resolved from. */
  selector: string;
  /** The resolved namespace names. */
  namespaces: string[];
  /** Epoch milliseconds of when the list was last resolved. */
  resolvedAt: number;
}

/**
 * How long a resolved-namespaces cache entry is considered fresh. Past this age
 * it is treated as stale and refreshed the next time the selector is resolved.
 */
export const ALLOWED_NAMESPACES_SELECTOR_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function resolvedAllowedNamespacesKey(clusterName: string): string {
  return `cluster_allowed_namespaces_selector_cache.${clusterName}`;
}

/**
 * Loads the cached namespaces resolved from a cluster's label selector.
 *
 * @param clusterName - The name of the cluster.
 * @returns The cache entry, or null if none is stored or it is malformed.
 */
export function loadResolvedAllowedNamespaces(
  clusterName: string
): ResolvedAllowedNamespacesCache | null {
  if (!clusterName) {
    return null;
  }
  const raw = localStorage.getItem(resolvedAllowedNamespacesKey(clusterName));
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof (parsed as ResolvedAllowedNamespacesCache).selector !== 'string' ||
      !Array.isArray((parsed as ResolvedAllowedNamespacesCache).namespaces) ||
      typeof (parsed as ResolvedAllowedNamespacesCache).resolvedAt !== 'number'
    ) {
      return null;
    }
    return parsed as ResolvedAllowedNamespacesCache;
  } catch {
    return null;
  }
}

/**
 * Stores the namespaces resolved from a cluster's label selector, stamped with
 * the selector they were resolved for and the current time.
 *
 * @param clusterName - The name of the cluster.
 * @param selector - The label selector the namespaces were resolved from.
 * @param namespaces - The resolved namespace names.
 */
export function storeResolvedAllowedNamespaces(
  clusterName: string,
  selector: string,
  namespaces: string[]
) {
  if (!clusterName) {
    return;
  }
  const entry: ResolvedAllowedNamespacesCache = {
    selector,
    namespaces: [...new Set(namespaces)].sort(),
    resolvedAt: Date.now(),
  };
  localStorage.setItem(resolvedAllowedNamespacesKey(clusterName), JSON.stringify(entry));
}

/**
 * Removes any cached namespaces resolved from a cluster's label selector.
 *
 * @param clusterName - The name of the cluster.
 */
export function clearResolvedAllowedNamespaces(clusterName: string) {
  if (!clusterName) {
    return;
  }
  localStorage.removeItem(resolvedAllowedNamespacesKey(clusterName));
}

/**
 * Returns whether the resolved-namespaces cache for a cluster needs to be
 * refreshed: there is a selector configured but no cache, the cache was resolved
 * for a different selector, or the cache is older than the max age.
 *
 * @param clusterName - The name of the cluster.
 * @param now - The current time in epoch milliseconds (defaults to Date.now()).
 * @returns true if the cache is missing, mismatched or too old.
 */
export function isResolvedAllowedNamespacesStale(
  clusterName: string,
  now: number = Date.now()
): boolean {
  const selector = loadClusterSettings(clusterName).allowedNamespacesSelector?.trim() || '';
  if (!selector) {
    return false;
  }
  const cache = loadResolvedAllowedNamespaces(clusterName);
  if (!cache || cache.selector !== selector) {
    return true;
  }
  return now - cache.resolvedAt > ALLOWED_NAMESPACES_SELECTOR_MAX_AGE_MS;
}

/**
 * Returns the combined list of allowed namespaces for a cluster: the manually
 * configured ones plus the ones resolved from the namespace label selector (if
 * any). The result is sorted and does not contain duplicates.
 *
 * The resolved list is only included when it was resolved for the currently
 * configured selector, so a stale list left over from a previous selector is
 * never used.
 *
 * @param cluster - The name of the cluster.
 * @returns The combined list of allowed namespaces.
 */
export function getCombinedAllowedNamespaces(cluster: string): string[] {
  const settings = loadClusterSettings(cluster);
  const selector = settings.allowedNamespacesSelector?.trim() || '';
  const cache = selector ? loadResolvedAllowedNamespaces(cluster) : null;
  const resolved = cache && cache.selector === selector ? cache.namespaces : [];
  return [...new Set([...(settings.allowedNamespaces || []), ...resolved])].sort();
}

/**
 * Checks whether a cluster has an explicit or selector-based namespace restriction.
 *
 * @param cluster - Cluster whose settings should be checked.
 * @returns Whether namespace access is restricted, including when a selector resolves empty.
 */
export function hasAllowedNamespacesRestriction(cluster: string): boolean {
  const settings = loadClusterSettings(cluster);
  return (
    (settings.allowedNamespaces?.length ?? 0) > 0 ||
    Boolean(settings.allowedNamespacesSelector?.trim())
  );
}
