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

import { addBackstageAuthHeaders } from '../../../../helpers/addBackstageAuthHeaders';
import { backendFetch } from '../v2/fetch';
import { JSON_HEADERS } from './constants';

/**
 * Drain a node
 *
 * @param cluster - The cluster to drain the node
 * @param nodeName - The node name to drain
 *
 * @returns {Promise<JSON>}
 * @throws {Error} if the request fails
 * @throws {Error} if the response is not ok
 *
 * This function is used to drain a node. It is used in the node detail page.
 * As draining a node is a long running process, we get the request received
 * message if the request is successful. And then we poll the drain node status endpoint
 * to get the status of the drain node process.
 */
export function drainNode(cluster: string, nodeName: string) {
  const headers = addBackstageAuthHeaders(JSON_HEADERS);

  return backendFetch('/drain-node', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      cluster,
      nodeName,
    }),
  }).then(response => {
    return response.json().then(data => {
      if (!response.ok) {
        throw new Error('Something went wrong');
      }
      return data;
    });
  });
}

// @todo: needs documenting.

interface DrainNodeStatus {
  id: string; //@todo: what is this and what is it for?
  cluster: string;
}

/**
 * Get the status of the drain node process.
 *
 * It is used in the node detail page.
 * As draining a node is a long running process, we poll this endpoint to get
 * the status of the drain node process.
 *
 * @param cluster - The cluster to get the status of the drain node process for.
 * @param nodeName - The node name to get the status of the drain node process for.
 *
 * @returns - The response from the API. @todo: what response?
 * @throws {Error} if the request fails
 * @throws {Error} if the response is not ok
 */
export function drainNodeStatus(cluster: string, nodeName: string): Promise<DrainNodeStatus> {
  const headers = addBackstageAuthHeaders(JSON_HEADERS);
  return backendFetch(`/drain-node-status?cluster=${cluster}&nodeName=${nodeName}`, {
    method: 'GET',
    headers: headers,
  }).then(response => {
    return response.json().then((data: DrainNodeStatus) => {
      if (!response.ok) {
        throw new Error('Something went wrong');
      }
      return data;
    });
  });
}
