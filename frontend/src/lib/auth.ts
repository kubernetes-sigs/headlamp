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

import store from '../redux/stores/store';

/**
 * Retrieves the token for a specific cluster.
 * It first checks if a custom token retrieval method is defined in the Redux store.
 * If not, it falls back to retrieving the token from local storage.
 * @param cluster - The name of the cluster.
 * @returns The token string for the specified cluster, or undefined if not found.
 */
export function getToken(cluster: string) {
  const getTokenMethodToUse = store.getState().ui.functionsToOverride.getToken;
  const tokenMethodToUse =
    getTokenMethodToUse ||
    function () {
      return getTokens()[cluster];
    };
  return tokenMethodToUse(cluster);
}

/**
 * Decodes the JWT token for a specific cluster and returns the user information contained within it.
 * Assumes the token is a JWT and extracts the payload.
 * @param cluster - The name of the cluster for which to get user information.
 * @returns The parsed user information object from the token's payload.
 * @throws Error if the token is not a valid JWT or cannot be parsed.
 */
export function getUserInfo(cluster: string) {
  const token = getToken(cluster);
  if (!token) {
    // Or handle this case as per your application's requirements,
    // e.g., return null or throw a more specific error.
    console.warn(`No token found for cluster: ${cluster}`);
    return null;
  }
  const user = token.split('.')[1];
  if (!user) {
    throw new Error(`Invalid token structure for cluster: ${cluster}`);
  }
  return JSON.parse(atob(user));
}

/**
 * Checks if a token exists for a specific cluster.
 * @param cluster - The name of the cluster to check.
 * @returns True if a token exists for the cluster, false otherwise.
 */
export function hasToken(cluster: string) {
  return !!getToken(cluster);
}

/**
 * Retrieves all tokens from local storage.
 * @returns An object where keys are cluster names and values are their tokens.
 *          Returns an empty object if no tokens are found in local storage.
 */
function getTokens() {
  return JSON.parse(localStorage.tokens || '{}');
}

/**
 * Sets a token for a specific cluster.
 * It first checks if a custom token setting method is defined in the Redux store.
 * If a custom method exists, it's used. Otherwise, the token is stored in local storage.
 * If the token is null, it effectively removes the token for that cluster from local storage.
 * @param cluster - The name of the cluster.
 * @param token - The token string to set, or null to remove the token.
 */
export function setToken(cluster: string, token: string | null) {
  const setTokenMethodToUse = store.getState().ui.functionsToOverride.setToken;
  if (setTokenMethodToUse) {
    setTokenMethodToUse(cluster, token);
  } else {
    const tokens = getTokens();
    tokens[cluster] = token;
    localStorage.tokens = JSON.stringify(tokens);
  }
}

/**
 * Deletes all tokens from local storage.
 * This effectively logs out the user from all clusters if tokens are only stored in localStorage.
 */
export function deleteTokens() {
  delete localStorage.tokens;
}

/**
 * Logs out the user by deleting all tokens.
 * This is a convenience function that calls {@link deleteTokens}.
 */
export function logout() {
  deleteTokens();
}
