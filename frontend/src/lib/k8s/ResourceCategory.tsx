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

import { memoize } from 'lodash';
import { type KubeObject } from './KubeObject';

/**
 * User friendly alternative to Kubernetes API groups
 *
 * Combines multiple API groups along some resources from core (legacy) group
 * into one entity with a useful label.
 */
export interface ResourceCategory {
  label: string;
  /** MDI icon */
  icon: string;
  /** Description of the group */
  description: string;
  /** Which api groups are included */
  apiGroups?: string[];
  /** Which kinds from core api group are included */
  coreKinds?: string[];
  /** Ignore certain kinds from the groups */
  excludeKinds?: string[];
}

export const categoriesConfig: ResourceCategory[] = [
  {
    label: 'Workloads',
    icon: 'mdi:circle-slice-2',
    description: 'Applications and compute resources',
    apiGroups: ['apps', 'batch'],
    coreKinds: ['Pod'],
    excludeKinds: ['ControllerRevision'],
  },
  {
    label: 'Storage',
    icon: 'mdi:database',
    description: 'Persistent data storage',
    apiGroups: ['storage.k8s.io'],
    coreKinds: ['PersistentVolumeClaim', 'PersistentVolume'],
    excludeKinds: ['CSIStorageCapacity'],
  },
  {
    label: 'Network',
    icon: 'mdi:folder-network-outline',
    description: 'Network connectivity and exposure',
    apiGroups: ['networking.k8s.io'],
    coreKinds: ['Service', 'Endpoints'],
  },
  {
    label: 'Security',
    icon: 'mdi:account-lock',
    description: 'Role-based access control',
    apiGroups: ['rbac.authorization.k8s.io'],
    coreKinds: ['ServiceAccount'],
  },
  {
    label: 'Configuration',
    icon: 'mdi:format-list-checks',
    description: 'Configuration data and secrets',
    apiGroups: [
      'autoscaling',
      'policy',
      'scheduling.k8s.io',
      'coordination.k8s.io',
      'admissionregistration.k8s.io',
    ],
    coreKinds: ['ConfigMap', 'Secret', 'ResourceQuota', 'LimitRange'],
  },
];

const makeCategoryForApiGroup = memoize((apiGroup: string) => ({
  label: apiGroup,
  icon: 'mdi:puzzle-outline',
  description: `Resources from the ${apiGroup} API group`,
}));

/**
 * Get category of the given kubernetes object
 *
 * @param resource Kubernetes object
 * @returns resource category
 */
export const getKubeObjectCategory = (resource: KubeObject): ResourceCategory => {
  const apiVersion = resource.jsonData.apiVersion;
  const kind = resource.jsonData.kind;
  const apiGroup = apiVersion.includes('/') ? apiVersion.split('/')[0] : 'core';

  for (const config of categoriesConfig) {
    const isExcluded = config.excludeKinds && config.excludeKinds.includes(kind);
    if (isExcluded) {
      continue;
    }

    const inGroup = config.apiGroups && config.apiGroups.includes(apiGroup);
    if (inGroup) {
      return config;
    }

    const isInCoreGroup =
      apiGroup === 'core' && config.coreKinds && config.coreKinds.includes(kind);
    if (isInCoreGroup) {
      return config;
    }
  }

  // Fallback to automatically generated group for the API group
  return makeCategoryForApiGroup(apiGroup);
};
