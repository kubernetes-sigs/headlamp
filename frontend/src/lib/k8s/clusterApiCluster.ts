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

export interface KubeClusterAPICluster extends KubeObjectInterface {
  spec?: {
    controlPlaneEndpoint?: { host: string; port: number };
    paused?: boolean;
  };
}

/**
 * A Cluster API Cluster, from which Headlamp can discover a connection. Its kind is
 * `Cluster`; the class name keeps it apart from Headlamp's own cluster connections.
 */
export class ClusterAPICluster extends KubeObject<KubeClusterAPICluster> {
  static kind = 'Cluster';
  static apiName = 'clusters';
  static apiVersion = 'cluster.x-k8s.io/v1beta2';
  static isNamespaced = true;

  /**
   * Gets the connections Headlamp discovered from Cluster API Clusters, each with its
   * Cluster read with the user's credentials. The user needs `list` and `watch` on Clusters
   * in the namespaces of the connections. A connection whose Cluster does not match the
   * query parameters is left out, and one whose Cluster the user cannot read is returned
   * with `owner: null` and the error as `ownerError`.
   * Pass `options` to filter by management cluster, namespace, and query parameters such as
   * `labelSelector`. The result also reports whether the owner resources are still loading.
   */
  static useRegisteredClusters = useClusterAPIRegistrations;

  get spec() {
    return this.jsonData.spec;
  }
}

function useClusterAPIRegistrations(
  options?: UseRegisteredClusterOwnersOptions
): RegisteredClusterOwners<ClusterAPICluster> {
  return useRegisteredClusterOwners(ClusterAPICluster, 'cluster_api', options);
}
