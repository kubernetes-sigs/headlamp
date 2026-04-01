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
 * Selects which resources from a Kubernetes API group belong to a category.
 *
 * Either allowlist specific kinds with `includeKinds`, or include the whole
 * group and optionally deny certain kinds with `excludeKinds`.
 */
export type ResourceSelector =
  | { apiGroup: string; includeKinds: string[] }
  | { apiGroup: string; excludeKinds?: string[] };

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
  /** Description of the category */
  description: string;
  /** Selectors defining which resources belong to this category */
  resources?: ResourceSelector[];
}

export const categoriesConfig: ResourceCategory[] = [
  {
    label: 'Workloads',
    icon: 'mdi:circle-slice-2',
    description: 'Applications and compute resources',
    resources: [
      { apiGroup: 'apps', excludeKinds: ['ControllerRevision'] },
      { apiGroup: 'batch' },
      { apiGroup: 'core', includeKinds: ['Pod'] },
    ],
  },
  {
    label: 'Storage',
    icon: 'mdi:database',
    description: 'Persistent data storage',
    resources: [
      { apiGroup: 'storage.k8s.io', excludeKinds: ['CSIStorageCapacity'] },
      { apiGroup: 'core', includeKinds: ['PersistentVolumeClaim', 'PersistentVolume'] },
    ],
  },
  {
    label: 'Network',
    icon: 'mdi:folder-network-outline',
    description: 'Network connectivity and exposure',
    resources: [
      { apiGroup: 'networking.k8s.io' },
      { apiGroup: 'core', includeKinds: ['Service', 'Endpoints', 'EndpointSlice'] },
    ],
  },
  {
    label: 'Security',
    icon: 'mdi:account-lock',
    description: 'Role-based access control',
    resources: [
      { apiGroup: 'rbac.authorization.k8s.io' },
      { apiGroup: 'core', includeKinds: ['ServiceAccount'] },
    ],
  },
  {
    label: 'Configuration',
    icon: 'mdi:format-list-checks',
    description: 'Configuration data and secrets',
    resources: [
      { apiGroup: 'autoscaling' },
      { apiGroup: 'policy' },
      { apiGroup: 'scheduling.k8s.io' },
      { apiGroup: 'coordination.k8s.io' },
      { apiGroup: 'admissionregistration.k8s.io' },
      { apiGroup: 'core', includeKinds: ['ConfigMap', 'Secret', 'ResourceQuota', 'LimitRange'] },
    ],
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

  for (const category of categoriesConfig) {
    if (!category.resources) continue;

    for (const selector of category.resources) {
      if (selector.apiGroup !== apiGroup) continue;
      if ('includeKinds' in selector && !selector.includeKinds.includes(kind)) continue;
      if ('excludeKinds' in selector && selector.excludeKinds?.includes(kind)) continue;
      return category;
    }
  }

  // Fallback to automatically generated category for the API group
  return makeCategoryForApiGroup(apiGroup);
};
