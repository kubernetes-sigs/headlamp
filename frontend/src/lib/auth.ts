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
import { backendFetch } from './k8s/api/v2/fetch';

/**
 * Sets token to the cookie via backend
 *
 * @param cluster
 * @param token
 * @returns
 */
async function setCookieToken(cluster: string, token: string | null) {
  try {
    const response = await backendFetch('/auth/set-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeadlampAPIHeaders(),
      },
      body: JSON.stringify({ cluster: cluster.trim(), token }),
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
  return setCookieToken(cluster, token);
}

/**
 * Logs out the user by clearing the authentication token for the specified cluster.
 *
 * @param cluster - The name of the cluster to log out from.
 * @throws {Error} When logout request fails
 */
export async function logout(cluster: string) {
  return setToken(cluster, null);
}
