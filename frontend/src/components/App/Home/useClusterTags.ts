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
  CLUSTER_TAGS_CHANGED_EVENT,
  ClusterTags,
  loadClusterTags,
} from '../../../helpers/clusterTags';
import type { Cluster } from '../../../lib/k8s/cluster';

/**
 * Returns the local tags of the given clusters, reloading them when they are changed in
 * this window or in another tab.
 *
 * @param clusterNames - Names of the clusters to load tags for. Keep the array stable.
 * @returns Tags keyed by cluster name.
 */
export function useClusterTags(
  clusterNames: string[],
  clusters?: Cluster[] | null
): Record<string, ClusterTags> {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const reload = () => setRevision(value => value + 1);
    const reloadOnStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith('cluster_settings.')) {
        reload();
      }
    };
    window.addEventListener(CLUSTER_TAGS_CHANGED_EVENT, reload);
    window.addEventListener('storage', reloadOnStorage);
    return () => {
      window.removeEventListener(CLUSTER_TAGS_CHANGED_EVENT, reload);
      window.removeEventListener('storage', reloadOnStorage);
    };
  }, []);

  return useMemo(
    () =>
      Object.fromEntries(
        clusterNames.map(name => [
          name,
          loadClusterTags(
            name,
            clusters?.find(c => c.name === name)
          ),
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clusterNames, clusters, revision]
  );
}
