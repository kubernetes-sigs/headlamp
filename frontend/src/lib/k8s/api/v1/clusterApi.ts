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
import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { getHeadlampAPIHeaders } from '../../../../helpers/getHeadlampAPIHeaders';
import type { ConfigState } from '../../../../redux/configSlice';
import store from '../../../../redux/stores/store';
import { storeStatelessClusterKubeconfig } from '../../../../stateless';
import { deleteClusterKubeconfig } from '../../../../stateless/deleteClusterKubeconfig';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getCluster, getSelectedClusters } from '../../../cluster';
import { ApiError } from '../v2/ApiError';
import type { ClusterRequest } from './clusterRequests';
import { clusterRequest, post, request } from './clusterRequests';
import { JSON_HEADERS } from './constants';

/**
 * Test authentication for the given cluster.
 * Will throw an error if the user is not authenticated.
 *
 * For OIDC clusters (auth_type === 'oidc'), this calls the headlamp-server
 * `/clusters/{cluster}/me` endpoint, which validates the per-cluster auth
 * cookie. The handler is implemented at backend/pkg/auth/auth.go HandleMe;
 * it returns 401 with `{"message": "unauthorized"}` (or "token expired")
 * when the cookie is missing, malformed, or its embedded JWT cannot be
 * verified, and otherwise returns `{"username": ..., "email": ..., ...}`
 * with the JMESPath-extracted username from the JWT payload.
 *
 * **The HTTP status is the auth signal, not the username.** HandleMe
 * rejects a missing/invalid/expired token before it ever looks at claims,
 * so a 2xx already means the cookie was verified. `clusterRequest` rejects
 * on any non-2xx, so a 401 from /me surfaces as a thrown error and the
 * caller routes the user to AuthChooser.
 *
 * In particular, an **empty username is a valid authenticated session** and
 * must not be rejected here. The default username path (see
 * DefaultMeUsernamePath in backend/pkg/config/config.go) is
 * "preferred_username,upn,username,name" — there is no `sub` or `email`
 * fallback — so an IdP issuing none of those four claims (Dex without the
 * `profile` scope, Azure AD v2 access tokens, minimal Keycloak client
 * scopes) yields a cookie-verified 200 carrying `username: ""`. Turning
 * that into a synthetic 401 would send the user to login, which sets a
 * perfectly good cookie, which /me again reports with an empty username —
 * an infinite redirect loop (RouteSwitcher.tsx sends OIDC errors to
 * `login`). `getClusterUserInfo` below takes the same stance: an empty
 * username means "no info", not "unauthenticated".
 *
 * The `system:anonymous` check is defense in depth for an operator whose
 * JMESPath username extraction resolves to the Kubernetes anonymous user.
 * It is an exact match on purpose: `system:anonymous-reader` and similar
 * are legitimate usernames, and the anonymous user is exactly
 * `system:anonymous`.
 *
 * This works around the SSRR false-positive reported in #4721: when
 * `system:basic-user` is granted to `system:unauthenticated`, SSRR
 * returns HTTP 201 for both anonymous and authenticated callers, so it
 * cannot be used as the auth signal on those clusters.
 *
 * For non-OIDC clusters, behavior is unchanged: SSRR is the auth signal.
 */
export async function testAuth(cluster = '', namespace = 'default') {
  const clusterName = cluster || getCluster();

  if (clusterName) {
    const clusterAuthType = store.getState().config?.clusters?.[clusterName]?.auth_type;

    if (clusterAuthType === 'oidc') {
      const me = await clusterRequest('/me', {
        timeout: 5 * 1000,
        cluster: clusterName,
        // This is an auth *probe*: the caller decides what a 401 means and
        // where to send the user. Letting clusterRequest log the user out
        // from underneath it would race that logic. The SSRR call below
        // passes false for the same reason.
        autoLogoutOnAuthError: false,
      });

      const username: string = (me && me.username) || '';
      // Exact match only — see the note above on why an empty username is
      // accepted and why this is not a `startsWith`.
      if (username === 'system:anonymous') {
        throw new ApiError('not authenticated', { status: 401, cluster: clusterName });
      }

      return me;
    }
  }

  const spec = { namespace };

  return post('/apis/authorization.k8s.io/v1/selfsubjectrulesreviews', { spec }, false, {
    timeout: 5 * 1000,
    cluster: clusterName,
  });
}

/**
 * User info returned from SelfSubjectReview or derived from cluster config
 */
export interface ClusterUserInfo {
  /** Username of the authenticated user */
  username?: string;
  /** UID of the authenticated user */
  uid?: string;
  /** Groups the user belongs to */
  groups?: string[];
  /** Extra info about the user */
  extra?: Record<string, string[]>;
}

/**
 * Get user info for the given cluster using SelfSubjectReview API.
 * Falls back to returning cluster name if the API is not available.
 * Returns { username: 'unknown' } if no cluster is resolved.
 *
 * @param cluster - The name of the cluster (optional).
 * @returns Promise resolving to user info
 */
export async function getClusterUserInfo(cluster = ''): Promise<ClusterUserInfo> {
  const clusterName = cluster || getCluster() || '';

  if (!clusterName) {
    return { username: 'unknown' };
  }

  try {
    const res = await clusterRequest('/me', {
      timeout: 5 * 1000,
      cluster: clusterName,
    });
    if (res && res.username) {
      return {
        username: res.username,
        groups: res.groups,
      };
    }
  } catch (error) {
    if (isDebugVerbose('k8s/api/v1/clusterApi@getClusterUserInfo')) {
      console.debug('Failed to get user info from /me for cluster', clusterName, error);
    }
  }

  try {
    // Try SelfSubjectReview API (available in K8s 1.28+)
    const response = await post(
      '/apis/authentication.k8s.io/v1/selfsubjectreviews',
      {
        apiVersion: 'authentication.k8s.io/v1',
        kind: 'SelfSubjectReview',
      },
      false,
      {
        timeout: 5 * 1000,
        cluster: clusterName,
      }
    );

    if (response?.status?.userInfo) {
      return response.status.userInfo;
    }

    // Fallback: return cluster name as username
    return { username: clusterName };
  } catch (error) {
    // If SelfSubjectReview is not available, return cluster name
    if (isDebugVerbose('k8s/api/v1/clusterApi@getClusterUserInfo')) {
      console.debug('SelfSubjectReview not available for cluster', clusterName, error);
    }
    return { username: clusterName };
  }
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
    return request(
      '/parseKubeConfig',
      {
        method: 'POST',
        body: JSON.stringify({ kubeconfigs: [kubeconfig] }),
        headers: {
          ...headers,
          ...getHeadlampAPIHeaders(),
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
 * parseKubeConfig sends a kubeconfig to the backend to parse and returns
 * the resulting clusters.
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
        body: JSON.stringify({ kubeconfigs: [kubeconfig] }),
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
