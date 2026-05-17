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

import type { KubeObjectInterface } from './KubeObject';

/**
 * Subset of the `KubeCRD['spec']` shape that the helpers below depend on.
 * Lives in this standalone module so the helpers can be imported (and unit
 * tested) without pulling in `lib/k8s/index.ts`, which transitively loads
 * every built-in resource class and creates a circular import that vitest
 * cannot resolve in isolation.
 */
export interface CRDSpecLike {
  group?: string;
  version?: string;
  names?: {
    plural?: string;
    singular?: string;
    kind?: string;
    listKind?: string;
  };
  versions?: Array<CRDVersionLike | undefined>;
  scope?: string;
}

export interface CRDVersionLike {
  name?: string;
  served?: boolean;
  storage?: boolean;
}

export interface KubeCRDLike extends KubeObjectInterface {
  spec: CRDSpecLike;
}

/**
 * Strongly typed "valid" subset of a usable version entry. `validateCRDSpec`
 * narrows the array elements to this shape after the served+name filter.
 */
export interface UsableCRDVersion {
  name: string;
  served: true;
  storage?: boolean;
}

export type CRDValidation =
  | { ok: true; missing: []; usableVersions: UsableCRDVersion[] }
  | { ok: false; missing: string[]; usableVersions: UsableCRDVersion[] };

/**
 * Validates a CRD spec and returns the list of missing required fields plus
 * the subset of version entries that are usable (named and served).
 *
 * Treats the older v1beta1 single-version shape (`spec.version` set without
 * `spec.versions[]`) as usable. `names.singular` is intentionally not
 * required — Kubernetes treats it as optional and the server defaults it
 * from `kind`. `group` and `scope` are required because empty values would
 * route requests to the wrong endpoint.
 */
export function validateCRDSpec(spec: CRDSpecLike | undefined): CRDValidation {
  const missing: string[] = [];
  if (!spec?.names?.plural) missing.push('names.plural');
  if (!spec?.names?.kind) missing.push('names.kind');
  if (!spec?.group) missing.push('group');
  if (!spec?.scope) missing.push('scope');

  const versions = spec?.versions ?? [];
  const usableVersions = versions.filter((v): v is UsableCRDVersion => !!v?.name && !!v.served);
  const hasUsableVersion = usableVersions.length > 0 || (versions.length === 0 && !!spec?.version);
  if (!hasUsableVersion) {
    missing.push(versions.length ? 'versions[].name+served' : 'versions');
  }

  if (!spec || missing.length > 0) {
    return { ok: false, missing, usableVersions };
  }
  return { ok: true, missing: [], usableVersions };
}

/**
 * Resolves `[group, version, plural]` from a CRD spec, or returns `null` when
 * the spec is incomplete. Prefer the storage version, fall back to the first
 * served version; honour `spec.version` (the v1beta1 single-version field)
 * when `spec.versions` is empty, or when it matches a served entry there.
 */
export function selectMainAPIGroup(spec: CRDSpecLike | undefined): [string, string, string] | null {
  if (!spec?.group || !spec?.names?.plural) {
    return null;
  }
  const versions = spec.versions ?? [];
  let resolvedVersion: string | undefined;
  for (const versionItem of versions) {
    if (!versionItem?.name) continue;
    if (!versionItem.served) continue;
    if (versionItem.storage) {
      resolvedVersion = versionItem.name;
      break;
    } else if (!resolvedVersion) {
      resolvedVersion = versionItem.name;
    }
  }
  // `spec.version` is the v1beta1 single-version field. When `spec.versions`
  // is populated, only honour `spec.version` if it matches a served entry
  // there. When `spec.versions` is missing/empty (an older v1beta1 CRD shape
  // that never populated the array), accept `spec.version` as-is.
  let version: string | undefined = resolvedVersion;
  if (spec.version) {
    if (versions.length === 0) {
      version = spec.version;
    } else if (versions.some(v => v?.name === spec.version && v?.served)) {
      version = spec.version;
    }
  }
  if (!version) {
    return null;
  }
  return [spec.group, version, spec.names.plural];
}
