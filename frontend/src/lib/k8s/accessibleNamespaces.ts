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

import { useQuery } from '@tanstack/react-query';
import React from 'react';
import {
  getDiscoveryGeneration,
  loadClusterSettings,
  setDiscoveredNamespaces,
  subscribeDiscoveredNamespaces,
} from '../../helpers/clusterSettings';
import { useTypedSelector } from '../../redux/hooks';
import type { ApiError } from './api/v2/ApiError';
import { clusterFetch } from './api/v2/fetch';

/**
 * Response of the backend's accessible-namespaces endpoint.
 *
 * - `all`: the user can list namespaces, nothing is restricted.
 * - `restricted`: `namespaces` holds the namespaces the user can access. Every
 *   name was checked with a SelfSubjectAccessReview sent with the user's token.
 * - `unsupported`: the backend cannot discover namespaces for this cluster.
 */
export interface AccessibleNamespacesResult {
  status: 'all' | 'restricted' | 'unsupported';
  namespaces: string[];
}

/** How often discovery is refreshed while the app is open. */
export const ACCESSIBLE_NAMESPACES_REFRESH_MS = 60 * 1000;

/**
 * React Query key for a cluster's accessible namespaces. The generation changes
 * when the identity may have changed (resetAccessibleNamespaces in
 * lib/queryClient.ts), so responses for an older identity land under an old key.
 *
 * @param cluster - The cluster name.
 * @param generation - The discovery generation.
 */
export function accessibleNamespacesQueryKey(cluster: string, generation: number) {
  return ['accessibleNamespaces', cluster, generation] as const;
}

/**
 * React Query options for a cluster's accessible namespaces.
 *
 * The result is refreshed every minute: the shared QueryClient does not refetch
 * on window focus, and new namespaces or new grants should show up while the
 * app stays open.
 *
 * @param cluster - The cluster name.
 * @param generation - The discovery generation.
 * @param enabled - Whether discovery applies to the cluster.
 */
export function accessibleNamespacesQueryOptions(
  cluster: string,
  generation: number,
  enabled: boolean
) {
  return {
    queryKey: accessibleNamespacesQueryKey(cluster, generation),
    queryFn: () => fetchAccessibleNamespaces(cluster),
    enabled,
    staleTime: ACCESSIBLE_NAMESPACES_REFRESH_MS,
    refetchInterval: ACCESSIBLE_NAMESPACES_REFRESH_MS,
    // 401/403 will not change by retrying (e.g. the user is not logged in yet);
    // a token change resets discovery instead.
    retry: (failureCount: number, error: unknown) =>
      failureCount < 1 && ![401, 403].includes((error as ApiError)?.status ?? 0),
  };
}

/**
 * Fetches the namespaces the current user can access on a cluster.
 *
 * @param cluster - The cluster name.
 * @returns The discovery result.
 */
export async function fetchAccessibleNamespaces(
  cluster: string
): Promise<AccessibleNamespacesResult> {
  const response = await clusterFetch('accessible-namespaces', { cluster });
  const body = await response.json();
  return {
    status: body?.status ?? 'unsupported',
    namespaces: Array.isArray(body?.namespaces) ? body.namespaces : [],
  };
}

/**
 * Whether namespace discovery applies to a cluster: the backend enables it and
 * the cluster settings do not configure namespaces (the user's configuration
 * always wins).
 *
 * @param cluster - The cluster name.
 * @param discoveryEnabled - Whether the backend enables namespace discovery.
 */
export function shouldDiscoverNamespaces(cluster: string, discoveryEnabled: boolean): boolean {
  if (!cluster || !discoveryEnabled) {
    return false;
  }
  const settings = loadClusterSettings(cluster);
  return !(
    (settings.allowedNamespaces?.length ?? 0) > 0 ||
    Boolean(settings.allowedNamespacesSelector?.trim())
  );
}

/**
 * Discovers the namespaces the user can access on a cluster and keeps the
 * in-memory store read by getCombinedAllowedNamespaces in sync, so every list,
 * filter and search uses the same routing as Settings > Allowed namespaces.
 *
 * Discovery only runs when the backend enables it and the cluster settings do
 * not configure namespaces. On `all`, `unsupported` or an error (also when a
 * background refresh fails after an earlier success) the restriction is dropped
 * and Headlamp behaves as before. The result is refreshed every minute so new
 * namespaces and new grants show up.
 *
 * @param cluster - The cluster name.
 * @returns Whether discovery has no result yet for the current identity, and the
 *          resolved namespaces (undefined when no discovered restriction applies).
 */
export function useAccessibleNamespaces(cluster: string): {
  isPending: boolean;
  namespaces: string[] | undefined;
} {
  const discoveryEnabled = useTypedSelector(state => state.config.namespaceDiscoveryEnabled);
  const enabled = shouldDiscoverNamespaces(cluster, discoveryEnabled);
  const generation = React.useSyncExternalStore(
    subscribeDiscoveredNamespaces,
    getDiscoveryGeneration
  );

  const query = useQuery(accessibleNamespacesQueryOptions(cluster, generation, enabled));

  const namespaces = React.useMemo(
    () =>
      enabled && !query.isError && query.data?.status === 'restricted'
        ? [...query.data.namespaces].sort()
        : undefined,
    [enabled, query.isError, query.data]
  );
  const isPending = enabled && query.isLoading;

  React.useEffect(() => {
    if (!cluster || isPending) {
      return;
    }
    setDiscoveredNamespaces(cluster, namespaces ?? null);
  }, [cluster, isPending, namespaces]);

  return { isPending, namespaces };
}
