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

import { useCallback, useState } from 'react';
import { getRecentClusters, setRecentCluster } from './recentClusters';

/**
 * Returns the subset of the given cluster names that may be auto-connected to.
 *
 * Default policy: recently-used clusters only. This is the single place the
 * policy is decided, so a future All/None/Only-these setting can hook in here.
 */
export function getAutoConnectClusterNames(clusterNames: string[]): string[] {
  const recentClusters = new Set(getRecentClusters());
  return clusterNames.filter(name => recentClusters.has(name));
}

const sessionConnectedStorageKey = 'session_connected_clusters';

/**
 * The clusters connected on demand during this browser-tab session. Kept in
 * sessionStorage (uncapped) so they survive a remount of the Home view — e.g.
 * navigating away and back, or the cluster list changing — unlike the capped
 * recent_clusters list.
 */
function getSessionConnectedClusters(): string[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionConnectedStorageKey) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function addSessionConnectedCluster(clusterName: string) {
  try {
    const connected = new Set(getSessionConnectedClusters());
    connected.add(clusterName);
    sessionStorage.setItem(sessionConnectedStorageKey, JSON.stringify([...connected]));
  } catch {
    // sessionStorage unavailable (e.g. private browsing with strict settings).
    // The cluster is still added to React state; it just won't survive a remount.
  }
}

/**
 * Hook that tracks which clusters to auto-connect to during this session.
 *
 * The connected set combines the policy (recently-used by default) with the
 * clusters connected on demand this session. It only grows via connect(), and
 * the session connects are persisted in sessionStorage so the set survives a
 * remount of the Home view rather than resetting to the recent-clusters seed.
 * This means the key-based remount in Home (triggered by cluster-list changes)
 * is safe: on-demand connects are never dropped.
 *
 * @param availableClusterNames - Names of all clusters used to seed the initial
 *   connected set. Changes to this array after mount are ignored; callers that
 *   need to re-seed on list changes should remount the hook (e.g. via a React key).
 */
export function useAutoConnectClusters(availableClusterNames: string[]) {
  const [connectedClusters, setConnectedClusters] = useState<Set<string>>(
    () =>
      new Set([
        ...getAutoConnectClusterNames(availableClusterNames),
        ...getSessionConnectedClusters(),
      ])
  );

  const connect = useCallback((clusterName: string) => {
    setRecentCluster(clusterName);
    addSessionConnectedCluster(clusterName);
    setConnectedClusters(current =>
      current.has(clusterName) ? current : new Set(current).add(clusterName)
    );
  }, []);

  return { connect, connectedClusters };
}
