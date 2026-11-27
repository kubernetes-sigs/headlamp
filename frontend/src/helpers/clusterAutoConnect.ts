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

import { useCallback, useEffect, useState } from 'react';
import { request } from '../lib/k8s/api/v1/clusterRequests';
import { getRecentClusters, setRecentCluster } from './recentClusters';

export type AutoConnectPolicy = 'none' | 'recent' | 'all';

const settingsStorageKey = 'settings';

/**
 * Reads the configured cluster auto-connect policy from stored settings.
 * Defaults to 'none' so Headlamp only connects to clusters the user opens.
 */
export function getAutoConnectPolicy(): AutoConnectPolicy {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return 'none';
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed?.autoConnectPolicy === 'none' ||
      parsed?.autoConnectPolicy === 'recent' ||
      parsed?.autoConnectPolicy === 'all'
    ) {
      return parsed.autoConnectPolicy;
    }
  } catch {
    // Ignore invalid JSON in localStorage.
  }
  return 'none';
}

/**
 * Persists the cluster auto-connect policy to stored settings.
 */
export function setAutoConnectPolicy(policy: AutoConnectPolicy) {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ...parsed, autoConnectPolicy: policy }
        : { autoConnectPolicy: policy };
    localStorage.setItem(settingsStorageKey, JSON.stringify(next));
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Returns the subset of the given cluster names that may be auto-connected to
 * according to the active policy ('none', 'recent', or 'all').
 */
export function getAutoConnectClusterNames(
  clusterNames: string[],
  policy: AutoConnectPolicy = getAutoConnectPolicy()
): string[] {
  if (policy === 'none') {
    return [];
  }
  if (policy === 'all') {
    return [...clusterNames];
  }
  const recentClusters = new Set(getRecentClusters());
  return clusterNames.filter(name => recentClusters.has(name));
}

const sessionConnectedStorageKey = 'session_connected_clusters';
const sessionDisconnectedStorageKey = 'session_disconnected_clusters';

function readSessionList(key: string): string[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function writeSessionSet(key: string, items: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...items]));
  } catch {
    // sessionStorage unavailable (e.g. private browsing with strict settings).
  }
}

function getSessionConnectedClusters(): string[] {
  return readSessionList(sessionConnectedStorageKey);
}

function getSessionDisconnectedClusters(): Set<string> {
  return new Set(readSessionList(sessionDisconnectedStorageKey));
}

function addSessionConnectedCluster(clusterName: string) {
  const connected = new Set(getSessionConnectedClusters());
  connected.add(clusterName);
  writeSessionSet(sessionConnectedStorageKey, connected);

  const disconnected = getSessionDisconnectedClusters();
  if (disconnected.delete(clusterName)) {
    writeSessionSet(sessionDisconnectedStorageKey, disconnected);
  }
}

function removeSessionConnectedCluster(clusterName: string) {
  const connected = new Set(getSessionConnectedClusters());
  if (connected.delete(clusterName)) {
    writeSessionSet(sessionConnectedStorageKey, connected);
  }

  const disconnected = getSessionDisconnectedClusters();
  disconnected.add(clusterName);
  writeSessionSet(sessionDisconnectedStorageKey, disconnected);
}

/**
 * Hook that tracks which clusters to connect to during this session.
 *
 * The connected set combines the configured policy ('none' by default) with
 * clusters connected on demand this session, minus any clusters explicitly
 * disconnected via disconnect().
 */
export function useAutoConnectClusters(availableClusterNames: string[]) {
  const [connectedClusters, setConnectedClusters] = useState<Set<string>>(() => {
    const disconnected = getSessionDisconnectedClusters();
    const initial = new Set([
      ...getAutoConnectClusterNames(availableClusterNames),
      ...getSessionConnectedClusters(),
    ]);
    disconnected.forEach(name => initial.delete(name));
    return initial;
  });

  useEffect(() => {
    window.desktopApi?.send('connected-clusters-changed', [...connectedClusters]);
  }, [connectedClusters]);

  const connect = useCallback((clusterName: string) => {
    setRecentCluster(clusterName);
    addSessionConnectedCluster(clusterName);
    setConnectedClusters(current =>
      current.has(clusterName) ? current : new Set(current).add(clusterName)
    );
  }, []);

  const disconnect = useCallback((clusterName: string) => {
    removeSessionConnectedCluster(clusterName);
    setConnectedClusters(current => {
      if (!current.has(clusterName)) {
        return current;
      }
      const next = new Set(current);
      next.delete(clusterName);
      return next;
    });
    request(
      `/clusters/${encodeURIComponent(clusterName)}/connection`,
      { method: 'DELETE' },
      false,
      false
    ).catch(() => {
      // Best-effort backend proxy/connection teardown.
    });
  }, []);

  return { connect, disconnect, connectedClusters };
}
