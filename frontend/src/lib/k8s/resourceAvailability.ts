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

import { useQuery } from '@tanstack/react-query';
import { request } from './api/v1/clusterRequests';
import { useSelectedClusters } from './api/v1/hooks';

const NO_CLUSTERS: string[] = [];

/**
 * Whether a cluster serves a resource under one of the given group versions.
 *
 * This asks each version's discovery document directly instead of using the
 * aggregated discovery, because that only reports the preferred version of a
 * group and a resource may only be served by a newer or older one.
 * @param cluster - The cluster to check.
 * @param apiVersions - The group versions the resource may be served by, newest first.
 * @param apiName - The plural name of the resource to look for.
 * @returns true when one of the versions serves the resource.
 */
export async function isResourceServed(
  cluster: string,
  apiVersions: string | string[],
  apiName: string
): Promise<boolean> {
  const versions = Array.isArray(apiVersions) ? apiVersions : [apiVersions];

  for (const version of versions) {
    // The core group has no group name and lives under /api instead of /apis.
    const path = version.includes('/') ? `/apis/${version}` : `/api/${version}`;
    try {
      const response = await request(path, { cluster });
      if (response?.resources?.some((resource: { name?: string }) => resource.name === apiName)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

/** The parts of a resource class needed to ask whether a cluster serves it. */
export interface ServedResourceClass {
  apiName: string;
  isEnabled(cluster: string): Promise<boolean>;
}

/**
 * The selected clusters that serve the given resource.
 *
 * The clusters are kept rather than reduced to a flag, because a list resolves
 * its endpoint against the first cluster it is given, so views built on an
 * optional API have to be asked only for the clusters that serve it.
 * @param resourceClass - The class whose `isEnabled` probes a cluster.
 * @returns The clusters known to serve the resource, empty while none is.
 */
export function useClustersServing(resourceClass: ServedResourceClass): string[] {
  const selectedClusters = useSelectedClusters();

  const { data: servingClusters = NO_CLUSTERS } = useQuery({
    queryKey: ['clustersServing', resourceClass.apiName, ...selectedClusters],
    queryFn: async () => {
      const servedPerCluster = await Promise.all(
        selectedClusters.map(cluster => resourceClass.isEnabled(cluster))
      );
      return selectedClusters.filter((_, index) => servedPerCluster[index]);
    },
    enabled: selectedClusters.length > 0,
  });

  return servingClusters;
}

/**
 * Whether any selected cluster serves the given resource.
 * @param resourceClass - The class whose `isEnabled` probes a cluster.
 * @returns true once a selected cluster is known to serve the resource.
 */
export function useIsResourceServed(resourceClass: ServedResourceClass): boolean {
  return useClustersServing(resourceClass).length > 0;
}
