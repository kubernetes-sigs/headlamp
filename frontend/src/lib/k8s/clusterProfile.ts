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

import {
  type RegisteredClusterOwners,
  useRegisteredClusterOwners,
  type UseRegisteredClusterOwnersOptions,
} from '../clusterRegistration';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeClusterProfile extends KubeObjectInterface {
  spec: {
    displayName?: string;
    /** The cluster manager that owns this ClusterProfile, for example `open-cluster-management`. */
    clusterManager: { name: string };
  };
}

/** A Cluster Inventory API ClusterProfile, from which Headlamp can discover a connection. */
export class ClusterProfile extends KubeObject<KubeClusterProfile> {
  static kind = 'ClusterProfile';
  static apiName = 'clusterprofiles';
  static apiVersion = 'multicluster.x-k8s.io/v1alpha1';
  static isNamespaced = true;

  /**
   * Gets the connections Headlamp discovered from ClusterProfiles, each with its
   * ClusterProfile read with the user's credentials. The user needs `list` and `watch` on
   * ClusterProfiles in the namespaces of the connections. A connection whose ClusterProfile
   * does not match the query parameters is left out, and one whose ClusterProfile the user
   * cannot read is returned with `owner: null` and the error as `ownerError`.
   * Pass `options` to filter by management cluster, namespace, and query parameters such as
   * `labelSelector`. The result also reports whether the owner resources are still loading.
   */
  static useRegisteredClusters = useClusterProfileRegistrations;

  get spec() {
    return this.jsonData.spec;
  }
}

function useClusterProfileRegistrations(
  options?: UseRegisteredClusterOwnersOptions
): RegisteredClusterOwners<ClusterProfile> {
  return useRegisteredClusterOwners(ClusterProfile, 'cluster_inventory', options);
}
