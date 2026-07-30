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

import { loadClusterSettings, storeClusterSettings } from '../../helpers/clusterSettings';
import { clusterRequest } from './api/v1/clusterRequests';
import type { KubeNamespace } from './namespace';

/**
 * Fetches the names of the namespaces matching the given label selector.
 *
 * This is useful for users who don't have the authority to list all namespaces
 * but do have access to the namespaces carrying a certain label; the API server
 * still needs to allow listing namespaces with that selector.
 *
 * @param cluster - The cluster to fetch the namespaces from.
 * @param selector - A Kubernetes label selector (e.g. "team=frontend,env=prod").
 * @returns The sorted list of namespace names matching the selector.
 */
export async function fetchNamespacesBySelector(
  cluster: string,
  selector: string
): Promise<string[]> {
  const response = await clusterRequest(
    `/api/v1/namespaces?labelSelector=${encodeURIComponent(selector)}`,
    { cluster, autoLogoutOnAuthError: false }
  );

  return ((response?.items as KubeNamespace[]) ?? [])
    .map(item => item.metadata.name)
    .filter(Boolean)
    .sort();
}

/**
 * Refreshes the namespaces resolved from the cluster's allowed namespaces label
 * selector (if one is configured) and caches the result in the cluster settings.
 *
 * @param cluster - The cluster to sync the allowed namespaces for.
 * @returns The resolved namespace names, or null if no selector is configured.
 */
export async function syncAllowedNamespacesFromSelector(cluster: string): Promise<string[] | null> {
  if (!cluster) {
    return null;
  }

  const selector = loadClusterSettings(cluster).allowedNamespacesSelector?.trim();
  if (!selector) {
    // Clear any stale cache left from a previously configured selector.
    const settings = loadClusterSettings(cluster);
    if (settings.allowedNamespacesFromSelector?.length) {
      delete settings.allowedNamespacesFromSelector;
      storeClusterSettings(cluster, settings);
    }
    return null;
  }

  const names = await fetchNamespacesBySelector(cluster, selector);

  // Reload the settings to avoid overwriting concurrent changes.
  storeClusterSettings(cluster, {
    ...loadClusterSettings(cluster),
    allowedNamespacesFromSelector: names,
  });

  return names;
}
