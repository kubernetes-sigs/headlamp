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
  versions?: CRDVersionLike[];
  scope?: string;
}

/**
 * Subset of a CRD `spec.versions[i]` entry used by the helpers. All fields
 * are optional because partial watch updates can deliver a half-populated
 * entry; the validation logic decides what counts as usable.
 */
export interface CRDVersionLike {
  name?: string;
  served?: boolean;
  storage?: boolean;
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

/**
 * Identifiers that `validateCRDSpec` can produce in its `missing` array.
 * Typing this as a literal union (rather than `string`) lets
 * `describeMissingField` exhaustively switch over the set: any future
 * identifier added here without a matching `case` becomes a compile error,
 * so the user-facing error message can never accidentally surface a raw
 * sentinel string.
 */
export type MissingFieldId =
  | 'names.plural'
  | 'names.kind'
  | 'group'
  | 'scope'
  | 'scope.invalid'
  | 'versions'
  | 'versions[].name+served';

/**
 * Result returned by `validateCRDSpec`. Discriminated on `ok` so callers can
 * pattern-match without separately inspecting `missing.length`.
 */
export type CRDValidation =
  | { ok: true; missing: []; usableVersions: UsableCRDVersion[] }
  | { ok: false; missing: MissingFieldId[]; usableVersions: UsableCRDVersion[] };

/**
 * Validates a CRD spec and returns the list of missing required fields plus
 * the subset of version entries that are usable (named and served).
 *
 * Treats the older v1beta1 single-version shape (`spec.version` set without
 * `spec.versions[]`) as usable. `names.singular` is intentionally not
 * required because Kubernetes treats it as optional and the server defaults
 * it from `kind`. `group` and `scope` are required because empty values
 * would route requests to the wrong endpoint.
 */
export function validateCRDSpec(spec: CRDSpecLike | undefined): CRDValidation {
  const missing: MissingFieldId[] = [];
  if (!spec?.names?.plural) missing.push('names.plural');
  if (!spec?.names?.kind) missing.push('names.kind');
  if (!spec?.group) missing.push('group');
  if (!spec?.scope) {
    missing.push('scope');
  } else if (spec.scope !== 'Namespaced' && spec.scope !== 'Cluster') {
    // A non-empty but unrecognized scope would silently downgrade to
    // cluster-scoped via the `spec.scope === 'Namespaced'` check at call
    // sites, routing requests to the wrong endpoint. Treat it as missing
    // so callers either reject the CRD or fall back to safe defaults.
    missing.push('scope.invalid');
  }

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
 * Maps a `validateCRDSpec` missing-field identifier to a human-readable
 * phrase suitable for error messages and UI labels. Internal identifiers
 * like `versions[].name+served` are fine for programmatic checks but
 * unhelpful when they surface in user-facing diagnostics.
 */
export function describeMissingField(id: MissingFieldId): string {
  switch (id) {
    case 'names.plural':
      return '`spec.names.plural`';
    case 'names.kind':
      return '`spec.names.kind`';
    case 'group':
      return '`spec.group`';
    case 'scope':
      return '`spec.scope`';
    case 'scope.invalid':
      return '`spec.scope` (must be "Namespaced" or "Cluster")';
    case 'versions':
      return 'at least one entry in `spec.versions`';
    case 'versions[].name+served':
      return 'a served `spec.versions[]` entry with a non-empty `name`';
  }
}

/**
 * Resolves `[group, version, plural]` from a CRD spec, or returns `null` when
 * the spec is incomplete. Prefer the storage version, fall back to the first
 * served version; honor `spec.version` (the v1beta1 single-version field)
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
  // is populated, only honor `spec.version` if it matches a served entry
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

/**
 * Duck-typed surface a CRD instance might expose. New in-tree code has both
 * methods; older plugin bundles only ship `getMainAPIGroup()`.
 */
export interface CRDApiGroupSource {
  getMainAPIGroupOrNull?: () => [string, string, string] | null;
  getMainAPIGroup?: () => [string, string, string] | null | undefined;
}

/**
 * Validates that a value is a `[string, string, string]` tuple with every
 * component non-empty. Used to gate both the new and legacy API surfaces of
 * a CRD instance through the same check, including catching the all-empty
 * sentinel `["", "", ""]` that `getMainAPIGroup()` returns for an incomplete
 * spec and the `[group, undefined, plural]` shape an older legacy
 * implementation could produce when no version is resolved.
 */
function isValidApiGroupTuple(value: unknown): value is [string, string, string] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === 'string' &&
    value[0] !== '' &&
    typeof value[1] === 'string' &&
    value[1] !== '' &&
    typeof value[2] === 'string' &&
    value[2] !== ''
  );
}

/**
 * Resolves `[group, version, plural]` from either the new or the legacy
 * surface on a CRD instance, returning `null` when neither yields a usable
 * identity. Plugin bundles ship their own copy of this module's code, so a
 * plugin built before `getMainAPIGroupOrNull()` existed will not have the
 * method on its CRD instance at runtime. We duck-type the call rather than
 * assume the new API is present, and we route both surfaces through the
 * same tuple validator so an all-empty sentinel or a missing version
 * component is treated as "no usable identity" on either path.
 */
export function resolveCRDApiGroup(
  crd: CRDApiGroupSource | null | undefined
): [string, string, string] | null {
  if (!crd) return null;
  if (typeof crd.getMainAPIGroupOrNull === 'function') {
    const result = crd.getMainAPIGroupOrNull();
    return isValidApiGroupTuple(result) ? result : null;
  }
  if (typeof crd.getMainAPIGroup === 'function') {
    const result = crd.getMainAPIGroup();
    return isValidApiGroupTuple(result) ? result : null;
  }
  return null;
}
