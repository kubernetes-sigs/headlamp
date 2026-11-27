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
import type { QueryParameters } from './k8s/api/v1/queryParameters';
import type { ApiError } from './k8s/api/v2/ApiError';
import type { KubeObject } from './k8s/KubeObject';

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
  /** The discovery source, `cluster_inventory` or `cluster_api`. */
  source?: string;
  /**
   * The connection name of the management cluster that holds the owner resources.
   * Undefined does not filter by management cluster.
   */
  originCluster?: string;
  /** The namespace of the owner resources. */
  originNamespace?: string;
}

const selectRegisteredClusters = createSelector(
  [
    (state: RootState) => state.config.clusters,
    (state: RootState) => state.config.statelessClusters,
  ],
  (clusters, statelessClusters) =>
    Object.entries(clusters ?? {}).flatMap<RegisteredCluster>(([name, cluster]) => {
      if (statelessClusters?.[name]) return [];
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
 * Gets the connections Headlamp discovered from Cluster Inventory API ClusterProfiles and
 * Cluster API Clusters. The result updates as connections are added or removed. An owner
 * resource that is deleted and created again under the same name gets a new connection ID.
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

/** A discovered connection with the resource it was discovered from. */
export type RegisteredClusterWithOwner<K> = RegisteredCluster &
  (
    | {
        /** The owner resource, read from its management cluster with the user's credentials. */
        owner: K;
        ownerError: null;
      }
    | {
        owner: null;
        /** Why the user could not read the owner resource. */
        ownerError: ApiError;
      }
  );

export interface UseRegisteredClusterOwnersOptions
  extends Omit<UseRegisteredClustersOptions, 'source'>,
    QueryParameters {}

/** The connections found with their owner resources. */
export interface RegisteredClusterOwners<K> {
  clusters: readonly RegisteredClusterWithOwner<K>[];
  /** Whether the owner resources are still loading. */
  isLoading: boolean;
}

/**
 * @hidden Used by the resource classes of the owner resources.
 *
 * Gets the connections that one discovery source found, each with its owner resource.
 * The owner resources are listed and watched with the user's credentials, so a
 * connection is returned only when the user can read its owner. A connection whose
 * owner is excluded by the query parameters is left out, and one whose owner the user
 * cannot read is returned with the error.
 */
export function useRegisteredClusterOwners<K extends KubeObject>(
  ownerClass: (new (...args: any) => K) & typeof KubeObject<any>,
  source: string,
  { originCluster, originNamespace, ...queryParams }: UseRegisteredClusterOwnersOptions = {}
): RegisteredClusterOwners<K> {
  const registrations = useRegisteredClusters({ source, originCluster, originNamespace });

  // A management cluster without a Headlamp connection cannot be read.
  const requests = useMemo(() => {
    const namespaces = new Map<string, Set<string>>();
    for (const { origin } of registrations) {
      if (!origin.cluster) continue;
      const clusterNamespaces = namespaces.get(origin.cluster) ?? new Set<string>();
      clusterNamespaces.add(origin.resource.namespace);
      namespaces.set(origin.cluster, clusterNamespaces);
    }
    return [...namespaces]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cluster, clusterNamespaces]) => ({
        cluster,
        namespaces: [...clusterNamespaces].sort(),
      }));
  }, [registrations]);

  const owners = ownerClass.useList({ requests, ...queryParams });

  const clusters = useMemo(
    () =>
      registrations.flatMap<RegisteredClusterWithOwner<K>>(registration => {
        const { cluster, resource } = registration.origin;
        const owner = owners.items?.find(
          item =>
            item.cluster === cluster &&
            item.metadata.namespace === resource.namespace &&
            item.metadata.name === resource.name &&
            item.metadata.uid === resource.uid
        );
        if (owner) return [{ ...registration, owner, ownerError: null }];

        const ownerError = owners.errors?.find(
          error =>
            error.cluster === cluster &&
            (!error.namespace || error.namespace === resource.namespace)
        );
        return ownerError ? [{ ...registration, owner: null, ownerError }] : [];
      }),
    [registrations, owners.items, owners.errors]
  );

  return { clusters, isLoading: requests.length > 0 && owners.isLoading };
}
