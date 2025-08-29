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
import { loadClusterSettings } from '../../../../helpers/clusterSettings';
import { getHeadlampAPIHeaders } from '../../../../helpers/getHeadlampAPIHeaders';
import { ConfigState } from '../../../../redux/configSlice';
import store from '../../../../redux/stores/store';
import {
  deleteClusterKubeconfig,
  findKubeconfigByClusterName,
  storeStatelessClusterKubeconfig,
} from '../../../../stateless';
import { getCluster, getSelectedClusters } from '../../../cluster';
import { ClusterRequest, clusterRequest, post, request } from './clusterRequests';
import { JSON_HEADERS } from './constants';

/**
 * Test authentication for the given cluster.
 * Will throw an error if the user is not authenticated.
 */
export async function testAuth(cluster = '', namespace = 'default') {
  const spec = { namespace };
  const clusterName = cluster || getCluster();

  return post('/apis/authorization.k8s.io/v1/selfsubjectrulesreviews', { spec }, false, {
    timeout: 5 * 1000,
    cluster: clusterName,
  });
}

/**
 * Checks cluster health
 * Will throw an error if the cluster is not healthy.
 */
export async function testClusterHealth(cluster?: string) {
  const clusterNames = cluster ? [cluster] : getSelectedClusters();

  const healthChecks = clusterNames.map(clusterName => {
    return clusterRequest('/healthz', { isJSON: false, cluster: clusterName }).catch(error => {
      throw new Error(`Cluster ${clusterName} is not healthy: ${error.message}`);
    });
  });

  return Promise.all(healthChecks);
}

export async function setCluster(clusterReq: ClusterRequest) {
  const kubeconfig = clusterReq.kubeconfig;
  const headers = addBackstageAuthHeaders(JSON_HEADERS);

  if (kubeconfig) {
    await storeStatelessClusterKubeconfig(kubeconfig);
    // We just send parsed kubeconfig from the backend to the frontend.
    return request(
      '/parseKubeConfig',
      {
        method: 'POST',
        body: JSON.stringify(clusterReq),
        headers: {
          ...headers,
        },
      },
      false,
      false
    );
  }

  return request(
    '/cluster',
    {
      method: 'POST',
      body: JSON.stringify(clusterReq),
      headers: {
        ...headers,
        ...getHeadlampAPIHeaders(),
      },
    },
    false,
    false
  );
}

/**
 * deleteCluster sends call to backend remove a cluster from the config.
 *
 * Note: Currently, the use for the optional clusterID is only for the clusterID for non-dynamic clusters.
 * It is not needed or used for dynamic clusters.
 * @param cluster
 * @param source
 * @param clusterID
 */
export async function deleteCluster(
  /** The name of the cluster to delete */
  cluster: string,
  /** Whether to remove the kubeconfig file associated with the cluster */
  removeKubeConfig?: boolean,
  /** The ID for a cluster, composed of the kubeconfig path and cluster name */
  clusterID?: string,
  // /** The origin of the cluster, e.g., kubeconfig path */
  kubeconfigOrigin?: string,
  // /** The original name of the cluster, used for kubeconfig clusters */
  originalName?: string
): Promise<{ clusters: ConfigState['clusters'] }> {
  let deleteURL;
  const removeFromKubeConfig = `${!!removeKubeConfig}`; // Convert boolean to string for URL parameter

  // If the clusterID exists and the originalName is provided, and removeKubeConfig is true,
  // the cluster is non dynamic and we need to construct the URL differently to ensure the correct parameters are passed.
  if (clusterID && originalName && removeKubeConfig) {
    // for non dynamic clusters, we need to use the original name as a query parameter to find the actual context in the kubeconfig
    // and remove it from the kubeconfig file.
    deleteURL = `/cluster/${cluster}?removeKubeConfig=${removeFromKubeConfig}&clusterID=${clusterID}&configPath=${kubeconfigOrigin}&originalName=${originalName}`;
  } else {
    // for other clusters we can use the standard delete URL.
    deleteURL = `/cluster/${cluster}`;
  }

  if (cluster) {
    const kubeconfig = await findKubeconfigByClusterName(cluster, clusterID);
    if (kubeconfig !== null) {
      await deleteClusterKubeconfig(cluster, clusterID);
      window.location.reload();
      return { clusters: {} };
    }
  }

  const headers = addBackstageAuthHeaders(JSON_HEADERS);
  return request(
    deleteURL,
    { method: 'DELETE', headers: { ...headers, ...getHeadlampAPIHeaders() } },
    false,
    false
  );
}

/**
 * getClusterDefaultNamespace gives the default namespace for the given cluster.
 *
 * If the checkSettings parameter is true (default), it will check the cluster settings first.
 * Otherwise it will just check the cluster config. This means that if one needs the default
 * namespace that may come from the kubeconfig, call this function with the checkSettings parameter as false.
 *
 * @param cluster The cluster name.
 * @param checkSettings Whether to check the settings for the default namespace (otherwise it just checks the cluster config). Defaults to true.
 *
 * @returns The default namespace for the given cluster.
 */
export function getClusterDefaultNamespace(cluster: string, checkSettings?: boolean): string {
  const includeSettings = checkSettings ?? true;
  let defaultNamespace = '';

  if (!!cluster) {
    if (includeSettings) {
      const clusterSettings = loadClusterSettings(cluster);
      defaultNamespace = clusterSettings?.defaultNamespace || '';
    }

    if (!defaultNamespace) {
      const state = store.getState();
      const clusterDefaultNs: string =
        state.config?.clusters?.[cluster]?.meta_data?.namespace || '';
      defaultNamespace = clusterDefaultNs;
    }
  }

  return defaultNamespace;
}

/**
 * renameCluster sends call to backend to update a field in kubeconfig which
 * is the custom name of the cluster used by the user.
 *
 * Note: Currently, the use for the optional clusterID is only for the clusterID for non-dynamic clusters.
 * It is not needed or used for dynamic clusters.
 * @param cluster
 * @param newClusterName
 * @param source
 * @param clusterID
 */
export async function renameCluster(
  /** The name of the cluster to rename */
  cluster: string,
  /** The new name for the cluster */
  newClusterName: string,
  /** The source of the cluster, either 'kubeconfig' or 'dynamic_cluster' */
  source: string,
  /** The ID for a cluster, composed of the kubeconfig path and cluster name */
  clusterID?: string
) {
  let stateless = false;
  let kubeconfig;
  let renameURL = `/cluster/${cluster}`;

  if (cluster) {
    kubeconfig = await findKubeconfigByClusterName(cluster, clusterID);

    renameURL = `/cluster/${cluster}`;

    if (kubeconfig !== null) {
      stateless = true;
    }
  }

  const headers = addBackstageAuthHeaders(JSON_HEADERS);

  return request(
    renameURL,
    {
      method: 'PUT',
      headers: { ...headers, ...getHeadlampAPIHeaders() },
      body: JSON.stringify({ newClusterName, source, stateless }),
    },
    false,
    false
  );
}

/**
 * parseKubeConfig sends call to backend to parse kubeconfig and send back
 * the parsed clusters and contexts.
 * @param clusterReq - The cluster request object.
 */
export async function parseKubeConfig(clusterReq: ClusterRequest) {
  const kubeconfig = clusterReq.kubeconfig;
  const headers = addBackstageAuthHeaders(JSON_HEADERS);

  if (kubeconfig) {
    return request(
      '/parseKubeConfig',
      {
        method: 'POST',
        body: JSON.stringify(clusterReq),
        headers: {
          ...headers,
          ...getHeadlampAPIHeaders(),
        },
      },
      false,
      false
    );
  }

  return null;
}
