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

import { getHeadlampAPIHeaders } from '../helpers/getHeadlampAPIHeaders';
import store from '../redux/stores/store';
import { backendFetch } from './k8s/api/v2/fetch';
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
 * @returns The decoded user information from the token's payload.
 */
export function getUserInfo(cluster: string) {
  const user = getToken(cluster)?.split('.')[1];
  if (user) {
    return JSON.parse(atob(user));
  }
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

/**
 * Sets token to the cookie via backend
 *
 * @param cluster
 * @param token
 * @returns
 */
async function setCookieToken(cluster: string, token: string | null) {
  try {
    const response = await backendFetch(`/clusters/${cluster}/set-token`, {
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

  return setCookieToken(cluster, token);
}

/**
 * Logs out the user by clearing the authentication token for the specified cluster.
 *
 * @param cluster - The name of the cluster to log out from.
 * @throws {Error} When logout request fails
 */
export async function logout(cluster: string) {
  return setToken(cluster, null).then(() => {
    queryClient.removeQueries({ queryKey: ['auth'], exact: false });
  });
}

/**
 * Deletes all stored authentication tokens
 *
 * @returns {void}
 */
export function deleteTokens() {
  const clusters = Object.keys(store.getState().config.allClusters ?? {});
  return Promise.all(clusters.map(cluster => logout(cluster)));
}
