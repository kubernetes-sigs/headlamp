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

/** Whether the object has the given own key. Unlike `key in obj`, this ignores inherited keys. */
function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Creates an empty dictionary for arbitrary JSON keys. Without a prototype, a key such as
 * `__proto__` (a valid ConfigMap key) is stored as an own property instead of being dropped.
 */
function createDict(): Record<string, unknown> {
  return Object.create(null);
}

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

/** Base64 encodes the UTF-8 bytes of the given text, as the API server stores Secret data. */
function encodeBase64(text: string): string {
  let binary = '';
  new TextEncoder().encode(text).forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * Returns a copy of an applied Secret with its `stringData` merged into `data`, as the API server
 * does: each value is base64 encoded from UTF-8 and overrides the `data` entry with the same key.
 * The live Secret never has `stringData`, so it would otherwise always be reported as drifted.
 * Other objects are returned as is.
 */
export function mergeSecretStringData(applied: KubeObjectInterface): KubeObjectInterface {
  const stringData = (applied as Record<string, any>).stringData;
  if (applied.kind !== 'Secret' || !isPlainObject(stringData)) {
    return applied;
  }

  const data = createDict();
  const appliedData = (applied as Record<string, any>).data;
  if (isPlainObject(appliedData)) {
    Object.entries(appliedData).forEach(([key, value]) => {
      data[key] = value;
    });
  }
  Object.entries(stringData as Record<string, unknown>).forEach(([key, value]) => {
    data[key] = typeof value === 'string' ? encodeBase64(value) : value;
  });

  const result = { ...applied, data } as Record<string, any>;
  delete result.stringData;
  return result as KubeObjectInterface;
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
    const result = createDict();
    Object.entries(applied as Record<string, unknown>).forEach(([key, fieldValue]) => {
      const liveValue = hasOwn(liveObj, key) ? liveObj[key] : undefined;
      if (fieldValue !== null) {
        result[key] = omitNullFields(fieldValue, liveValue);
      } else if (liveValue !== null && liveValue !== undefined) {
        result[key] = fieldValue;
      }
    });
    return result;
  }
  return applied;
}

/** Keys of the maps of resource quantities, by the key of their parent object. */
const QUANTITY_MAPS: Record<string, string[]> = {
  // Container, pod and PersistentVolumeClaim resources.
  resources: ['limits', 'requests'],
  // ResourceQuota and PersistentVolume.
  spec: ['hard', 'capacity'],
  // LimitRange items.
  limits: ['max', 'min', 'default', 'defaultRequest', 'maxLimitRequestRatio'],
  // RuntimeClass.
  overhead: ['podFixed'],
};

/**
 * Whether the field at the given path (object keys only, without array indexes) holds a resource
 * quantity in the built-in Kubernetes types, e.g. `...containers.resources.limits.cpu`. Only these
 * fields are compared as quantities, so ordinary strings such as a ConfigMap value "1000m" or an
 * environment variable "1Gi" are compared exactly.
 */
export function isQuantityPath(path: string[]): boolean {
  const [grandparent, parent, key] = path.slice(-3);
  if (key === undefined) {
    return false;
  }
  return (
    (parent === 'emptyDir' && key === 'sizeLimit') ||
    // Pod overhead.
    (grandparent === 'spec' && parent === 'overhead') ||
    (hasOwn(QUANTITY_MAPS, grandparent) && QUANTITY_MAPS[grandparent].includes(parent))
  );
}

const QUANTITY_REGEX =
  /^([+-]?)(\d+)?(?:\.(\d*))?(?:[eE]([+-]?\d+)|(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E))?$/;
const DECIMAL_SUFFIXES: Record<string, number> = {
  n: -9,
  u: -6,
  m: -3,
  k: 3,
  M: 6,
  G: 9,
  T: 12,
  P: 15,
  E: 18,
};
const BINARY_SUFFIXES: Record<string, number> = { Ki: 10, Mi: 20, Gi: 30, Ti: 40, Pi: 50, Ei: 60 };

/**
 * Parses a resource quantity exactly, as `digits * 10^exp10 * 2^exp2`.
 *
 * @returns The parsed quantity, or null if the value is not a valid quantity.
 */
function parseQuantity(value: string): { digits: bigint; exp10: number; exp2: number } | null {
  const match = QUANTITY_REGEX.exec(value);
  if (!match) {
    return null;
  }
  const [, sign, integer = '', fraction = '', exponent, suffix] = match;
  if (integer === '' && fraction === '') {
    return null;
  }
  let exp10 = -fraction.length + (exponent ? Number(exponent) : 0);
  let exp2 = 0;
  if (suffix) {
    exp10 += DECIMAL_SUFFIXES[suffix] ?? 0;
    exp2 += BINARY_SUFFIXES[suffix] ?? 0;
  }
  // Real quantities are far smaller; this keeps the exact comparison cheap.
  if (Math.abs(exp10) > 100) {
    return null;
  }
  const digits = BigInt(integer + fraction || '0');
  return { digits: sign === '-' ? -digits : digits, exp10, exp2 };
}

/**
 * Whether two resource quantities have the same value, e.g. "1" and "1.0", "0.5" and "500m",
 * "1000" and "1k", or "0.5Gi" and "512Mi".
 */
function isSameQuantity(a: string, b: string): boolean {
  const qa = parseQuantity(a);
  const qb = parseQuantity(b);
  if (!qa || !qb) {
    return false;
  }
  const exp10 = Math.min(qa.exp10, qb.exp10);
  const exp2 = Math.min(qa.exp2, qb.exp2);
  const scale = (q: NonNullable<typeof qa>) =>
    q.digits * BigInt(10) ** BigInt(q.exp10 - exp10) * BigInt(2) ** BigInt(q.exp2 - exp2);
  return scale(qa) === scale(qb);
}

/**
 * Whether an applied value and a live value at the given path are the same. Besides plain
 * equality, this accepts resource quantities the API server stored in canonical form, e.g.
 * `cpu: 1` as "1" and "0.5Gi" as "512Mi", but only in quantity fields (see isQuantityPath).
 */
function isSameValue(applied: unknown, live: unknown, path: string[]): boolean {
  if (isEqual(applied, live)) {
    return true;
  }
  if (
    !isQuantityPath(path) ||
    typeof live !== 'string' ||
    (typeof applied !== 'string' && typeof applied !== 'number')
  ) {
    return false;
  }
  return isSameQuantity(String(applied), live);
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
  keepLiveOnlyFields = false,
  path: string[] = []
): unknown {
  if (isPlainObject(live) && isPlainObject(applied)) {
    const liveObj = live as Record<string, unknown>;
    const appliedObj = applied as Record<string, unknown>;
    const result = createDict();
    Object.keys(liveObj).forEach(key => {
      if (hasOwn(appliedObj, key)) {
        result[key] = projectOntoApplied(liveObj[key], appliedObj[key], keepLiveOnlyFields, [
          ...path,
          key,
        ]);
      } else if (keepLiveOnlyFields) {
        result[key] = liveObj[key];
      }
    });
    return result;
  }

  if (Array.isArray(live) && Array.isArray(applied)) {
    return live.map((liveItem, index) =>
      index < applied.length
        ? projectOntoApplied(liveItem, applied[index], keepLiveOnlyFields, path)
        : liveItem
    );
  }

  return isSameValue(applied, live, path) ? applied : live;
}

/**
 * Counts the fields of the applied manifest whose value differs in the live object, plus the
 * extra array items in the live object. Fields only present in the live object are not counted,
 * since they are usually defaults set by the API server.
 */
export function countDifferences(applied: unknown, live: unknown, path: string[] = []): number {
  if (isPlainObject(applied) && isPlainObject(live)) {
    const liveObj = live as Record<string, unknown>;
    return Object.entries(applied as Record<string, unknown>).reduce(
      (count, [key, value]) =>
        count + (hasOwn(liveObj, key) ? countDifferences(value, liveObj[key], [...path, key]) : 1),
      0
    );
  }

  if (Array.isArray(applied) && Array.isArray(live)) {
    const itemsCount = applied.reduce(
      (count: number, value, index) =>
        count + (index < live.length ? countDifferences(value, live[index], path) : 1),
      0
    );
    return itemsCount + Math.max(0, live.length - applied.length);
  }

  return isSameValue(applied, live, path) ? 0 : 1;
}
