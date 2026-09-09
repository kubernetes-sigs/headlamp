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

import { isEqual, keyBy } from 'lodash';
import { useMemo } from 'react';
import { setClusterRegistrations } from '../redux/configSlice';
import { useTypedSelector } from '../redux/hooks';
import store from '../redux/stores/store';

export interface RegisteredCluster {
  id: string;
  displayName: string;
  source: string;
  origin: {
    cluster: string;
    resource: {
      apiVersion: string;
      kind: string;
      namespace?: string;
      name: string;
      uid: string;
    };
  };
}

export interface RegisteredClusterSnapshot {
  items: readonly RegisteredCluster[];
}

export interface UseRegisteredClustersOptions {
  source?: string;
  originCluster?: string;
  originNamespace?: string;
}

/**
 * Publishes a registration snapshot to the redux store, keeping the previous value when
 * nothing changed so that a re-fetch does not re-render subscribers.
 *
 * @param next - Snapshot as published by the backend, or undefined when registrations
 * are disabled.
 */
export function setRegisteredClusterSnapshot(next: RegisteredClusterSnapshot | undefined): void {
  const registrations = next ? keyBy(next.items, 'id') : null;
  if (isEqual(store.getState().config.clusterRegistrations, registrations)) {
    return;
  }

  store.dispatch(setClusterRegistrations(registrations));
}

/**
 * Hook for getting the dynamically discovered, currently routable clusters.
 *
 * The IDs can be passed directly to Kubernetes resource hooks, for example:
 * `ConfigMap.useList({ clusters: registrations.map(item => item.id) })`.
 *
 * @param options - Optional filters on the discovery source and the origin of the
 * resource a registration was discovered from.
 *
 * @returns the registrations matching the given filters.
 */
export function useRegisteredClusters(
  options: UseRegisteredClustersOptions = {}
): readonly RegisteredCluster[] {
  const registrations = useTypedSelector(state => state.config.clusterRegistrations);
  const { source, originCluster, originNamespace } = options;

  return useMemo(
    () =>
      Object.values(registrations ?? {}).filter(
        item =>
          (source === undefined || item.source === source) &&
          (originCluster === undefined || item.origin.cluster === originCluster) &&
          (originNamespace === undefined || item.origin.resource.namespace === originNamespace)
      ),
    [registrations, source, originCluster, originNamespace]
  );
}

/** Returns the registration a cluster name refers to, if it is a discovered cluster. */
export function getClusterRegistration(cluster: string): RegisteredCluster | undefined {
  return store.getState().config.clusterRegistrations?.[cluster];
}

/**
 * Returns the backend path that addresses a cluster. A registration routes through the
 * cluster it was discovered from.
 */
export function getClusterRoute(cluster: string): string {
  const registration = getClusterRegistration(cluster);
  if (!registration) {
    return cluster;
  }

  return `${registration.origin.cluster}/federated/${registration.id}`;
}
