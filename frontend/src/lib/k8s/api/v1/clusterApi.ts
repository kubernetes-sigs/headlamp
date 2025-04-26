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

  if (kubeconfig) {
    await storeStatelessClusterKubeconfig(kubeconfig);
    // We just send parsed kubeconfig from the backend to the frontend.
    return request(
      '/parseKubeConfig',
      {
        method: 'POST',
        body: JSON.stringify(clusterReq),
        headers: {
          ...JSON_HEADERS,
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
        ...JSON_HEADERS,
        ...getHeadlampAPIHeaders(),
      },
    },
    false,
    false
  );
}

// @todo: needs documenting.

export async function deleteCluster(
  cluster: string
): Promise<{ clusters: ConfigState['clusters'] }> {
  if (cluster) {
    const kubeconfig = await findKubeconfigByClusterName(cluster);
    if (kubeconfig !== null) {
      await deleteClusterKubeconfig(cluster);
      window.location.reload();
      return { clusters: {} };
    }
  }

  return request(
    `/cluster/${cluster}`,
    { method: 'DELETE', headers: { ...getHeadlampAPIHeaders() } },
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
 * @param cluster
 */
export async function renameCluster(cluster: string, newClusterName: string, source: string) {
  let stateless = false;
  if (cluster) {
    const kubeconfig = await findKubeconfigByClusterName(cluster);
    if (kubeconfig !== null) {
      stateless = true;
    }
  }

  return request(
    `/cluster/${cluster}`,
    {
      method: 'PUT',
      headers: { ...getHeadlampAPIHeaders() },
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

  if (kubeconfig) {
    return request(
      '/parseKubeConfig',
      {
        method: 'POST',
        body: JSON.stringify(clusterReq),
        headers: {
          ...JSON_HEADERS,
          ...getHeadlampAPIHeaders(),
        },
      },
      false,
      false
    );
  }

  return null;
}
