import { getAppUrl } from '../../../../helpers/getAppUrl';
import { getToken } from '../../../auth';
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
  return fetch(`${getAppUrl()}drain-node`, {
    method: 'POST',
    headers: new Headers({
      Authorization: `Bearer ${getToken(cluster)}`,
      ...JSON_HEADERS,
    }),
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
  return fetch(`${getAppUrl()}drain-node-status?cluster=${cluster}&nodeName=${nodeName}`, {
    method: 'GET',
    headers: new Headers({
      Authorization: `Bearer ${getToken(cluster)}`,
      ...JSON_HEADERS,
    }),
  }).then(response => {
    return response.json().then((data: DrainNodeStatus) => {
      if (!response.ok) {
        throw new Error('Something went wrong');
      }
      return data;
    });
  });
}
