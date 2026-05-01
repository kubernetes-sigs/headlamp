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
import type { ApiResource } from './api/v2/ApiResource';
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
      { apiGroup: 'storage.k8s.io', includeKinds: ['StorageClass'] },
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
    label: 'Gateway',
    icon: 'mdi:lan-connect',
    description: 'Gateway API resources',
    resources: [{ apiGroup: 'gateway.networking.k8s.io' }],
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
      { apiGroup: 'node.k8s.io', includeKinds: ['RuntimeClass'] },
    ],
  },
];

const makeCategoryForApiGroup = memoize((apiGroup: string) => ({
  label: apiGroup,
  icon: 'mdi:puzzle-outline',
  description: `Resources from the ${apiGroup} API group`,
}));

/**
 * Find which predefined category matches the given API group and kind.
 * Returns null if no category matches.
 */
export function findCategoryForResource(apiGroup: string, kind: string): ResourceCategory | null {
  for (const category of categoriesConfig) {
    if (!category.resources) continue;
    for (const selector of category.resources) {
      if (selector.apiGroup !== apiGroup) continue;
      if ('includeKinds' in selector && !selector.includeKinds.includes(kind)) continue;
      if ('excludeKinds' in selector && selector.excludeKinds?.includes(kind)) continue;
      return category;
    }
  }
  return null;
}

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

  return findCategoryForResource(apiGroup, kind) ?? makeCategoryForApiGroup(apiGroup);
};

/** The "Custom Resources" category for resources that don't match any predefined category. */
export const customResourcesCategory: ResourceCategory = {
  label: 'Custom Resources',
  icon: 'mdi:puzzle-outline',
  description: 'Custom resource definitions',
};

/**
 * Groups API resources by ResourceCategory.
 *
 * Each resource is either:
 * - Placed in a predefined category (from categoriesConfig via findCategoryForResource)
 * - Placed in "Custom Resources" if it's a known CRD
 * - Skipped otherwise
 *
 * Resources within each category are sorted alphabetically by kind.
 */
export function groupByCategory(
  resources: ApiResource[],
  crdNames?: Set<string>
): Map<ResourceCategory, ApiResource[]> {
  // Pre-seed with categoriesConfig to preserve defined order
  const result = new Map<ResourceCategory, ApiResource[]>();
  for (const cat of categoriesConfig) {
    result.set(cat, []);
  }

  const otherResources: ApiResource[] = [];

  for (const resource of resources) {
    const category = findCategoryForResource(resource.groupName ?? 'core', resource.kind);

    if (category) {
      result.get(category)!.push(resource);
    } else if (resource.groupName) {
      const crdName = `${resource.pluralName}.${resource.groupName}`;
      if (!crdNames || crdNames.has(crdName)) {
        otherResources.push(resource);
      }
    }
  }

  // Remove empty predefined categories
  for (const [cat, items] of result) {
    if (items.length === 0) {
      result.delete(cat);
    } else {
      items.sort((a, b) => a.kind.localeCompare(b.kind));
    }
  }

  // Append Custom Resources last
  if (otherResources.length > 0) {
    otherResources.sort((a, b) => a.kind.localeCompare(b.kind));
    result.set(customResourcesCategory, otherResources);
  }

  return result;
}
