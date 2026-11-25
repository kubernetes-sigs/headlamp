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
  subscribeToClusterSettings,
} from '../../../helpers/clusterSettings';

/**
 * Single source of truth for a cluster's settings, backed by localStorage.
 *
 * Loads settings when `cluster` changes and subscribes to persisted changes.
 * The returned setter writes to both React state and localStorage synchronously.
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

  React.useLayoutEffect(() => {
    const reloadSettings = () => {
      const next = cluster ? loadClusterSettings(cluster) : {};
      setSettingsState(current =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      );
    };
    const unsubscribe = cluster ? subscribeToClusterSettings(reloadSettings) : undefined;
    reloadSettings();
    return unsubscribe;
  }, [cluster]);

  // Setter that writes to both React state and localStorage.
  const setSettings: React.Dispatch<React.SetStateAction<ClusterSettings>> = React.useCallback(
    action => {
      if (!cluster) {
        setSettingsState(action);
        return;
      }
      const next = typeof action === 'function' ? action(loadClusterSettings(cluster)) : action;
      // Notify subscribers outside React's state updater, which may run during render.
      storeClusterSettings(cluster, next);
      setSettingsState(next);
    },
    [cluster]
  );

  return [settings, setSettings];
}
