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

import { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import { getClusterConfigIdentity } from '../../helpers/clusterTags';
import { request } from '../../lib/k8s/api/v1/clusterRequests';
import type { Cluster } from '../../lib/k8s/cluster';
import { ConfigState, setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { fetchStatelessClusterKubeConfigs, isEqualClusterConfigs } from '../../stateless';
import { enqueueConfigOperation } from '../../stateless/configOperationQueue';
import { applyBackendThemeConfig } from './themeSlice';

let pendingConfigFetch: ReturnType<typeof fetchServerConfig> | undefined;

export function fetchClusterConfig(dispatch: Dispatch<UnknownAction>) {
  if (!pendingConfigFetch) {
    pendingConfigFetch = enqueueConfigOperation(() => fetchServerConfig(dispatch)).finally(() => {
      pendingConfigFetch = undefined;
    });
  }
  return pendingConfigFetch;
}

async function fetchServerConfig(dispatch: Dispatch<UnknownAction>) {
  const submittedIdentity = getClusterConfigIdentity(store.getState().config.clusters);
  const config = await request('/config', { timeout: 30 * 1000 }, false, false);
  const { clusters, statelessClusters } = store.getState().config;
  if (getClusterConfigIdentity(clusters) !== submittedIdentity) {
    throw new Error('Cluster configuration changed while fetching cluster config');
  }
  const clustersToConfig: NonNullable<ConfigState['clusters']> = {};
  config?.clusters.forEach((cluster: Cluster) => {
    const name = cluster.meta_data?.extensions?.headlamp_info?.customName || cluster.name;
    clustersToConfig[name] = { ...cluster, name };
  });

  const configToStore = {
    ...config,
    clusters: clustersToConfig,
    oidcAutoLogin: config.oidcAutoLogin,
  };
  if (clusters === null) {
    dispatch(setConfig(configToStore));
  } else if (isEqualClusterConfigs(clusters, clustersToConfig)) {
    const mergedClusters = { ...clustersToConfig };
    Object.entries(statelessClusters ?? {}).forEach(([key, cluster]) => {
      if (!mergedClusters[key]) {
        mergedClusters[key] = cluster;
      }
    });
    Object.entries(mergedClusters).forEach(([key, cluster]) => {
      if (clusters[key]?.useToken !== undefined) {
        mergedClusters[key] = { ...cluster, useToken: clusters[key].useToken };
      }
    });
    dispatch(setConfig({ ...configToStore, clusters: mergedClusters }));
  }
  dispatch(
    applyBackendThemeConfig({
      defaultLightTheme: config?.defaultLightTheme,
      defaultDarkTheme: config?.defaultDarkTheme,
      forceTheme: config?.forceTheme,
    })
  );

  // Do not await a nested operation on this queue.
  if (config?.isDynamicClusterEnabled) {
    fetchStatelessClusterKubeConfigs(dispatch);
  }
  return configToStore;
}
