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

// @todo: Params is a confusing name for options, because params are also query params.

import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import store from '../../../../redux/stores/store';
import { findKubeconfigByClusterName, getUserIdFromLocalStorage } from '../../../../stateless';
import { getToken, logout, setToken } from '../../../auth';
import { getCluster } from '../../../cluster';
import { KubeObjectInterface } from '../../KubeObject';
import { ApiError } from '../v2/ApiError';
import { BASE_HTTP_URL, CLUSTERS_PREFIX, DEFAULT_TIMEOUT, JSON_HEADERS } from './constants';
import { asQuery, combinePath } from './formatUrl';
import { QueryParameters } from './queryParameters';
import { refreshToken } from './tokenApi';

/**
 * Options for the request.
 */
export interface RequestParams extends RequestInit {
  /** Number of milliseconds to wait for a response. */
  timeout?: number;
  /** Is the request expected to receive JSON data? */
  isJSON?: boolean;
  /** Cluster context name. */
  cluster?: string | null;
  /** Whether to automatically log out the user if there is an authentication error. */
  autoLogoutOnAuthError?: boolean;
}

export interface ClusterRequest {
  /** The name of the cluster (has to be unique, or it will override an existing cluster) */
  name?: string;
  /** The cluster URL */
  server?: string;
  /** Whether the server's certificate should not be checked for validity */
  insecureTLSVerify?: boolean;
  /** The certificate authority data */
  certificateAuthorityData?: string;
  /** KubeConfig (base64 encoded)*/
  kubeconfig?: string;
}

/**
 * The options for `clusterRequest`.
 */
export interface ClusterRequestParams extends RequestParams {
  cluster?: string | null;
  autoLogoutOnAuthError?: boolean;
}

/**
 * @returns Auth type of the cluster, or an empty string if the cluster is not found.
 * It could return 'oidc' or '' for example.
 *
 * @param cluster - Name of the cluster.
 */
export function getClusterAuthType(cluster: string): string {
  const state = store.getState();
  const authType: string = state.config?.clusters?.[cluster]?.['auth_type'] || '';
  return authType;
}

/**
 * Sends a request to the backend. If the useCluster parameter is true (which it is, by default), it will be
 * treated as a request to the Kubernetes server of the currently defined (in the URL) cluster.
 *
 * @param path - The path to the API endpoint.
 * @param params - Optional parameters for the request.
 * @param autoLogoutOnAuthError - Whether to automatically log out the user if there is an authentication error.
 * @param useCluster - Whether to use the current cluster for the request.
 * @param queryParams - Optional query parameters for the request.
 *
 * @returns A Promise that resolves to the JSON response from the API server.
 * @throws An ApiError if the response status is not ok.
 */
export async function request(
  path: string,
  params: RequestParams = {},
  autoLogoutOnAuthError: boolean = true,
  useCluster: boolean = true,
  queryParams?: QueryParameters
): Promise<any> {
  // @todo: This is a temporary way of getting the current cluster. We should improve it later.
  const cluster = (useCluster && getCluster()) || '';

  if (isDebugVerbose('k8s/apiProxy@request')) {
    console.debug('k8s/apiProxy@request', { path, params, useCluster, queryParams });
  }

  return clusterRequest(path, { cluster, autoLogoutOnAuthError, ...params }, queryParams);
}

/**
 * Sends a request to the backend. If the cluster is required in the params parameter, it will
 * be used as a request to the respective Kubernetes server.
 *
 * @param path - The path to the API endpoint.
 * @param params - Optional parameters for the request.
 * @param queryParams - Optional query parameters for the k8s request.
 *
 * @returns A Promise that resolves to the JSON response from the API server.
 * @throws An ApiError if the response status is not ok.
 */
export async function clusterRequest(
  path: string,
  params: ClusterRequestParams = {},
  queryParams?: QueryParameters
): Promise<any> {
  interface RequestHeaders {
    Authorization?: string;
    cluster?: string;
    autoLogoutOnAuthError?: boolean;
    [otherHeader: string]: any;
  }

  const {
    timeout = DEFAULT_TIMEOUT,
    cluster: paramsCluster,
    autoLogoutOnAuthError = true,
    isJSON = true,
    ...otherParams
  } = params;

  const userID = getUserIdFromLocalStorage();
  const opts: { headers: RequestHeaders } = Object.assign({ headers: {} }, otherParams);
  const cluster = paramsCluster || '';

  let fullPath = path;
  if (cluster) {
    const token = getToken(cluster);
    const kubeconfig = await findKubeconfigByClusterName(cluster);
    if (kubeconfig !== null) {
      opts.headers['KUBECONFIG'] = kubeconfig;
      opts.headers['X-HEADLAMP-USER-ID'] = userID;
    }

    // Refresh service account token only if the cluster auth type is not OIDC
    if (getClusterAuthType(cluster) !== 'oidc') {
      await refreshToken(token);
    }

    if (!!token) {
      opts.headers.Authorization = `Bearer ${token}`;
    }

    fullPath = combinePath(`/${CLUSTERS_PREFIX}/${cluster}`, path);
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  let url = combinePath(BASE_HTTP_URL, fullPath);
  url += asQuery(queryParams);
  const requestData = { signal: controller.signal, ...opts };
  let response: Response = new Response(undefined, { status: 502, statusText: 'Unreachable' });
  try {
    response = await fetch(url, requestData);
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        response = new Response(undefined, { status: 408, statusText: 'Request timed-out' });
      }
    }
  } finally {
    clearTimeout(id);
  }

  // The backend signals through this header that it wants a reload.
  // See plugins.go
  const headerVal = response.headers.get('X-Reload');
  if (headerVal && headerVal.indexOf('reload') !== -1) {
    window.location.reload();
  }

  // In case of OIDC auth if the token is about to expire the backend
  // sends a refreshed token in the response header.
  const newToken = response.headers.get('X-Authorization');
  if (newToken) {
    setToken(cluster, newToken);
  }

  if (!response.ok) {
    const { status, statusText } = response;
    if (autoLogoutOnAuthError && status === 401 && opts.headers.Authorization) {
      console.error('Logging out due to auth error', { status, statusText, path });
      logout();
    }

    let message = statusText;
    try {
      if (isJSON) {
        const json = await response.json();
        message += ` - ${json.message}`;
      }
    } catch (err) {
      console.error(
        'Unable to parse error json at url:',
        url,
        { err },
        'with request data:',
        requestData
      );
    }

    const error = new Error(message) as ApiError;
    error.status = status;
    return Promise.reject(error);
  }

  if (!isJSON) {
    return Promise.resolve(response);
  }

  return response.json();
}

export function post(
  url: string,
  json: JSON | object | KubeObjectInterface,
  autoLogoutOnAuthError: boolean = true,
  options: ClusterRequestParams = {}
) {
  const { cluster: clusterName, ...requestOptions } = options;
  const body = JSON.stringify(json);
  const cluster = clusterName || getCluster() || '';
  return clusterRequest(url, {
    method: 'POST',
    body,
    headers: JSON_HEADERS,
    cluster,
    autoLogoutOnAuthError,
    ...requestOptions,
  });
}

export function patch(
  url: string,
  json: any,
  autoLogoutOnAuthError = true,
  options: ClusterRequestParams = {}
) {
  const { cluster: clusterName, ...requestOptions } = options;
  const body = JSON.stringify(json);
  const cluster = clusterName || getCluster() || '';
  const opts = {
    method: 'PATCH',
    body,
    headers: { ...JSON_HEADERS, 'Content-Type': 'application/merge-patch+json' },
    autoLogoutOnAuthError,
    cluster,
    ...requestOptions,
  };
  return clusterRequest(url, opts);
}

export function put(
  url: string,
  json: Partial<KubeObjectInterface>,
  autoLogoutOnAuthError = true,
  requestOptions: ClusterRequestParams = {}
) {
  const body = JSON.stringify(json);
  const { cluster: clusterName, ...restOptions } = requestOptions;
  const opts = {
    method: 'PUT',
    body,
    headers: JSON_HEADERS,
    autoLogoutOnAuthError,
    cluster: clusterName || getCluster() || '',
    ...restOptions,
  };
  return clusterRequest(url, opts);
}

export function remove(url: string, requestOptions: ClusterRequestParams = {}) {
  console.log(url, requestOptions);
  const { cluster: clusterName, ...restOptions } = requestOptions;
  const cluster = clusterName || getCluster() || '';
  const opts = { method: 'DELETE', headers: JSON_HEADERS, cluster, ...restOptions };
  return clusterRequest(url, opts);
}

// @todo: apiEndpoint.put has a type of any, which needs improving.
