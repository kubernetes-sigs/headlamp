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

import { getAppUrl } from '../../../../helpers/getAppUrl';
import { findKubeconfigByClusterName, getUserIdFromLocalStorage } from '../../../../stateless';
import { getToken, setToken } from '../../../auth';
import { getClusterAuthType } from '../v1/clusterRequests';
import { refreshToken } from '../v1/tokenApi';
import { ApiError } from './ApiError';
import { makeUrl } from './makeUrl';

export const BASE_HTTP_URL = getAppUrl();

/**
 * Simple wrapper around Fetch function
 * Sends a request to the backend
 *
 * @param url - URL path
 * @param init - options parameter for the Fetch function
 *
 * @returns fetch Response
 */
async function backendFetch(url: string | URL, init: RequestInit) {
  const response = await fetch(makeUrl([BASE_HTTP_URL, url]), init);

  // The backend signals through this header that it wants a reload.
  // See plugins.go
  const headerVal = response.headers.get('X-Reload');
  if (headerVal && headerVal.indexOf('reload') !== -1) {
    window.location.reload();
  }

  if (!response.ok) {
    // Try to parse error message from response
    let maybeErrorMessage: string | undefined;
    try {
      const body = await response.json();
      maybeErrorMessage = body.message;
    } catch (e) {}

    throw new ApiError(maybeErrorMessage ?? 'Unreachable', { status: response.status });
  }

  return response;
}

/**
 * A wrapper around Fetch function
 * Allows sending requests to a particular cluster
 *
 * @param url - URL path
 * @param init - same as second parameter of the Fetch function
 * @param init.cluster - name of the cluster
 *
 * @returns fetch Response
 */
export async function clusterFetch(url: string | URL, init: RequestInit & { cluster: string }) {
  const token = getToken(init.cluster);

  init.headers = new Headers(init.headers);

  // Set stateless kubeconfig if exists
  const kubeconfig = await findKubeconfigByClusterName(init.cluster);
  if (kubeconfig !== null) {
    const userID = getUserIdFromLocalStorage();
    init.headers.set('KUBECONFIG', kubeconfig);
    init.headers.set('X-HEADLAMP-USER-ID', userID);
  }

  // Refresh service account token only if the cluster auth type is not OIDC
  if (getClusterAuthType(init.cluster) !== 'oidc') {
    await refreshToken(token);
  }

  if (token) {
    init.headers.set('Authorization', `Bearer ${token}`);
  }

  const urlParts = init.cluster ? ['clusters', init.cluster, url] : [url];

  try {
    const response = await backendFetch(makeUrl(urlParts), init);
    // In case of OIDC auth if the token is about to expire the backend
    // sends a refreshed token in the response header.
    const newToken = response.headers.get('X-Authorization');
    if (newToken && init.cluster) {
      setToken(init.cluster, newToken);
    }

    return response;
  } catch (e) {
    if (e instanceof ApiError) {
      e.cluster = init.cluster;
    }
    throw e;
  }
}
