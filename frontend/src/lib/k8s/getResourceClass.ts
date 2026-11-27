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

// Resource classes import this module directly to avoid a cycle through index.ts,
// whose namespace exports are initialized eagerly by bundlers.
import type { KubeObjectClass } from './KubeObject';
import { ResourceClasses } from './resourceClasses';

/**
 * Extracts the API group from a "GROUP/VERSION" (or bare "VERSION") string.
 *
 * A bare version (no "/") belongs to the core group, represented as ''.
 */
function apiGroupOf(apiVersion: string): string {
  return apiVersion.includes('/') ? apiVersion.split('/')[0] : '';
}

/**
 * Looks up the {@link KubeObjectClass} registered for a given `kind`, guarding against
 * a CRD sharing a `kind` name with a built-in resource from a different API group
 * (e.g. Kueue's `kueue.x-k8s.io/v1beta1` `Workload` vs. `scheduling.k8s.io` `Workload`).
 *
 * @param kind - the kind of the resource, e.g. "Pod".
 * @param apiVersion - the apiVersion of the specific object being resolved, e.g. "apps/v1".
 *   If omitted or empty, the class registered for `kind` is returned unchecked.
 * @returns the matching class, or null if there is no class registered for `kind`, or if
 *   `apiVersion` is given and its group doesn't match any of the class's registered groups.
 */
export function getResourceClass(kind: string, apiVersion?: string): KubeObjectClass | null {
  // Guard against `kind` resolving to an inherited property (e.g. "constructor" or
  // "toString") instead of a registered resource class.
  if (!Object.prototype.hasOwnProperty.call(ResourceClasses, kind)) {
    return null;
  }

  const cls = (ResourceClasses as Record<string, KubeObjectClass>)[kind];

  if (!apiVersion) {
    return cls;
  }

  const classApiVersions = Array.isArray(cls.apiVersion) ? cls.apiVersion : [cls.apiVersion];
  const requestedGroup = apiGroupOf(apiVersion);
  const groupMatches = classApiVersions.some(version => apiGroupOf(version) === requestedGroup);

  return groupMatches ? cls : null;
}
