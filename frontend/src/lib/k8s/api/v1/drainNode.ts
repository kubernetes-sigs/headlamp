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
import { getHeadlampAPIHeaders } from '../../../../helpers/getHeadlampAPIHeaders';
import type Node from '../../node';
import { getDiscoveredConnectionRevision } from '../v2/discoveredConnectionRevisions';
import {
  bindDiscoveryConnection,
  getDiscoveryRequestBinding,
  getResourceConnectionQuery,
} from '../v2/discoveryConnection';
import { clusterFetch } from '../v2/fetch';
import { JSON_HEADERS } from './constants';
import { asQuery } from './formatUrl';
import type { QueryParameters } from './queryParameters';

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
  const query = bindDiscoveryConnection({}, getDiscoveredConnectionRevision(cluster));
  return requestNodeDrain(cluster, nodeName, query);
}

export async function drainNodeForResource(cluster: string, node: Node, revision?: string) {
  const query = getResourceConnectionQuery(node, cluster, bindDiscoveryConnection({}, revision));
  return requestNodeDrain(cluster, node.getName(), query);
}

function requestNodeDrain(cluster: string, nodeName: string, query?: QueryParameters) {
  const headers = new Headers(addBackstageAuthHeaders(JSON_HEADERS));
  Object.entries(getHeadlampAPIHeaders()).forEach(([name, value]) => headers.set(name, value));

  return clusterFetch('/drain-node' + asQuery(query), {
    cluster,
    expectedDiscoveryConnection: getDiscoveryRequestBinding(query),
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

/**
 * Represents the current status of a node drain operation.
 */
interface DrainNodeStatus {
  /** Status of the drain operation (e.g., 'success' or an 'error: ...' message). */
  id: string;
  /** The name of the cluster where the node is being drained. */
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
 * @returns A promise that resolves to the current status of the drain node process.
 * @throws {Error} if the request fails
 * @throws {Error} if the response is not ok
 */
export function drainNodeStatus(cluster: string, nodeName: string): Promise<DrainNodeStatus> {
  const query = bindDiscoveryConnection({ nodeName }, getDiscoveredConnectionRevision(cluster));
  return requestNodeDrainStatus(cluster, query);
}

export async function drainNodeStatusForResource(cluster: string, node: Node, revision?: string) {
  const params = bindDiscoveryConnection({ nodeName: node.getName() }, revision);
  return requestNodeDrainStatus(cluster, getResourceConnectionQuery(node, cluster, params));
}

function requestNodeDrainStatus(cluster: string, query: Record<string, string>) {
  const headers = new Headers(addBackstageAuthHeaders(JSON_HEADERS));
  Object.entries(getHeadlampAPIHeaders()).forEach(([name, value]) => headers.set(name, value));
  return clusterFetch(`/drain-node-status?${new URLSearchParams(query)}`, {
    cluster,
    expectedDiscoveryConnection: getDiscoveryRequestBinding(query),
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
