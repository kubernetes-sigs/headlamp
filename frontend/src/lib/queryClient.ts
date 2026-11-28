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
import { resetDiscoveredNamespaces } from '../helpers/clusterSettings';
import store from '../redux/stores/store';
import { setClusterSettings } from '../settings/adminSettingsSlice';

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
 * Invalidates the cached user identity (`clusterMe`) for every cluster.
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
  return queryClient.invalidateQueries({ queryKey: ['clusterMe'] });
}

/** Name of the channel that tells other tabs the identity may have changed. */
export const IDENTITY_RESET_CHANNEL = 'headlamp-identity-reset';
export const IDENTITY_RESET_EVENT = 'headlamp-identity-reset';

const identityQueryPrefixes = new Set([
  'accessibleNamespaces',
  'api-discovery',
  'auth',
  'authVisible',
  'clusterMe',
  'cluster-defined-settings',
  'clusterVersion',
  'clusterWideList',
  'clustersServing',
  'endpoints',
  'gateway-l4-route-availability',
  'kubeObject',
  'legacy-list-watch',
  'object',
  'object-watch',
  'projectDelete:auth',
  'scaleMultiple:auth',
  'servedSchedulingVersions',
  'version',
]);

const clusterQueryFields = new Map<string, (queryKey: readonly unknown[]) => readonly unknown[]>([
  ['accessibleNamespaces', key => key.slice(1, 2)],
  ['api-discovery', key => key.slice(1)],
  ['auth', key => key.slice(1, 2)],
  ['authVisible', key => key.slice(7, 8)],
  ['clusterMe', key => key.slice(1, 2)],
  [
    'cluster-defined-settings',
    key => (Array.isArray(key[2]) ? key.slice(2, 3).flat() : key.slice(2, 3)),
  ],
  ['clusterVersion', key => key.slice(1, 2)],
  ['clusterWideList', key => key.slice(1, 2)],
  ['clustersServing', key => key.slice(3)],
  ['endpoints', key => key.slice(1, 2)],
  ['gateway-l4-route-availability', key => key.slice(1)],
  ['kubeObject', key => key.slice(4, 5)],
  ['legacy-list-watch', key => key.slice(5, 6)],
  ['object', key => key.slice(1, 2)],
  ['object-watch', key => key.slice(2, 3)],
  ['projectDelete:auth', key => key.slice(2, 3)],
  ['scaleMultiple:auth', key => key.slice(1, 2)],
  ['servedSchedulingVersions', key => key.slice(2)],
  ['version', key => key.slice(1, 2)],
]);

function isIdentityQuery(queryKey: readonly unknown[], cluster?: string) {
  const prefix = String(queryKey[0]);
  if (!identityQueryPrefixes.has(prefix)) return false;
  return !cluster || clusterQueryFields.get(prefix)?.(queryKey).includes(cluster) === true;
}

let allClusterIdentityGeneration = 0;
const clusterIdentityGenerations = new Map<string, number>();
const defaultIdentityQueryClientRef = new WeakRef(queryClient);
const identityQueryClientRefs = new Set([defaultIdentityQueryClientRef]);
const identityQueryClientRefByClient = new WeakMap([[queryClient, defaultIdentityQueryClientRef]]);

export function getClusterIdentityGeneration(cluster: string) {
  return `${allClusterIdentityGeneration}:${clusterIdentityGenerations.get(cluster) ?? 0}`;
}

export function registerIdentityQueryClient(client: QueryClient) {
  if (identityQueryClientRefByClient.has(client)) return;

  const clientRef = new WeakRef(client);
  identityQueryClientRefByClient.set(client, clientRef);
  identityQueryClientRefs.add(clientRef);
}

function resetAccessibleNamespacesLocally(cluster?: string) {
  if (cluster) {
    clusterIdentityGenerations.set(cluster, (clusterIdentityGenerations.get(cluster) ?? 0) + 1);
  } else {
    allClusterIdentityGeneration++;
  }
  resetDiscoveredNamespaces(cluster);
  const clusterSettings = store.getState().adminSettings.clusterSettings;
  store.dispatch(
    setClusterSettings(
      cluster
        ? Object.fromEntries(Object.entries(clusterSettings).filter(([name]) => name !== cluster))
        : {}
    )
  );
  const predicate = (query: { queryKey: readonly unknown[] }) =>
    isIdentityQuery(query.queryKey, cluster);
  for (const clientRef of identityQueryClientRefs) {
    const client = clientRef.deref();
    if (!client) {
      identityQueryClientRefs.delete(clientRef);
      continue;
    }

    void client.cancelQueries({ predicate });
    void client.resetQueries({ predicate, type: 'active' });
    client.removeQueries({ predicate, type: 'inactive' });
  }
  dispatchCredentialsChanged(cluster);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(IDENTITY_RESET_EVENT, { detail: { cluster } }));
  }
}

function dispatchCredentialsChanged(cluster?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('headlamp-credentials-changed', { detail: { cluster } }));
  }
}

// The authentication cookie is shared by all tabs, so an identity change in one
// tab also changes the identity of the others. The message only names the
// cluster, never a credential. Receivers reset locally without re-broadcasting.
const identityResetChannel =
  typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel(IDENTITY_RESET_CHANNEL);
if (identityResetChannel) {
  identityResetChannel.onmessage = (event: MessageEvent) => {
    const cluster = event.data?.cluster;
    const validCluster = typeof cluster === 'string' && cluster ? cluster : undefined;
    if (event.data?.type === 'token-refreshed') {
      dispatchCredentialsChanged(validCluster);
      return;
    }
    resetAccessibleNamespacesLocally(validCluster);
  };
}

/**
 * Reconnects cookie-authenticated transports after the backend refreshes an
 * OIDC token without clearing cached data for the same identity.
 */
export function notifyTokenRefreshed(cluster?: string) {
  dispatchCredentialsChanged(cluster);
  identityResetChannel?.postMessage({ type: 'token-refreshed', cluster });
}

/**
 * Forgets the namespaces discovered for the previous identity (see
 * lib/k8s/accessibleNamespaces.ts) and makes discovery run again, in this tab
 * and in every other open tab (the authentication cookie is shared).
 *
 * Call it whenever the identity may change: token set or cleared, logout, and
 * OIDC login. Without a cluster it resets every cluster, because the backend
 * may broadcast an OIDC token to sibling clusters.
 *
 * @param cluster - The cluster whose identity changed, or undefined for all.
 */
export function resetAccessibleNamespaces(cluster?: string) {
  const result = resetAccessibleNamespacesLocally(cluster);
  identityResetChannel?.postMessage({ cluster });
  return result;
}
