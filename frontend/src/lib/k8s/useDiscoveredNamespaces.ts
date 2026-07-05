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
 * Hooks and helpers for namespace discovery list routing.
 *
 * `usesDiscoveredNamespaceRouting()` is true for `source: 'rolebindings'` or
 * `source: 'fallback'` — any finite namespace set that replaces cluster-wide list
 * API calls. It is not limited to RBAC RoleBinding discovery.
 */

import { useQueries, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { loadClusterSettings } from '../../helpers/clusterSettings';
import { getCluster } from '../cluster';
import { testAuth } from './api/v1/clusterApi';
import {
  AuthNotReadyForDiscoveryError,
  discoverAccessibleNamespaces,
  type NamespaceDiscoveryError,
  type NamespaceDiscoveryResult,
} from './namespaceDiscovery';

const DISCOVERY_RETRY_DELAY_MS = 1000;
const DISCOVERY_MAX_AUTH_RETRIES = 3;

export const NAMESPACE_DISCOVERY_QUERY_KEY = 'namespaceDiscovery';

/**
 * Manual namespace override from Settings (unchanged Headlamp behavior).
 */
export function getManualAllowedNamespaces(cluster: string | null = getCluster()): string[] {
  if (!cluster) {
    return [];
  }

  return loadClusterSettings(cluster).allowedNamespaces || [];
}

/**
 * True when discovery resolved to a finite namespace set that should use
 * per-namespace list routing instead of the cluster-wide list API path.
 * Applies to RoleBinding discovery and Settings/kubeconfig fallback — not
 * when list-namespaces API succeeded (source `api`).
 */
export function usesDiscoveredNamespaceRouting(discovery?: NamespaceDiscoveryResult): boolean {
  if (!discovery) {
    return false;
  }
  return (
    (discovery.source === 'rolebindings' || discovery.source === 'fallback') &&
    discovery.namespaces.length > 0
  );
}

/**
 * Namespace names from discovery sources that require per-namespace routing
 * (`rolebindings` or `fallback`). Excludes cluster-wide list-namespaces results.
 */
export function getDiscoveredNamespaces(discovery?: NamespaceDiscoveryResult): string[] {
  if (!usesDiscoveredNamespaceRouting(discovery)) {
    return [];
  }
  return discovery!.namespaces;
}

export interface NamespaceListConfig {
  namespaces: string[];
}

/**
 * Resolves namespace list for makeListRequests.
 *
 * Preserves legacy Headlamp behavior unless discovered namespace routing applies:
 * - manual Settings override → per-namespace requests (unchanged)
 * - empty list → cluster-scoped list request (unchanged)
 * - RoleBinding or fallback discovery → per-namespace requests for discovered set (new)
 */
export function getNamespaceListConfig(
  cluster: string | null,
  discovery: NamespaceDiscoveryResult | undefined,
  hasRequestedNamespaces: boolean
): NamespaceListConfig {
  const manualAllowed = getManualAllowedNamespaces(cluster);

  if (hasRequestedNamespaces) {
    if (manualAllowed.length > 0) {
      return { namespaces: manualAllowed };
    }
    return { namespaces: getDiscoveredNamespaces(discovery) };
  }

  // Legacy: Settings → Allowed namespaces (exact upstream behavior).
  if (manualAllowed.length > 0) {
    return { namespaces: manualAllowed };
  }

  // New: when list namespaces failed and discovery found a finite namespace set.
  const discovered = getDiscoveredNamespaces(discovery);
  if (discovered.length > 0) {
    return { namespaces: discovered };
  }

  // Legacy: empty → cluster-wide list API call.
  return { namespaces: [] };
}

export function formatNamespaceDiscoveryError(
  t: TFunction,
  error: NamespaceDiscoveryError
): string {
  switch (error.code) {
    case 'list_rolebindings_denied':
      return t(
        'translation|Namespace discovery could not list RoleBindings. Ask your administrator to grant cluster-wide list permission on RoleBindings. Your Kubernetes identity: {{identity}}.',
        { identity: error.identity }
      );
    case 'no_matching_bindings':
      return t(
        'translation|RoleBindings were listed but none match your Kubernetes identity. Ensure namespace RoleBinding subjects use the same user or group names as your identity provider maps in the cluster. Your Kubernetes identity: {{identity}}.',
        { identity: error.identity }
      );
    case 'auth_not_ready':
      return t(
        'translation|Namespace discovery is still waiting for authentication to be ready. Refresh the page if this persists.'
      );
    case 'discovery_failed':
    default:
      return t(
        'translation|Could not discover accessible namespaces. Grant list RoleBindings permission and namespace RoleBindings for your identity, or use Settings → Additional namespaces. Your Kubernetes identity: {{identity}}.',
        { identity: error.identity }
      );
  }
}

export interface NamespaceDiscoveryAlertParams {
  effectiveNamespaces: string[];
  discovery?: NamespaceDiscoveryResult;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  t: TFunction;
}

/**
 * Returns a user-facing discovery error for UI alerts, or null when no error should be shown.
 */
export function getNamespaceDiscoveryAlert({
  effectiveNamespaces,
  discovery,
  isLoading,
  isFetching,
  isError,
  t,
}: NamespaceDiscoveryAlertParams): string | null {
  if (effectiveNamespaces.length > 0 || isLoading || isFetching) {
    return null;
  }

  if (discovery?.source === 'none' && discovery.error) {
    return formatNamespaceDiscoveryError(t, discovery.error);
  }

  if (isError) {
    return t(
      'translation|Namespace discovery failed unexpectedly. Refresh the page if this persists.'
    );
  }

  return null;
}

/** Exported for unit tests. */
export async function runNamespaceDiscoveryWithAuthRetry(
  cluster: string
): Promise<NamespaceDiscoveryResult> {
  for (let attempt = 0; attempt <= DISCOVERY_MAX_AUTH_RETRIES; attempt++) {
    try {
      return await discoverAccessibleNamespaces(cluster);
    } catch (error) {
      if (error instanceof AuthNotReadyForDiscoveryError) {
        if (attempt < DISCOVERY_MAX_AUTH_RETRIES) {
          await new Promise(resolve =>
            setTimeout(resolve, DISCOVERY_RETRY_DELAY_MS * 2 ** attempt)
          );
          continue;
        }
        return {
          namespaces: [],
          isClusterWide: false,
          source: 'none',
          error: { code: 'auth_not_ready', identity: '' },
        };
      }
      throw error;
    }
  }

  return {
    namespaces: [],
    isClusterWide: false,
    source: 'none',
    error: { code: 'auth_not_ready', identity: '' },
  };
}

function useClusterAuthReady(cluster: string | null) {
  return useQuery({
    queryKey: ['auth', cluster],
    queryFn: () => testAuth(cluster!),
    enabled: !!cluster && getManualAllowedNamespaces(cluster).length === 0,
    retry: 0,
  });
}

/**
 * React Query hook that discovers accessible namespaces for a cluster.
 * Waits for cluster auth (testAuth) before running — avoids post-OIDC race conditions.
 */
function isAuthProbePending(
  cluster: string,
  manualOverride: boolean,
  authQuery: { isLoading: boolean; isFetching: boolean }
) {
  return !!cluster && !manualOverride && (authQuery.isLoading || authQuery.isFetching);
}

export function useDiscoveredNamespaces(cluster: string | null = getCluster()) {
  const manualOverride = getManualAllowedNamespaces(cluster).length > 0;
  const authQuery = useClusterAuthReady(cluster);

  const discoveryQuery = useQuery({
    queryKey: [NAMESPACE_DISCOVERY_QUERY_KEY, cluster],
    queryFn: () => runNamespaceDiscoveryWithAuthRetry(cluster!),
    enabled: !!cluster && authQuery.isSuccess && !manualOverride,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const authPending = isAuthProbePending(cluster ?? '', manualOverride, authQuery);

  return {
    ...discoveryQuery,
    isLoading: authPending || discoveryQuery.isLoading,
    isFetching: authPending || discoveryQuery.isFetching,
  };
}

/**
 * Discovers namespaces for multiple clusters in parallel.
 */
export function useDiscoveredNamespacesMap(clusters: string[]) {
  const authQueries = useQueries({
    queries: clusters.map(cluster => ({
      queryKey: ['auth', cluster],
      queryFn: () => testAuth(cluster),
      enabled: !!cluster && getManualAllowedNamespaces(cluster).length === 0,
      retry: 0,
    })),
  });

  const queries = useQueries({
    queries: clusters.map((cluster, index) => ({
      queryKey: [NAMESPACE_DISCOVERY_QUERY_KEY, cluster],
      queryFn: () => runNamespaceDiscoveryWithAuthRetry(cluster),
      enabled:
        !!cluster &&
        (authQueries[index]?.isSuccess ?? false) &&
        getManualAllowedNamespaces(cluster).length === 0,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  return useMemo(() => {
    const map: Record<string, NamespaceDiscoveryResult | undefined> = {};
    const isLoadingByCluster: Record<string, boolean> = {};
    const isErrorByCluster: Record<string, boolean> = {};
    clusters.forEach((cluster, index) => {
      const manualOverride = getManualAllowedNamespaces(cluster).length > 0;
      const authQuery = authQueries[index];
      const authPending = isAuthProbePending(cluster, manualOverride, {
        isLoading: authQuery?.isLoading ?? false,
        isFetching: authQuery?.isFetching ?? false,
      });
      const discoveryPending = queries[index]?.isLoading ?? false;

      map[cluster] = queries[index]?.data;
      isLoadingByCluster[cluster] = authPending || discoveryPending;
      isErrorByCluster[cluster] = queries[index]?.isError ?? false;
    });
    return {
      map,
      isLoading: Object.values(isLoadingByCluster).some(Boolean),
      isLoadingByCluster,
      isErrorByCluster,
    };
  }, [clusters, authQueries, queries]);
}

/**
 * Namespaces for UI filters and list routing when discovery or manual override applies.
 * Returns [] when legacy cluster-wide behavior should be used (list namespaces API works).
 */
export function getEffectiveNamespaces(
  cluster: string | null = getCluster(),
  discovery?: NamespaceDiscoveryResult
): string[] {
  if (!cluster) {
    return [];
  }

  const manualAllowed = getManualAllowedNamespaces(cluster);
  const discovered = getDiscoveredNamespaces(discovery);

  if (manualAllowed.length > 0) {
    return manualAllowed;
  }

  return discovered;
}
