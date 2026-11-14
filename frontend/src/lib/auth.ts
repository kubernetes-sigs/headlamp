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

/*
 * This module was taken from the k8dash project.
 */

import { Base64 } from 'js-base64';
import { getHeadlampAPIHeaders } from '../helpers/getHeadlampAPIHeaders';
import store from '../redux/stores/store';
import { backendFetch } from './k8s/api/v2/fetch';
import { canLogoutFromProvider } from './k8s/clusterAuthType';
import { encodeClusterPath, redirectToOIDCLogout } from './oidcLogout';
import { queryClient } from './queryClient';

/**
 * Retrieves the authentication token for a given cluster.
 * If a custom getToken method is defined in the Redux store, it will be used.
 * Otherwise, the token is retrieved from local storage.
 *
 * Important! This will only work if plugins have overriden getToken function!
 * By default tokens are stored in httpOnly cookies and not available from JS
 *
 * @param cluster - The name of the cluster.
 * @returns The authentication token for the specified cluster, or undefined if not set.
 */
export function getToken(cluster: string) {
  const getTokenMethodToUse = store.getState().ui.functionsToOverride.getToken;
  const tokenMethodToUse = getTokenMethodToUse ?? (() => undefined);
  return tokenMethodToUse(cluster);
}

/**
 * Retrieves the user information encoded in the authentication token for a given cluster.
 *
 * Important! This will only work if plugins have overriden getToken function!
 * By default tokens are stored in httpOnly cookies and not available from JS
 *
 * @param cluster - The name of the cluster.
 * @returns The decoded user information from the token's payload, or null if the token is invalid or missing.
 */
export function getUserInfo(cluster: string): Record<string, unknown> | null {
  const user = getToken(cluster)?.split('.')[1];
  if (user) {
    try {
      const parsed = JSON.parse(Base64.decode(user));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (e) {
      console.error('Error parsing user info:', e);
    }
  }
  return null;
}

/**
 * Checks whether an authentication token exists for the given cluster.
 *
 * Important! This will only work if plugins have overriden getToken function!
 * By default tokens are stored in httpOnly cookies and not available from JS
 *
 * @param cluster - The name of the cluster.
 * @returns True if a token exists, false otherwise.
 */
export function hasToken(cluster: string) {
  return !!getToken(cluster);
}

/** How long to wait for the cached refresh token cleanup before logging out anyway. */
const CLEAR_REFRESH_TOKEN_TIMEOUT_MS = 3000;

/**
 * Encodes a cluster name for a `/clusters/<cluster>` path that has to match the auth cookie path.
 *
 * The backend scopes the cookie to the raw cluster name (see GetCookiePath), and browsers do not
 * percent-decode the request path when matching it. The sub-delimiters ("$&+,;=") and ":" and
 * "@" are valid in a path segment and stay as they are; everything else is encoded.
 *
 * @param cluster - The name of the cluster.
 */
function encodeClusterForCookiePath(cluster: string) {
  return encodeURIComponent(cluster).replace(/%(?:24|26|2B|2C|3B|3D|3A|40)/gi, decodeURIComponent);
}

/**
 * Asks the backend to drop the cached OIDC refresh token for the cluster's auth cookie.
 *
 * This has to run before the cookie is cleared and on a route under `/clusters/<cluster>`,
 * because the browser only sends the cookie to that path. It is best effort: a failure must not
 * block logout, since the cached entry expires on its own. The request is aborted after
 * CLEAR_REFRESH_TOKEN_TIMEOUT_MS so a stalled backend cannot hold up clearing the cookie.
 *
 * @param cluster - The name of the cluster being logged out.
 */
async function clearCachedRefreshToken(cluster: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLEAR_REFRESH_TOKEN_TIMEOUT_MS);

  try {
    await backendFetch(`/clusters/${encodeClusterForCookiePath(cluster)}/clear-refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeadlampAPIHeaders(),
      },
      signal: controller.signal,
    });
  } catch (error) {
    console.error('Error clearing cached refresh token:', error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sets token to the cookie via backend
 *
 * @param cluster
 * @param token
 * @returns
 */
async function setCookieToken(cluster: string, token: string | null) {
  if (!token) {
    await clearCachedRefreshToken(cluster);
  }

  try {
    const endpoint = token
      ? `/clusters/${encodeURIComponent(cluster)}/set-token`
      : `/encoded-clusters/${encodeClusterPath(cluster)}/clear-token`;
    const response = await backendFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeadlampAPIHeaders(),
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error(`Failed to set cookie token`);
    }
    return true;
  } catch (error) {
    console.error('Error setting cookie token:', error);
    throw error;
  }
}

/**
 * Sets or updates the token for a given cluster using cookie-based storage.
 * The token is stored securely in an HttpOnly cookie on the backend.
 *
 * @param cluster - The name of the cluster.
 * @param token - The authentication token to set. Pass null to clear the token.
 * @throws {Error} When cluster name is invalid or backend request fails
 */
export function setToken(cluster: string, token: string | null) {
  const setTokenMethodToUse = store.getState().ui.functionsToOverride.setToken;
  if (setTokenMethodToUse) {
    return Promise.resolve(setTokenMethodToUse(cluster, token));
  }

  return setCookieToken(cluster, token).then(result => {
    if (token) {
      queryClient.invalidateQueries({ queryKey: ['clusterMe', cluster], exact: true });
    } else {
      queryClient.removeQueries({ queryKey: ['clusterMe', cluster], exact: true });
    }

    return result;
  });
}

/**
 * Logs out the user by clearing the authentication token for the specified cluster.
 * For OIDC clusters, redirects to the IdP logout endpoint to properly end the session.
 *
 * @param cluster - The name of the cluster to log out from.
 * @param skipRedirect - If true, skip the OIDC logout redirect (caller handles navigation).
 * @returns {Promise<void>}
 * @throws {Error} When logout request fails
 */
export async function logout(cluster: string, skipRedirect = false): Promise<void> {
  // For OIDC auth, redirect to the backend OIDC logout endpoint which will
  // redirect to the IdP's end_session_endpoint to properly terminate the session.
  if (canLogoutFromProvider(cluster)) {
    // Clear local state first
    queryClient.removeQueries({ queryKey: ['auth'], exact: false });
    queryClient.removeQueries({ queryKey: ['clusterMe', cluster], exact: true });

    // Clear the cluster auth cookie before redirecting (cookie path is cluster-scoped).
    try {
      await setToken(cluster, null);
    } catch (error) {
      if (skipRedirect) {
        throw error;
      }
    }

    if (skipRedirect) {
      return;
    }

    await redirectToOIDCLogout(cluster);
    return;
  }

  await setToken(cluster, null);
  queryClient.removeQueries({ queryKey: ['auth'], exact: false });
  queryClient.removeQueries({ queryKey: ['clusterMe', cluster], exact: true });
}

/**
 * Deletes all stored authentication tokens
 *
 * @returns {Promise<void[]>}
 */
export async function deleteTokens(): Promise<void[]> {
  const clusters = Object.keys(store.getState().config.allClusters ?? {});

  const oidcClusterToRedirect = clusters.find(canLogoutFromProvider);
  const results = await Promise.allSettled(clusters.map(cluster => logout(cluster, true)));

  if (oidcClusterToRedirect) {
    await redirectToOIDCLogout(oidcClusterToRedirect);
  }

  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' && clusters[index] !== oidcClusterToRedirect ? [result.reason] : []
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to clear one or more cluster tokens');
  }

  return results.map(() => undefined);
}
