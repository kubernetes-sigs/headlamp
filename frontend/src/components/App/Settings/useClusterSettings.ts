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

import isEqual from 'lodash/isEqual';
import React from 'react';
import {
  ClusterSettings,
  loadClusterSettings,
  storeClusterSettings,
} from '../../../helpers/clusterSettings';
import { CLUSTER_TAGS_CHANGED_EVENT } from '../../../helpers/clusterTags';

/**
 * Single source of truth for a cluster's settings, backed by localStorage.
 *
 * Loads settings when `cluster` changes. The returned setter writes to
 * both React state and localStorage synchronously. Tag overrides are refreshed
 * on storage notifications without replacing unrelated drafts; setters preserve
 * the latest tags owned by the dedicated tag editor.
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

  React.useEffect(() => {
    const refreshTags = () => {
      const { tags } = loadClusterSettings(cluster);
      setSettingsState(previous => {
        if (isEqual(previous.tags, tags)) {
          return previous;
        }
        const next = { ...previous };
        if (tags === undefined) {
          delete next.tags;
        } else {
          next.tags = tags;
        }
        return next;
      });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === `cluster_settings.${cluster}`) {
        refreshTags();
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(CLUSTER_TAGS_CHANGED_EVENT, refreshTags);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(CLUSTER_TAGS_CHANGED_EVENT, refreshTags);
    };
  }, [cluster]);

  // Setter that writes to both React state and localStorage.
  const setSettings: React.Dispatch<React.SetStateAction<ClusterSettings>> = React.useCallback(
    action => {
      setSettingsState(prev => {
        const next = { ...(typeof action === 'function' ? action(prev) : action) };
        // Tags are persisted independently by the tag editor, not other settings controls.
        const { tags } = loadClusterSettings(cluster);
        if (tags === undefined) {
          delete next.tags;
        } else {
          next.tags = tags;
        }
        if (cluster) {
          storeClusterSettings(cluster, next);
        }
        return next;
      });
    },
    [cluster]
  );

  return [settings, setSettings];
}
