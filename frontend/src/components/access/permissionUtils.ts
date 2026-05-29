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

import type {
  SelfSubjectResourceRule,
  SelfSubjectRulesReviewStatus,
} from '../../lib/k8s/api/v1/clusterApi';
import type { ApiResource } from '../../lib/k8s/api/v2/ApiResource';

export type PermissionState = 'allowed' | 'limited' | 'denied';

function includesValue(values: string[] | undefined, value: string) {
  return values?.includes('*') || values?.includes(value);
}

function ruleMatchesResource(rule: SelfSubjectResourceRule, resource: ApiResource, verb: string) {
  return (
    includesValue(rule.verbs, verb) &&
    includesValue(rule.apiGroups, resource.groupName ?? '') &&
    includesValue(rule.resources, resource.pluralName)
  );
}

export function getPermissionState(
  status: SelfSubjectRulesReviewStatus | undefined,
  resource: ApiResource,
  verb: string
): PermissionState {
  let hasNameLimitedAccess = false;

  for (const rule of status?.resourceRules ?? []) {
    if (!ruleMatchesResource(rule, resource, verb)) {
      continue;
    }

    if (rule.resourceNames && rule.resourceNames.length > 0) {
      hasNameLimitedAccess = true;
      continue;
    }

    return 'allowed';
  }

  return hasNameLimitedAccess ? 'limited' : 'denied';
}

const RESOURCE_PRIORITY = [
  'pods',
  'deployments',
  'statefulsets',
  'daemonsets',
  'replicasets',
  'jobs',
  'cronjobs',
  'services',
  'ingresses',
  'configmaps',
  'secrets',
  'serviceaccounts',
  'namespaces',
  'nodes',
  'roles',
  'rolebindings',
  'clusterroles',
  'clusterrolebindings',
];

export function sortResourcesForPermissions(resources: ApiResource[]) {
  return [...resources].sort((a, b) => {
    const aIndex = RESOURCE_PRIORITY.indexOf(a.pluralName);
    const bIndex = RESOURCE_PRIORITY.indexOf(b.pluralName);

    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) {
        return 1;
      }
      if (bIndex === -1) {
        return -1;
      }
      return aIndex - bIndex;
    }

    return a.kind.localeCompare(b.kind);
  });
}
