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
import { getToken } from '../../../auth';
import { JSON_HEADERS } from './constants';

// @todo: the return type is missing for the following functions.
//       See PortForwardState in PortForward.tsx

export interface PortForward {
  id: string;
  pod: string;
  service: string;
  serviceNamespace: string;
  namespace: string;
  cluster: string;
  port: string;
  targetPort: string;
  status?: string;
  error?: string;
}

export interface PortForwardRequest {
  id: string;
  namespace: string;
  pod: string;
  service: string;
  serviceNamespace: string;
  targetPort: string;
  cluster: string;
  port?: string;
  address?: string;
}

/**
 * Starts a portforward with the given details.
 *
 * @param cluster - The cluster to portforward for.
 * @param namespace - The namespace to portforward for.
 * @param podname - The pod to portforward for.
 * @param containerPort - The container port to portforward for.
 * @param service - The service to portforward for.
 * @param serviceNamespace - The service namespace to portforward for.
 * @param port - The port to portforward for.
 * @param id - The id to portforward for.
 *
 * @returns The response from the API.
 * @throws {Error} if the request fails.
 */
export async function startPortForward(
  cluster: string,
  namespace: string,
  podname: string,
  containerPort: number | string,
  service: string,
  serviceNamespace: string,
  port?: string,
  address: string = '',
  id: string = ''
): Promise<PortForward> {
  const kubeconfig = await findKubeconfigByClusterName(cluster);
  const headers: HeadersInit = {
    Authorization: `Bearer ${getToken(cluster)}`,
    ...JSON_HEADERS,
  };

  // This means cluster is dynamically configured.
  if (kubeconfig !== null) {
    headers['X-HEADLAMP-USER-ID'] = getUserIdFromLocalStorage();
  }

  const request: PortForwardRequest = {
    cluster,
    namespace,
    pod: podname,
    service,
    targetPort: containerPort.toString(),
    serviceNamespace,
    id: id,
    address,
    port,
  };
  return fetch(`${getAppUrl()}portforward`, {
    method: 'POST',
    headers: new Headers(headers),
    body: JSON.stringify(request),
  }).then(async (response: Response) => {
    const contentType = response.headers.get('content-type');

    // Check if the response is JSON
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Error starting port forward');
      }
      return data;
    } else {
      // Handle text/plain or other response types because we can get error in text format
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || 'Error starting port forward');
      }
      // If successful but not JSON, try to parse it as JSON anyway
      try {
        return JSON.parse(text);
      } catch {
        // If it's not JSON, return a basic structure
        throw new Error('Invalid response format from server');
      }
    }
  });
}

// @todo: stopOrDelete true is confusing, rename this param to justStop?
/**
 * Stops or deletes a portforward with the specified details.
 *
 * @param cluster - The cluster to portforward for.
 * @param id - The id to portforward for.
 * @param stopOrDelete - Whether to stop or delete the portforward. True for stop, false for delete.
 *
 * @returns The response from the API.
 * @throws {Error} if the request fails.
 */
export async function stopOrDeletePortForward(
  cluster: string,
  id: string,
  stopOrDelete: boolean = true
): Promise<string> {
  const kubeconfig = await findKubeconfigByClusterName(cluster);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // This means cluster is dynamically configured.
  if (kubeconfig !== null) {
    headers['X-HEADLAMP-USER-ID'] = getUserIdFromLocalStorage();
  }

  return fetch(`${getAppUrl()}portforward`, {
    method: 'DELETE',
    body: JSON.stringify({
      cluster,
      id,
      stopOrDelete,
    }),
  }).then(async response => {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || 'Error deleting port forward');
    }
    return text;
  });
}

// @todo: needs a return type.

/**
 * Lists the port forwards for the specified cluster.
 *
 * @param cluster - The cluster to list the port forwards.
 *
 * @returns the list of port forwards for the cluster.
 */
export async function listPortForward(cluster: string): Promise<PortForward[]> {
  const kubeconfig = await findKubeconfigByClusterName(cluster);
  const headers: HeadersInit = {};

  // This means cluster is dynamically configured.
  if (kubeconfig !== null) {
    headers['X-HEADLAMP-USER-ID'] = getUserIdFromLocalStorage();
  }

  return fetch(`${getAppUrl()}portforward/list?cluster=${cluster}`, {
    headers: new Headers(headers),
  }).then(response => response.json());
}
