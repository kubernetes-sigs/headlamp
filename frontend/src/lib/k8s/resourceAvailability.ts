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

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { request } from './api/v1/clusterRequests';
import { useSelectedClusters } from './api/v1/hooks';

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
  /** The group versions the resource is declared under, which tell apart same-named resources. */
  apiVersion: string | string[];
  apiName: string;
  isEnabled(cluster: string): Promise<boolean>;
}

/** What is known about which selected clusters serve a resource. */
export interface ClustersServingStatus {
  /**
   * The clusters that serve the resource as soon as one is known to, empty when every
   * selected cluster has answered and none does, or undefined until then.
   */
  clusters: string[] | undefined;
  /** True while some selected cluster has not given its answer yet, or is being checked again. */
  isChecking: boolean;
}

/**
 * The selected clusters that serve the given resource, and whether all of them have answered.
 *
 * The clusters are kept rather than reduced to a flag, because a list resolves
 * its endpoint against the first cluster it is given, so views built on an
 * optional API have to be asked only for the clusters that serve it.
 *
 * Each cluster is probed on its own, so a cluster that is slow to answer does not
 * hold back one that has already confirmed the resource. The probes are repeated
 * whenever the view is opened, so installing the API, or a probe that failed
 * earlier, is picked up without waiting for the cache to expire. While they run,
 * an earlier negative answer is not trusted: `clusters` stays undefined, and
 * `isChecking` tells views that already have some clusters that more may follow.
 * @param resourceClass - The class whose `isEnabled` probes a cluster.
 * @returns The clusters serving the resource and whether the check is still going on.
 */
export function useClustersServingStatus(
  resourceClass: ServedResourceClass
): ClustersServingStatus {
  const selectedClusters = useSelectedClusters();

  const probes = useQueries({
    queries: selectedClusters.map(cluster => ({
      queryKey: ['clusterServing', resourceClass.apiVersion, resourceClass.apiName, cluster],
      queryFn: () => resourceClass.isEnabled(cluster),
      refetchOnMount: 'always' as const,
    })),
  });

  const serving = selectedClusters.filter((_, index) => probes[index]?.data === true);
  // A probe is unresolved while it has no answer, or while it is fetching or paused,
  // because a cached answer from an earlier visit may be out of date.
  const isChecking = probes.some(probe => probe.isPending || probe.fetchStatus !== 'idle');
  const servingKey = serving.join('\n');

  // Keep the same array until the answer changes, so views that take it as a prop
  // are not re-rendered by every probe update.
  const clusters = useMemo(() => {
    if (selectedClusters.length === 0) {
      return undefined;
    }
    if (serving.length > 0) {
      return serving;
    }
    return isChecking ? undefined : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servingKey, isChecking, selectedClusters.length]);

  return useMemo(() => ({ clusters, isChecking }), [clusters, isChecking]);
}

/**
 * The selected clusters that serve the given resource.
 * @param resourceClass - The class whose `isEnabled` probes a cluster.
 * @returns The clusters that serve the resource as soon as one is known to, empty
 * when every selected cluster has answered and none does, or undefined until then.
 */
export function useClustersServing(resourceClass: ServedResourceClass): string[] | undefined {
  return useClustersServingStatus(resourceClass).clusters;
}

/**
 * Whether any selected cluster serves the given resource.
 * @param resourceClass - The class whose `isEnabled` probes a cluster.
 * @returns true once a selected cluster is known to serve the resource.
 */
export function useIsResourceServed(resourceClass: ServedResourceClass): boolean {
  return (useClustersServing(resourceClass)?.length ?? 0) > 0;
}
