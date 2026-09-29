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

import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { Cluster } from '../../../lib/k8s/cluster';

/** One cluster per origin kind, already sorted by name like getCustomClusterNames returns them. */
export const CLUSTERS: Cluster[] = [
  {
    name: 'aks-prod',
    auth_type: '',
    meta_data: {
      source: 'kubeconfig',
      origin: { kubeconfig: '/home/user/.kube/config' },
    },
  },
  {
    name: 'in-cluster',
    auth_type: '',
    meta_data: {
      source: 'incluster',
    },
  },
  {
    name: 'plugin-cluster',
    auth_type: '',
    meta_data: {
      source: 'dynamic_cluster',
    },
  },
  {
    name: 'spoke-a',
    auth_type: '',
    meta_data: {
      source: 'cluster_inventory',
      clusterInventory: {
        conditions: [{ type: 'ControlPlaneHealthy', status: 'True' }],
      },
    },
  },
];

export const CLUSTERS_BY_NAME: { [name: string]: Cluster } = Object.fromEntries(
  CLUSTERS.map(cluster => [cluster.name, cluster])
);

export const VERSIONS = {
  'aks-prod': { gitVersion: 'v1.31.2' },
  'in-cluster': { gitVersion: 'v1.30.6' },
  'plugin-cluster': { gitVersion: 'v1.29.9' },
  'spoke-a': { gitVersion: 'v1.31.0' },
};

export const WARNING_LABELS: { [cluster: string]: string } = {
  'aks-prod': '2 warnings',
  'in-cluster': '',
  'plugin-cluster': '1 warning',
  'spoke-a': '',
};

/** A Cluster Inventory cluster whose control plane condition reports a failure. */
export const UNHEALTHY_INVENTORY_CLUSTER: Cluster = {
  name: 'spoke-b',
  auth_type: '',
  meta_data: {
    source: 'cluster_inventory',
    clusterInventory: {
      conditions: [
        {
          type: 'ControlPlaneHealthy',
          status: 'False',
          reason: 'HealthCheckFailed',
          message: 'control plane endpoint is not ready',
          lastTransitionTime: '2026-05-10T00:00:00Z',
        },
      ],
    },
  },
};

export function makeError(status: number, message: string): ApiError {
  return { status, message } as ApiError;
}
