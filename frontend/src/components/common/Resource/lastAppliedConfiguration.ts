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

import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import isPlainObject from 'lodash/isPlainObject';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { parseRam } from '../../../lib/units';

/** Annotation set by client-side `kubectl apply` with the manifest that was applied. */
export const LAST_APPLIED_ANNOTATION = 'kubectl.kubernetes.io/last-applied-configuration';

/** Metadata fields populated by the API server, which are never part of an applied manifest. */
const SERVER_METADATA_FIELDS = [
  'managedFields',
  'resourceVersion',
  'uid',
  'creationTimestamp',
  'generation',
  'selfLink',
];

/**
 * Parses the last-applied-configuration annotation of the given object.
 *
 * @returns The parsed manifest, or null if the annotation is missing or is not a JSON object.
 */
export function parseLastAppliedConfiguration(
  item: KubeObjectInterface | null | undefined
): KubeObjectInterface | null {
  const raw = item?.metadata?.annotations?.[LAST_APPLIED_ANNOTATION];
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Returns a copy of the object without the fields the API server populates (status, managedFields,
 * resourceVersion, etc.) and without the last-applied-configuration annotation itself, so it can be
 * compared with the applied manifest.
 */
export function stripServerFields(item: KubeObjectInterface): KubeObjectInterface {
  const cloned = cloneDeep(item);
  delete (cloned as Record<string, any>).status;

  const metadata = cloned.metadata as Record<string, any> | undefined;
  if (metadata) {
    SERVER_METADATA_FIELDS.forEach(field => delete metadata[field]);

    if (metadata.annotations) {
      delete metadata.annotations[LAST_APPLIED_ANNOTATION];
      if (Object.keys(metadata.annotations).length === 0) {
        delete metadata.annotations;
      }
    }
  }

  return cloned;
}

/**
 * Returns a copy of the applied value without the object fields that are set to null and are unset
 * in the live object. A null field in an applied manifest (e.g. `creationTimestamp: null` from
 * `kubectl create --dry-run`) means the field is unset, so it matches a live object without it.
 * Nulls whose field does have a live value are kept, as that is a real difference.
 */
export function omitNullFields(applied: unknown, live: unknown): unknown {
  if (Array.isArray(applied)) {
    const liveArray = Array.isArray(live) ? live : [];
    return applied.map((item, index) => omitNullFields(item, liveArray[index]));
  }
  if (isPlainObject(applied)) {
    const liveObj = (isPlainObject(live) ? live : {}) as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    Object.entries(applied as Record<string, unknown>).forEach(([key, fieldValue]) => {
      if (fieldValue !== null) {
        result[key] = omitNullFields(fieldValue, liveObj[key]);
      } else if (liveObj[key] !== null && liveObj[key] !== undefined) {
        result[key] = fieldValue;
      }
    });
    return result;
  }
  return applied;
}

/** Resource quantities that parseRam converts exactly, e.g. "1", "0.5", "500m", "512Mi", "2G". */
const QUANTITY_REGEX = /^\d+(\.\d+)?(m|[KMGTPE]i?)?$/;

/**
 * Whether an applied value and a live value are the same. Besides plain equality, this accepts
 * resource quantities the API server stored in canonical form, e.g. `cpu: 1` as "1" and "0.5Gi" as
 * "512Mi". To avoid matching plain strings such as "1.10" and "1.1", quantities are only compared
 * when the applied value is a number or one of them has a unit.
 */
function isSameValue(applied: unknown, live: unknown): boolean {
  if (isEqual(applied, live)) {
    return true;
  }
  if (typeof live !== 'string' || (typeof applied !== 'string' && typeof applied !== 'number')) {
    return false;
  }

  const appliedStr = String(applied);
  if (!QUANTITY_REGEX.test(appliedStr) || !QUANTITY_REGEX.test(live)) {
    return false;
  }
  const hasUnit = /[a-zA-Z]$/.test(appliedStr) || /[a-zA-Z]$/.test(live);
  return (typeof applied === 'number' || hasUnit) && parseRam(appliedStr) === parseRam(live);
}

/**
 * Aligns the live object with the applied manifest for display: values that are the same (see
 * isSameValue) are shown as applied, and fields only present in the live object, which are mostly
 * defaults set by the API server, are left out unless `keepLiveOnlyFields` is set. Array items
 * beyond the applied length (e.g. an injected sidecar container) are always kept, as they are a
 * real difference.
 */
export function projectOntoApplied(
  live: unknown,
  applied: unknown,
  keepLiveOnlyFields = false
): unknown {
  if (isPlainObject(live) && isPlainObject(applied)) {
    const liveObj = live as Record<string, unknown>;
    const appliedObj = applied as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    Object.keys(liveObj).forEach(key => {
      if (key in appliedObj) {
        result[key] = projectOntoApplied(liveObj[key], appliedObj[key], keepLiveOnlyFields);
      } else if (keepLiveOnlyFields) {
        result[key] = liveObj[key];
      }
    });
    return result;
  }

  if (Array.isArray(live) && Array.isArray(applied)) {
    return live.map((liveItem, index) =>
      index < applied.length
        ? projectOntoApplied(liveItem, applied[index], keepLiveOnlyFields)
        : liveItem
    );
  }

  return isSameValue(applied, live) ? applied : live;
}

/**
 * Counts the fields of the applied manifest whose value differs in the live object, plus the
 * extra array items in the live object. Fields only present in the live object are not counted,
 * since they are usually defaults set by the API server.
 */
export function countDifferences(applied: unknown, live: unknown): number {
  if (isPlainObject(applied) && isPlainObject(live)) {
    const liveObj = live as Record<string, unknown>;
    return Object.entries(applied as Record<string, unknown>).reduce(
      (count, [key, value]) => count + (key in liveObj ? countDifferences(value, liveObj[key]) : 1),
      0
    );
  }

  if (Array.isArray(applied) && Array.isArray(live)) {
    const itemsCount = applied.reduce(
      (count: number, value, index) =>
        count + (index < live.length ? countDifferences(value, live[index]) : 1),
      0
    );
    return itemsCount + Math.max(0, live.length - applied.length);
  }

  return isSameValue(applied, live) ? 0 : 1;
}
