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

import React from 'react';
import {
  ClusterSettings,
  loadClusterSettings,
  storeClusterSettings,
} from '../../../helpers/clusterSettings';
import { NAMESPACE_DISCOVERY_QUERY_KEY } from '../../../lib/k8s/useDiscoveredNamespaces';
import { queryClient } from '../../../lib/queryClient';

function allowedNamespacesChanged(prev: ClusterSettings, next: ClusterSettings): boolean {
  const prevAllowed = prev.allowedNamespaces ?? [];
  const nextAllowed = next.allowedNamespaces ?? [];
  if (prevAllowed.length !== nextAllowed.length) {
    return true;
  }
  return prevAllowed.some((ns, index) => ns !== nextAllowed[index]);
}

function invalidateNamespaceDiscoveryForCluster(cluster: string) {
  queryClient.invalidateQueries({ queryKey: ['auth', cluster], exact: true });
  queryClient.invalidateQueries({
    queryKey: [NAMESPACE_DISCOVERY_QUERY_KEY, cluster],
    exact: true,
  });
}

/**
 * Single source of truth for a cluster's settings, backed by localStorage.
 *
 * Loads settings when `cluster` changes. The returned setter writes to
 * both React state and localStorage synchronously.
 *
 * @param cluster - The cluster name to load/store settings for.
 * @returns A tuple of [settings, setSettings].
 */
export function useClusterSettings(
  cluster: string
): [ClusterSettings, React.Dispatch<React.SetStateAction<ClusterSettings>>] {
  const [settings, setSettingsState] = React.useState<ClusterSettings>(() =>
    cluster ? loadClusterSettings(cluster) : {}
  );

  // Reload from localStorage when the active cluster changes.
  React.useLayoutEffect(() => {
    setSettingsState(cluster ? loadClusterSettings(cluster) : {});
  }, [cluster]);

  // Setter that writes to both React state and localStorage.
  const setSettings: React.Dispatch<React.SetStateAction<ClusterSettings>> = React.useCallback(
    action => {
      setSettingsState(prev => {
        const next = typeof action === 'function' ? action(prev) : action;
        if (cluster) {
          storeClusterSettings(cluster, next);
          if (allowedNamespacesChanged(prev, next)) {
            invalidateNamespaceDiscoveryForCluster(cluster);
          }
        }
        return next;
      });
    },
    [cluster]
  );

  return [settings, setSettings];
}
