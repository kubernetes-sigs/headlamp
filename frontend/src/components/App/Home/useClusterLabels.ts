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

import { useEffect, useMemo, useState } from 'react';
import {
  CLUSTER_LABELS_CHANGED_EVENT,
  ClusterLabels,
  loadClusterLabels,
} from '../../../helpers/clusterLabels';

/**
 * Returns the local labels of the given clusters, reloading them when they are changed in
 * this window or in another tab.
 *
 * @param clusterNames - Names of the clusters to load labels for. Keep the array stable.
 * @returns Labels keyed by cluster name.
 */
export function useClusterLabels(clusterNames: string[]): Record<string, ClusterLabels> {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const reload = () => setRevision(value => value + 1);
    const reloadOnStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith('cluster_settings.')) {
        reload();
      }
    };
    window.addEventListener(CLUSTER_LABELS_CHANGED_EVENT, reload);
    window.addEventListener('storage', reloadOnStorage);
    return () => {
      window.removeEventListener(CLUSTER_LABELS_CHANGED_EVENT, reload);
      window.removeEventListener('storage', reloadOnStorage);
    };
  }, []);

  return useMemo(
    () => Object.fromEntries(clusterNames.map(name => [name, loadClusterLabels(name)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clusterNames, revision]
  );
}
