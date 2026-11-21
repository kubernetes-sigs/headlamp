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

import { QueryClient } from '@tanstack/react-query';

/**
 * Determines whether React Query should retry a failed query.
 *
 * @param failureCount - Number of failed attempts before this retry decision.
 * @param error - The query error, which may include a numeric HTTP `status`.
 * @returns `true` while retries remain for transient errors; `false` for
 * permanent HTTP 4xx errors other than 408 and 429, or after three failures.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status =
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number' &&
    Number.isFinite(error.status)
      ? error.status
      : undefined;

  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }

  return failureCount < 3;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
  },
});

/**
 * Removes cached Kubernetes object and list results for a cluster, or for all
 * clusters when the authenticated identity may have changed across them.
 *
 * Object and list query keys do not include the authenticated user. Removing
 * these entries when a token changes prevents one session's resource data from
 * being displayed by the next session while a request is pending or failing.
 *
 * @param cluster - Cluster whose resource results should be removed. Omit when
 *                  a token change may have been broadcast to sibling clusters.
 */
export function removeClusterResourceQueries(cluster?: string) {
  const predicate = (query: { queryKey: readonly unknown[] }) => {
    const [keyType, keyScope] = query.queryKey;
    const isObjectQuery = keyType === 'object' && typeof keyScope === 'string';
    const isObjectListQuery =
      keyType === 'kubeObject' &&
      query.queryKey[1] === 'list' &&
      typeof query.queryKey[4] === 'string';

    if (!isObjectQuery && !isObjectListQuery) {
      return false;
    }

    const queryCluster = isObjectQuery ? keyScope : query.queryKey[4];
    return cluster === undefined || queryCluster === cluster;
  };

  // Active observers can retain the last Query result after cache removal.
  // Publish an empty result first so mounted views stop showing old objects.
  queryClient.setQueriesData({ predicate }, null);
  queryClient.removeQueries({ predicate });
}

/**
 * Invalidates cached user identities and clears resource data for every cluster.
 *
 * Call this after an OIDC login completes. The backend may broadcast the new
 * token to sibling clusters that share the same identity provider, which
 * replaces their auth cookies too. Invalidating only the cluster that was
 * logged into would leave the other clusters showing a stale identity from
 * cache (for up to their staleTime) while requests to them already run as the
 * new user.
 *
 * It lives here rather than in lib/auth because lib/util re-exports lib/auth to
 * plugins as `Utils.auth`; invalidating Headlamp's own query keys is not a
 * capability plugins should have.
 */
export function invalidateClusterUserInfo() {
  // OIDC token broadcasts can change the active user on sibling clusters too.
  removeClusterResourceQueries();
  return queryClient.invalidateQueries({ queryKey: ['clusterMe'] });
}
