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
import { useSelectedClusters } from '.';
import CompositePodGroup from './compositePodGroup';
import PodGroup from './podGroup';

const NO_CLUSTERS: string[] = [];

/**
 * The selected clusters for which the given probe says the resource is served.
 * @param queryKey - Names the probe in the query cache.
 * @param isServed - Asks one cluster whether it serves the resource.
 * @returns The clusters known to serve the resource, empty while none is.
 */
function useServingClusters(
  queryKey: string,
  isServed: (cluster: string) => Promise<boolean>
): string[] {
  const selectedClusters = useSelectedClusters();

  const { data: enabledClusters = NO_CLUSTERS } = useQuery({
    queryKey: [queryKey, ...selectedClusters],
    queryFn: async () => {
      const enabledPerCluster = await Promise.all(
        selectedClusters.map(cluster => isServed(cluster))
      );
      return selectedClusters.filter((_, index) => enabledPerCluster[index]);
    },
    enabled: selectedClusters.length > 0,
  });

  return enabledClusters;
}

/**
 * The selected clusters that serve the workload aware scheduling APIs.
 *
 * The APIs are alpha and only served when the GenericWorkload feature gate is enabled,
 * so views built on them stay hidden on clusters that do not have it. The clusters are
 * kept rather than reduced to a flag, because a list resolves its endpoint against the
 * first cluster it is given, so a list has to be asked only for the clusters that serve
 * the resource.
 * @returns The clusters known to serve the APIs, empty while none is.
 */
export function useSchedulingApiClusters(): string[] {
  return useServingClusters('schedulingWorkloadsEnabled', cluster => PodGroup.isEnabled(cluster));
}

/**
 * The selected clusters that serve CompositePodGroup.
 *
 * It needs the CompositePodGroup feature gate on top of the ones the flat scheduling
 * APIs need, so a cluster that serves Workload and PodGroup may still not serve it.
 * @returns The clusters known to serve CompositePodGroup, empty while none is.
 */
export function useCompositePodGroupClusters(): string[] {
  return useServingClusters('compositePodGroupClusters', cluster =>
    CompositePodGroup.isEnabled(cluster)
  );
}

/**
 * Whether any selected cluster serves the workload aware scheduling APIs.
 * @returns true once a selected cluster is known to serve the APIs.
 */
export function useSchedulingApisEnabled(): boolean {
  return useSchedulingApiClusters().length > 0;
}
