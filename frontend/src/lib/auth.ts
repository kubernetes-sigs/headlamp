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
 * Retrieves the authentication token for a given cluster.
 * If a custom getToken method is defined in the Redux store, it will be used.
 * Otherwise, the token is retrieved from local storage.
 *
 * @param cluster - The name of the cluster.
 * @returns The authentication token for the specified cluster, or undefined if not set.
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
 * Retrieves the user information encoded in the authentication token for a given cluster.
 *
 * @param cluster - The name of the cluster.
 * @returns The decoded user information from the token's payload.
 */
export function getUserInfo(cluster: string) {
  const user = getToken(cluster).split('.')[1];
  return JSON.parse(atob(user));
}

/**
 * Checks whether an authentication token exists for the given cluster.
 *
 * @param cluster - The name of the cluster.
 * @returns True if a token exists, false otherwise.
 */
export function hasToken(cluster: string) {
  return !!getToken(cluster);
}

/**
 * Retrieves all stored cluster authentication tokens from local storage.
 *
 * @returns An object mapping cluster names to their tokens.
 */
function getTokens() {
  return JSON.parse(localStorage.tokens || '{}');
}

/**
 * Sets or updates the token for a given cluster.
 * If a custom setToken method is defined in the Redux store, it will be used.
 * Otherwise, the token is stored in local storage.
 *
 * @param cluster - The name of the cluster.
 * @param token - The authentication token to set.
 * @returns {void}
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
 * Deletes all stored authentication tokens from local storage.
 *
 * @returns {void}
 */
export function deleteTokens() {
  delete localStorage.tokens;
}

/**
 * Logs out the user by deleting all tokens.
 *
 * @returns {void}
 */
export function logout() {
  deleteTokens();
}
