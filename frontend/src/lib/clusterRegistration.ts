/*
 * Copyright 2026 The Kubernetes Authors
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

import { createSelector } from '@reduxjs/toolkit';
import { isEqual } from 'lodash';
import { useMemo } from 'react';
import { useTypedSelector } from '../redux/hooks';
import type { RootState } from '../redux/stores/store';

export interface RegisteredClusterOrigin {
  cluster: string;
  resource: {
    apiVersion: string;
    kind: string;
    namespace: string;
    name: string;
    uid: string;
  };
}

export interface RegisteredCluster {
  /** Connection name accepted by Kubernetes resource hooks. */
  id: string;
  displayName: string;
  source: string;
  origin: RegisteredClusterOrigin;
}

export interface UseRegisteredClustersOptions {
  source?: string;
  originCluster?: string;
  originNamespace?: string;
}

const selectRegisteredClusters = createSelector(
  (state: RootState) => state.config.clusters,
  clusters =>
    Object.values(clusters ?? {}).flatMap<RegisteredCluster>(cluster => {
      const origin = cluster.meta_data?.discoveryOrigin;
      const source = cluster.meta_data?.source;
      if (!origin || typeof source !== 'string') return [];

      return [
        {
          id: cluster.name,
          displayName: cluster.meta_data?.presentation?.displayName || cluster.name,
          source,
          origin,
        },
      ];
    }),
  { memoizeOptions: { resultEqualityCheck: isEqual } }
);

/**
 * Gets the current connections discovered by Headlamp.
 * @param options - Filters by source and the location of the owner resource.
 * @returns Discovered connections whose IDs can be used by Kubernetes resource hooks.
 */
export function useRegisteredClusters({
  source,
  originCluster,
  originNamespace,
}: UseRegisteredClustersOptions = {}): readonly RegisteredCluster[] {
  const registrations = useTypedSelector(selectRegisteredClusters);

  return useMemo(
    () =>
      registrations.filter(
        item =>
          (source === undefined || item.source === source) &&
          (originCluster === undefined || item.origin.cluster === originCluster) &&
          (originNamespace === undefined || item.origin.resource.namespace === originNamespace)
      ),
    [registrations, source, originCluster, originNamespace]
  );
}
