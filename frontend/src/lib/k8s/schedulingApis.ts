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
import { useMemo } from 'react';
import { useSelectedClusters } from '.';
import { request } from './api/v1/clusterRequests';
import type { KubeObject, KubeObjectClass } from './KubeObject';
import PodGroup from './podGroup';
import SchedulingWorkload from './schedulingWorkload';

/** The selected clusters that serve a resource, keyed by the group version each serves. */
export type ClustersByVersion = Record<string, string[]>;

const NO_VERSIONS: ClustersByVersion = {};
const NO_CLUSTERS: string[] = [];
const NO_ITEMS: KubeObject[] = [];

/**
 * The newest of a class's declared versions that a cluster serves the resource under.
 *
 * Each version's discovery document is asked directly, because discovery only reports the
 * preferred version of a group and scheduling.k8s.io also serves v1.
 * @param cluster - The cluster to check.
 * @param resourceClass - The class whose declared versions are tried, newest first.
 * @returns The version, or undefined when the cluster serves none of them.
 */
async function getServedVersion(
  cluster: string,
  resourceClass: KubeObjectClass
): Promise<string | undefined> {
  const { apiVersion, apiName } = resourceClass;
  for (const version of Array.isArray(apiVersion) ? apiVersion : [apiVersion]) {
    try {
      const response = await request(`/apis/${version}`, { cluster });
      if (response?.resources?.some((resource: { name?: string }) => resource.name === apiName)) {
        return version;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * The selected clusters that serve a resource, grouped by the version each serves it under.
 * @param resourceClass - The class whose declared versions are probed.
 * @returns The serving clusters per version, empty while none is known.
 */
function useClustersByVersion(resourceClass: KubeObjectClass): ClustersByVersion {
  const selectedClusters = useSelectedClusters();

  const { data: clustersByVersion = NO_VERSIONS } = useQuery({
    queryKey: ['servedSchedulingVersions', resourceClass.apiName, ...selectedClusters],
    queryFn: async () => {
      const versions = await Promise.all(
        selectedClusters.map(cluster => getServedVersion(cluster, resourceClass))
      );
      const byVersion: ClustersByVersion = {};
      selectedClusters.forEach((cluster, index) => {
        const version = versions[index];
        if (version) {
          (byVersion[version] ??= []).push(cluster);
        }
      });
      return byVersion;
    },
    enabled: selectedClusters.length > 0,
  });

  return clustersByVersion;
}

/**
 * The selected clusters that serve PodGroup, per version.
 *
 * The APIs are alpha and only served when the GenericWorkload feature gate is enabled,
 * and clusters on different releases serve different versions of them.
 * @returns The serving clusters per version, empty while none is known.
 */
export function usePodGroupClustersByVersion(): ClustersByVersion {
  return useClustersByVersion(PodGroup);
}

/**
 * The selected clusters that serve the scheduling Workload, per version.
 * @returns The serving clusters per version, empty while none is known.
 */
export function useSchedulingWorkloadClustersByVersion(): ClustersByVersion {
  return useClustersByVersion(SchedulingWorkload);
}

/**
 * The selected clusters that serve the workload aware scheduling APIs, in any version.
 * @returns The clusters known to serve the APIs, empty while none is.
 */
export function useSchedulingApiClusters(): string[] {
  const clustersByVersion = usePodGroupClustersByVersion();
  return useMemo(() => Object.values(clustersByVersion).flat(), [clustersByVersion]);
}

/**
 * Whether any selected cluster serves the workload aware scheduling APIs.
 * @returns true once a selected cluster is known to serve the APIs.
 */
export function useSchedulingApisEnabled(): boolean {
  return useSchedulingApiClusters().length > 0;
}

const versionedClasses = new Map<string, KubeObjectClass>();

/**
 * The class with its API version fixed to one of the versions it declares.
 *
 * A list resolves one endpoint for every cluster it is given, by racing the declared
 * versions against the first of them, so clusters on different versions can only be
 * listed together once each list is held to a single version.
 * @param resourceClass - The class to fix the version of.
 * @param apiVersion - One of the versions the class declares.
 * @returns A subclass that declares only that version, the same one on every call.
 */
export function withApiVersion<C extends KubeObjectClass>(resourceClass: C, apiVersion: string): C {
  const key = `${resourceClass.kind}:${apiVersion}`;
  let versioned = versionedClasses.get(key);
  if (!versioned) {
    versioned = class extends (resourceClass as any) {
      static apiVersion = apiVersion;
      // The endpoint is cached on the class, and statics are inherited, so the cache of
      // the unversioned class has to be shadowed for this one to build its own.
      static _internalApiEndpoint = undefined;
    } as unknown as KubeObjectClass;
    versionedClasses.set(key, versioned);
  }
  return versioned as C;
}

/**
 * Lists a resource from the clusters that serve it, asking each one for its own version.
 * @param resourceClass - The class to list.
 * @param clustersByVersion - The clusters to list from, per version they serve.
 * @param namespace - The namespaces to list from.
 * @returns The items of every cluster, or null while any of them is still loading.
 */
export function useListPerVersion(
  resourceClass: KubeObjectClass,
  clustersByVersion: ClustersByVersion,
  namespace?: string[]
): KubeObject[] | null {
  const { apiVersion } = resourceClass;
  const versions = Array.isArray(apiVersion) ? apiVersion : [apiVersion];

  // The declared versions are fixed per class, so the same hooks run on every render.
  const lists = versions.map(version => {
    const clusters = clustersByVersion[version] ?? NO_CLUSTERS;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [items] = withApiVersion(resourceClass, version).useList({ namespace, clusters });
    return clusters.length > 0 ? items : NO_ITEMS;
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (lists.includes(null) ? null : (lists as KubeObject[][]).flat()), lists);
}
