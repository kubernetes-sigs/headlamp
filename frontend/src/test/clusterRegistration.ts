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

import type { RegisteredCluster } from '../lib/clusterRegistration';

/** Builds a Cluster Inventory registration, overriding the fields a test cares about. */
export const makeRegisteredCluster = (
  partial: Partial<RegisteredCluster> = {}
): RegisteredCluster => ({
  id: 'hr-v1-spoke',
  displayName: 'spoke',
  source: 'cluster-inventory',
  origin: {
    cluster: 'hub',
    resource: {
      apiVersion: 'multicluster.x-k8s.io/v1alpha1',
      kind: 'ClusterProfile',
      namespace: 'headlamp',
      name: 'spoke',
      uid: 'uid-spoke',
    },
  },
  ...partial,
});
