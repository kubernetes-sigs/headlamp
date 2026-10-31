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
 * Returns a copy of an applied core v1 Secret with its `stringData` merged into `data`, as the API
 * server does: each value is base64 encoded from UTF-8 and overrides the `data` entry with the same
 * key. The live Secret never has `stringData`, so it would otherwise always be reported as drifted.
 * Other objects, including custom resources of a kind named Secret, are returned as is.
 */
export function mergeSecretStringData(applied: KubeObjectInterface): KubeObjectInterface {
  const stringData = (applied as Record<string, any>).stringData;
  if (getObjectType(applied).groupKind !== '/Secret' || !isPlainObject(stringData)) {
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
 * Returns a copy of an applied autoscaling/v1 HorizontalPodAutoscaler in the autoscaling/v2 form
 * the live object is fetched in, converted the way the API server does: a
 * `targetCPUUtilizationPercentage` becomes a CPU utilization entry in `metrics`. Without this, an
 * unchanged HorizontalPodAutoscaler applied as v1 is reported as drifted. The annotations v1 uses
 * for other v2 fields (autoscaling.alpha.kubernetes.io/metrics and behavior) are not converted.
 * Other objects are returned as is.
 */
export function convertToLiveApiVersion(
  applied: KubeObjectInterface,
  live: KubeObjectInterface
): KubeObjectInterface {
  if (
    applied.apiVersion !== 'autoscaling/v1' ||
    applied.kind !== 'HorizontalPodAutoscaler' ||
    live.apiVersion !== 'autoscaling/v2'
  ) {
    return applied;
  }

  const result = { ...applied, apiVersion: 'autoscaling/v2' } as Record<string, any>;
  if (isPlainObject(result.spec)) {
    const { targetCPUUtilizationPercentage, ...spec } = result.spec;
    if (targetCPUUtilizationPercentage !== undefined && targetCPUUtilizationPercentage !== null) {
      spec.metrics = [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: { type: 'Utilization', averageUtilization: targetCPUUtilizationPercentage },
          },
        },
      ];
    }
    result.spec = spec;
  }
  return result as KubeObjectInterface;
}

/**
 * Returns a copy of the applied manifest without the object fields that are set to null and are
 * unset in the live object. In built-in types, which the API server stores as Go structs, a null
 * field (e.g. `creationTimestamp: null` from `kubectl create --dry-run`) means the field is unset,
 * so it matches a live object without it. Custom resources can declare `nullable: true` fields,
 * where the API server keeps an explicit null, so their nulls are kept and compared exactly, except
 * in `metadata`, which is the same built-in ObjectMeta for every object. Nulls whose field does
 * have a live value are kept, as that is a real difference, except for a null entry of a map of
 * strings (see STRING_MAP_FIELDS), which the API server stores as an empty string.
 */
export function omitNullFields(applied: unknown, live: unknown): unknown {
  const type = getObjectType(applied);
  if (type.builtIn || !isPlainObject(applied)) {
    return omitNullFieldsAt(applied, live, type, []);
  }
  const liveObj = (isPlainObject(live) ? live : {}) as Record<string, unknown>;
  const result = createDict();
  Object.entries(applied as Record<string, unknown>).forEach(([key, fieldValue]) => {
    result[key] =
      key === 'metadata'
        ? omitNullFieldsAt(
            fieldValue,
            hasOwn(liveObj, 'metadata') ? liveObj.metadata : undefined,
            type,
            ['metadata']
          )
        : fieldValue;
  });
  return result;
}

function omitNullFieldsAt(
  applied: unknown,
  live: unknown,
  type: ObjectType,
  path: string[]
): unknown {
  if (Array.isArray(applied)) {
    const liveArray = Array.isArray(live) ? live : [];
    return applied.map((item, index) => omitNullFieldsAt(item, liveArray[index], type, path));
  }
  if (isPlainObject(applied)) {
    const liveObj = (isPlainObject(live) ? live : {}) as Record<string, unknown>;
    const isStringMap = isStringMapField(type, path);
    const result = createDict();
    Object.entries(applied as Record<string, unknown>).forEach(([key, fieldValue]) => {
      const liveValue = hasOwn(liveObj, key) ? liveObj[key] : undefined;
      if (fieldValue !== null) {
        result[key] = omitNullFieldsAt(fieldValue, liveValue, type, [...path, key]);
      } else if (isStringMap && liveValue === '') {
        // The API server stores a null entry of a map of strings as an empty string.
        result[key] = '';
      } else if (liveValue !== null && liveValue !== undefined) {
        result[key] = fieldValue;
      }
    });
    return result;
  }
  return applied;
}

/**
 * Maps of strings (or of base64 bytes) of built-in types, by the key of their parent object (''
 * for top-level fields) and with array indexes left out of the path. The API server stores a null
 * entry of these maps as an empty string, e.g. a ConfigMap created with `data: {key: null}` (such
 * as with `kubectl create --save-config`) has `data: {key: ""}`. These are the maps of strings of
 * the stored resources served by Kubernetes v1.36 (k8s.io/api v0.36.1), plus ObjectMeta, whose
 * parent and key do not also name another kind of field. Those that do are in
 * KIND_STRING_MAP_FIELDS.
 */
const STRING_MAP_FIELDS: Record<string, string[]> = {
  '': ['binaryData', 'parameters', 'stringData'],
  clusterRoleSelectors: ['matchLabels'],
  csi: ['volumeAttributes'],
  endpoints: ['deprecatedTopology', 'topology'],
  flexVolume: ['options'],
  labelSelector: ['matchLabels'],
  metadata: ['annotations', 'labels'],
  namespaceSelector: ['matchLabels'],
  nodeTopology: ['matchLabels'],
  objectSelector: ['matchLabels'],
  podCertificate: ['userAnnotations'],
  podSelector: ['matchLabels'],
  scheduling: ['nodeSelector'],
  selector: ['matchLabels'],
  spec: ['nodeSelector', 'unverifiedUserAnnotations'],
  status: ['allocatedResourceStatuses'],
};

/** Fields whose parent and key name a map of strings only in some types, by those types. */
const KIND_STRING_MAP_FIELDS: Record<string, string[]> = {
  '.data': ['/ConfigMap', '/Secret'],
  'spec.selector': ['/Service'],
};

/**
 * Whether the field at the given path is a map of strings (see STRING_MAP_FIELDS) of a built-in
 * type, or of `metadata`, which is the same built-in ObjectMeta for every object. Custom resources
 * can declare nullable map values, so their other maps keep null entries.
 */
function isStringMapField(type: ObjectType, path: string[]): boolean {
  if (path.length === 0 || !(type.builtIn || (path.length === 2 && path[0] === 'metadata'))) {
    return false;
  }
  const key = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : '';
  const pair = `${parent}.${key}`;
  return (
    (hasOwn(STRING_MAP_FIELDS, parent) && STRING_MAP_FIELDS[parent].includes(key)) ||
    (hasOwn(KIND_STRING_MAP_FIELDS, pair) &&
      type.groupKind !== undefined &&
      KIND_STRING_MAP_FIELDS[pair].includes(type.groupKind))
  );
}

/**
 * The type of the compared object, which decides how some of its fields are compared. Custom
 * resources can use any fields, so only the known fields of built-in types get special handling.
 */
interface ObjectType {
  /** The API group and kind, e.g. "apps/Deployment", or "/ConfigMap" for the core group. */
  groupKind?: string;
  /**
   * Whether the object is of a built-in type, which the API server stores as a Go struct, so null
   * fields and empty maps and lists are left out of the API response.
   */
  builtIn: boolean;
}

/**
 * API groups of built-in types, which are Go structs where empty maps and lists are left out of
 * the API response. Not apiextensions.k8s.io and resource.k8s.io, as some of their fields hold
 * arbitrary JSON (e.g. a CRD schema `default: {}`) where an empty value is kept and meaningful.
 */
const BUILT_IN_GROUPS = new Set([
  '',
  'admissionregistration.k8s.io',
  'apiregistration.k8s.io',
  'apps',
  'autoscaling',
  'batch',
  'certificates.k8s.io',
  'coordination.k8s.io',
  'discovery.k8s.io',
  'events.k8s.io',
  'flowcontrol.apiserver.k8s.io',
  'networking.k8s.io',
  'node.k8s.io',
  'policy',
  'rbac.authorization.k8s.io',
  'scheduling.k8s.io',
  'storage.k8s.io',
]);

/** Returns the type of the given object, from its apiVersion and kind. */
function getObjectType(obj: unknown): ObjectType {
  const { apiVersion, kind } = (isPlainObject(obj) ? obj : {}) as Record<string, unknown>;
  if (typeof apiVersion !== 'string' || typeof kind !== 'string') {
    return { builtIn: false };
  }
  const group = apiVersion.includes('/') ? apiVersion.split('/')[0] : '';
  return { groupKind: `${group}/${kind}`, builtIn: BUILT_IN_GROUPS.has(group) };
}

/** Precision the API server keeps for a quantity, as a power of ten. */
const MILLI = -3;
const NANO = -9;

/**
 * A quantity field: a path of object keys, without array indexes, where '*' matches any key (e.g.
 * the resource name in `resources.limits.*`), and the precision the API server rounds it to.
 */
interface QuantityField {
  path: string[];
  scale: number;
}

const RESOURCE_LISTS = ['limits', 'requests'];

/**
 * Quantity fields that are resource lists of the core API. Converting these to the internal type
 * rounds every value up to milli precision (e.g. "0.1m" is stored as "1m").
 */
function resourceLists(paths: string[][]): QuantityField[] {
  return paths.map(path => ({ path: [...path, '*'], scale: MILLI }));
}

/** Quantity fields that are single quantities, which keep nano precision. */
function singleQuantities(paths: string[][]): QuantityField[] {
  return paths.map(path => ({ path, scale: NANO }));
}

/** Quantity fields of a PersistentVolumeClaim spec at the given path. */
function claimSpecQuantityFields(prefix: string[]): QuantityField[] {
  return resourceLists(RESOURCE_LISTS.map(list => [...prefix, 'resources', list]));
}

/** Quantity fields of a pod spec at the given path. */
function podSpecQuantityFields(prefix: string[]): QuantityField[] {
  return [
    ...resourceLists([
      ...['containers', 'initContainers', 'ephemeralContainers'].flatMap(containers =>
        RESOURCE_LISTS.map(list => [...prefix, containers, 'resources', list])
      ),
      // Pod-level resources.
      ...RESOURCE_LISTS.map(list => [...prefix, 'resources', list]),
      [...prefix, 'overhead'],
    ]),
    // A single quantity rather than a resource list, so it keeps nano precision.
    { path: [...prefix, 'volumes', 'emptyDir', 'sizeLimit'], scale: NANO },
    // Divisors of the downward API resource fields.
    ...singleQuantities([
      ...['containers', 'initContainers', 'ephemeralContainers'].map(containers => [
        ...prefix,
        containers,
        'env',
        'valueFrom',
        'resourceFieldRef',
        'divisor',
      ]),
      [...prefix, 'volumes', 'downwardAPI', 'items', 'resourceFieldRef', 'divisor'],
      [
        ...prefix,
        'volumes',
        'projected',
        'sources',
        'downwardAPI',
        'items',
        'resourceFieldRef',
        'divisor',
      ],
    ]),
    ...claimSpecQuantityFields([...prefix, 'volumes', 'ephemeral', 'volumeClaimTemplate', 'spec']),
  ];
}

const POD_TEMPLATE_SPEC = ['spec', 'template', 'spec'];

/** Quantity fields of a dynamic resource allocation device at the given path. */
function deviceQuantityFields(prefix: string[]): QuantityField[] {
  const capacity = [...prefix, 'capacity', '*'];
  const requestPolicy = [...capacity, 'requestPolicy'];
  return singleQuantities([
    [...capacity, 'value'],
    [...requestPolicy, 'default'],
    [...requestPolicy, 'validValues'],
    ...['min', 'max', 'step'].map(bound => [...requestPolicy, 'validRange', bound]),
    [...prefix, 'consumesCounters', 'counters', '*', 'value'],
    [...prefix, 'nodeAllocatableResourceMappings', '*', 'allocationMultiplier'],
  ]);
}

/** Quantity fields of a ResourceClaim spec at the given path. */
function claimQuantityFields(prefix: string[]): QuantityField[] {
  const requests = [...prefix, 'devices', 'requests'];
  return singleQuantities(
    [
      [...requests, 'exactly'],
      // resource.k8s.io/v1beta1, where the fields of an exact request are inline.
      requests,
      [...requests, 'firstAvailable'],
    ].map(request => [...request, 'capacity', 'requests', '*'])
  );
}

/** Metric sources of a HorizontalPodAutoscaler, each with a target holding quantities. */
const HPA_METRIC_SOURCES = ['resource', 'pods', 'object', 'external', 'containerResource'];

/**
 * Fields holding resource quantities, by the API group and kind of the built-in types. These are
 * the resource.Quantity fields of the API versions served by Kubernetes v1.36 (k8s.io/api v0.36.1),
 * except status fields, which are not compared.
 */
const QUANTITY_FIELDS: Record<string, QuantityField[]> = {
  '/Pod': podSpecQuantityFields(['spec']),
  '/PodTemplate': podSpecQuantityFields(['template', 'spec']),
  '/ReplicationController': podSpecQuantityFields(POD_TEMPLATE_SPEC),
  'apps/Deployment': podSpecQuantityFields(POD_TEMPLATE_SPEC),
  'apps/ReplicaSet': podSpecQuantityFields(POD_TEMPLATE_SPEC),
  'apps/DaemonSet': podSpecQuantityFields(POD_TEMPLATE_SPEC),
  'apps/StatefulSet': [
    ...podSpecQuantityFields(POD_TEMPLATE_SPEC),
    ...claimSpecQuantityFields(['spec', 'volumeClaimTemplates', 'spec']),
  ],
  'batch/Job': podSpecQuantityFields(POD_TEMPLATE_SPEC),
  'batch/CronJob': podSpecQuantityFields(['spec', 'jobTemplate', ...POD_TEMPLATE_SPEC]),
  '/PersistentVolumeClaim': claimSpecQuantityFields(['spec']),
  '/PersistentVolume': resourceLists([['spec', 'capacity']]),
  '/ResourceQuota': resourceLists([['spec', 'hard']]),
  '/LimitRange': resourceLists(
    ['max', 'min', 'default', 'defaultRequest', 'maxLimitRequestRatio'].map(limit => [
      'spec',
      'limits',
      limit,
    ])
  ),
  // Not converted like the core resource lists, so it keeps nano precision.
  'node.k8s.io/RuntimeClass': [{ path: ['overhead', 'podFixed', '*'], scale: NANO }],
  // Metric targets and scaling rule tolerances are single quantities, so they keep nano precision.
  'autoscaling/HorizontalPodAutoscaler': singleQuantities([
    ...HPA_METRIC_SOURCES.flatMap(source =>
      ['value', 'averageValue'].map(value => ['spec', 'metrics', source, 'target', value])
    ),
    ...['scaleUp', 'scaleDown'].map(rule => ['spec', 'behavior', rule, 'tolerance']),
  ]),
  'storage.k8s.io/CSIStorageCapacity': singleQuantities([['capacity'], ['maximumVolumeSize']]),
  'resource.k8s.io/ResourceSlice': [
    ...deviceQuantityFields(['spec', 'devices']),
    // resource.k8s.io/v1beta1, where the device fields are under `basic`.
    ...deviceQuantityFields(['spec', 'devices', 'basic']),
    ...singleQuantities([['spec', 'sharedCounters', 'counters', '*', 'value']]),
  ],
  'resource.k8s.io/ResourceClaim': claimQuantityFields(['spec']),
  'resource.k8s.io/ResourceClaimTemplate': claimQuantityFields(['spec', 'spec']),
};

/**
 * Whether the field at the given path (object keys only, without array indexes) of an object
 * holds a resource quantity, e.g. `spec.template.spec.containers.resources.limits.cpu` of a
 * Deployment. Only the known fields of built-in types match, so ordinary strings such as a
 * ConfigMap value "1000m", or custom resource and CRD schema fields named like resources, are
 * compared exactly.
 *
 * @param item - The object, or any object with its apiVersion and kind.
 * @param path - The keys leading to the field.
 */
export function isQuantityPath(item: unknown, path: string[]): boolean {
  return getQuantityScale(getObjectType(item), path) !== undefined;
}

/**
 * Returns the precision the API server keeps for the quantity field at the given path, or
 * undefined if it is not a quantity field.
 */
function getQuantityScale(type: ObjectType, path: string[]): number | undefined {
  const fields = type.groupKind ? QUANTITY_FIELDS[type.groupKind] : undefined;
  return fields?.find(
    field =>
      field.path.length === path.length &&
      field.path.every((key, index) => key === '*' || key === path[index])
  )?.scale;
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

/** The largest quantity the API server keeps for binary suffixes; larger ones are capped to it. */
const MAX_BINARY_QUANTITY = BigInt(2) ** BigInt(63) - BigInt(1);

const BIG_TEN = BigInt(10);

/**
 * Parses a resource quantity exactly, as `±digits * 10^exp10 * 2^exp2`.
 *
 * @returns The parsed quantity, or null if the value is not a valid quantity.
 */
function parseQuantity(
  value: string
): { negative: boolean; digits: bigint; exp10: number; exp2: number } | null {
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
  return { negative: sign === '-', digits: BigInt(integer + fraction || '0'), exp10, exp2 };
}

/**
 * Returns the value of a quantity as the API server stores it, as an integer number of units of
 * 10^scale: binary quantities above 2^63-1 are capped, and the value is rounded away from zero to
 * the given precision (e.g. "0.1m" at milli precision is 1, as it is stored as "1m").
 *
 * @returns The stored value, or null if the value is not a valid quantity.
 */
function toStoredQuantity(value: string, scale: number): bigint | null {
  const quantity = parseQuantity(value);
  if (!quantity) {
    return null;
  }
  // The magnitude is numerator / denominator.
  let numerator = quantity.digits * BigInt(2) ** BigInt(quantity.exp2);
  let denominator = BigInt(1);
  if (quantity.exp10 >= 0) {
    numerator *= BIG_TEN ** BigInt(quantity.exp10);
  } else {
    denominator = BIG_TEN ** BigInt(-quantity.exp10);
  }
  if (quantity.exp2 > 0 && numerator > MAX_BINARY_QUANTITY * denominator) {
    numerator = MAX_BINARY_QUANTITY;
    denominator = BigInt(1);
  }
  // Express the magnitude in units of 10^scale, rounding up.
  if (scale < 0) {
    numerator *= BIG_TEN ** BigInt(-scale);
  } else {
    denominator *= BIG_TEN ** BigInt(scale);
  }
  const units = (numerator + denominator - BigInt(1)) / denominator;
  return quantity.negative ? -units : units;
}

/**
 * Whether two resource quantities are stored as the same value at the given precision, e.g. "1"
 * and "1.0", "0.5" and "500m", "1000" and "1k", "0.5Gi" and "512Mi", or, at milli precision,
 * "0.1m" and "1m".
 */
function isSameQuantity(a: string, b: string, scale: number): boolean {
  const qa = toStoredQuantity(a, scale);
  const qb = toStoredQuantity(b, scale);
  return qa !== null && qa === qb;
}

/**
 * Whether an applied value and a live value at the given path are the same. Besides plain
 * equality, this accepts resource quantities the API server stored in canonical form, e.g.
 * `cpu: 1` as "1", "0.5Gi" as "512Mi" and "0.1m" as "1m", but only in quantity fields (see
 * isQuantityPath), and base64 data stored without line breaks (see isSameBase64).
 */
function isSameValue(applied: unknown, live: unknown, path: string[], type: ObjectType): boolean {
  if (isEqual(applied, live)) {
    return true;
  }
  if (isBase64Path(type, path) && typeof applied === 'string' && typeof live === 'string') {
    return isSameBase64(applied, live);
  }
  const scale = getQuantityScale(type, path);
  if (
    scale === undefined ||
    typeof live !== 'string' ||
    (typeof applied !== 'string' && typeof applied !== 'number')
  ) {
    return false;
  }
  return isSameQuantity(String(applied), live, scale);
}

/**
 * Whether the field at the given path holds base64 encoded bytes: an entry of the `data` of a core
 * Secret or of the `binaryData` of a core ConfigMap.
 */
function isBase64Path(type: ObjectType, path: string[]): boolean {
  return (
    path.length === 2 &&
    ((type.groupKind === '/Secret' && path[0] === 'data') ||
      (type.groupKind === '/ConfigMap' && path[0] === 'binaryData'))
  );
}

/**
 * Whether two base64 strings encode the same bytes. The API server accepts base64 wrapped over
 * several lines (e.g. "YWJj\nZGVm") and stores it without the line breaks, while the annotation
 * keeps it as applied.
 */
function isSameBase64(a: string, b: string): boolean {
  try {
    return atob(a) === atob(b);
  } catch {
    return false;
  }
}

/**
 * Map fields of built-in types, by the key of their parent object ('' for top-level fields) and
 * with array indexes left out of the path. The API server stores an empty map like an unset one, so
 * an applied empty map is missing (or null) in the live object. Other objects are Go structs, which
 * keep an applied empty value, e.g. `selector: {}` of a PodDisruptionBudget, which selects all
 * pods, while a missing selector selects none. These are the map fields of the stored resources
 * served by Kubernetes v1.36 (k8s.io/api v0.36.1), plus ObjectMeta, whose parent and key do not
 * also name a struct field. Those that do are in KIND_MAP_FIELDS.
 */
const MAP_FIELDS: Record<string, string[]> = {
  '': ['binaryData', 'parameters', 'stringData'],
  clusterRoleSelectors: ['matchLabels'],
  csi: ['volumeAttributes'],
  endpoints: ['deprecatedTopology', 'topology'],
  flexVolume: ['options'],
  inlineVolumeSpec: ['capacity'],
  labelSelector: ['matchLabels'],
  limits: ['default', 'defaultRequest', 'max', 'maxLimitRequestRatio', 'min'],
  metadata: ['annotations', 'labels'],
  namespaceSelector: ['matchLabels'],
  nodeTopology: ['matchLabels'],
  objectSelector: ['matchLabels'],
  overhead: ['podFixed'],
  podCertificate: ['userAnnotations'],
  podSelector: ['matchLabels'],
  resources: ['limits', 'requests'],
  scheduling: ['nodeSelector'],
  selector: ['matchLabels'],
  spec: ['capacity', 'extra', 'hard', 'nodeSelector', 'unverifiedUserAnnotations'],
  status: ['allocatedResourceStatuses', 'allocatedResources', 'capacity'],
};

/** Fields whose parent and key name a map field only in some types, by the types they are maps in. */
const KIND_MAP_FIELDS: Record<string, string[]> = {
  '.data': ['/ConfigMap', '/Secret'],
  'spec.overhead': [
    '/Pod',
    '/PodTemplate',
    '/ReplicationController',
    'apps/DaemonSet',
    'apps/Deployment',
    'apps/ReplicaSet',
    'apps/StatefulSet',
    'batch/CronJob',
    'batch/Job',
  ],
  'spec.selector': ['/Service'],
};

/** Whether the field at the given path is a map field (see MAP_FIELDS). */
function isMapField(type: ObjectType, path: string[]): boolean {
  const key = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : '';
  const pair = `${parent}.${key}`;
  return (
    (hasOwn(MAP_FIELDS, parent) && MAP_FIELDS[parent].includes(key)) ||
    (hasOwn(KIND_MAP_FIELDS, pair) &&
      type.groupKind !== undefined &&
      KIND_MAP_FIELDS[pair].includes(type.groupKind))
  );
}

/**
 * Whether an applied empty map or list at the given path is missing (or null) in the live object
 * only because the API server stores empty maps and lists of built-in types like unset ones, e.g.
 * a ConfigMap applied with `data: {}`, or of `metadata`, which is the same built-in ObjectMeta for
 * every object (e.g. `labels: {}` of a custom resource). An empty object is only a map in the
 * known map fields (see MAP_FIELDS), as other objects keep an applied empty value. A missing
 * nonempty collection, or any other field of a custom resource, is a real change.
 */
function isOmittedEmptyCollection(
  applied: unknown,
  live: unknown,
  type: ObjectType,
  path: string[]
): boolean {
  if (!(type.builtIn || path[0] === 'metadata') || (live !== undefined && live !== null)) {
    return false;
  }
  if (Array.isArray(applied)) {
    return applied.length === 0;
  }
  return (
    isPlainObject(applied) &&
    Object.keys(applied as object).length === 0 &&
    path.length > 0 &&
    isMapField(type, path)
  );
}

/**
 * Scalar fields of built-in types that the API server leaves out of the object when they hold
 * their zero value (false, 0 or ""), by the key of their parent object ('' for top-level fields)
 * and with array indexes left out of the path, e.g. `value` of the items of `env`. These are the
 * non-pointer `omitempty` fields of the stored resources served by Kubernetes v1.36 (k8s.io/api
 * v0.36.1), plus ObjectMeta. Fields whose parent and key also name a pointer field or a field
 * without `omitempty` in another type, or a key of a map with user-defined keys, are left out, as
 * a missing value can be a real change there.
 */
const OMITTED_ZERO_VALUE_FIELDS: Record<string, string[]> = {
  '': [
    'action',
    'count',
    'deprecatedCount',
    'description',
    'globalDefault',
    'message',
    'note',
    'reason',
    'reportingController',
    'type',
  ],
  addresses: ['hostname'],
  applyConfiguration: ['expression'],
  awsElasticBlockStore: ['fsType', 'partition', 'readOnly'],
  azureFile: ['readOnly'],
  backend: ['serviceName'],
  cephfs: ['path', 'readOnly', 'secretFile', 'user'],
  cinder: ['fsType', 'readOnly'],
  claimRef: ['apiVersion', 'fieldPath', 'kind', 'name', 'namespace', 'resourceVersion', 'uid'],
  claims: ['request'],
  conditions: ['error', 'message', 'reason'],
  configMap: ['resourceVersion', 'uid'],
  configMapKeyRef: ['name'],
  configMapRef: ['name'],
  containers: [
    'image',
    'imagePullPolicy',
    'stdin',
    'stdinOnce',
    'terminationMessagePath',
    'terminationMessagePolicy',
    'tty',
    'workingDir',
  ],
  controllerExpandSecretRef: ['name', 'namespace'],
  controllerPublishSecretRef: ['name', 'namespace'],
  controllerRef: ['apiGroup'],
  deprecatedSource: ['component', 'host'],
  describedObject: ['apiVersion'],
  emptyDir: ['medium'],
  env: ['value'],
  envFrom: ['prefix'],
  ephemeralContainers: [
    'image',
    'imagePullPolicy',
    'stdin',
    'stdinOnce',
    'targetContainerName',
    'terminationMessagePath',
    'terminationMessagePolicy',
    'tty',
    'workingDir',
  ],
  exitCodes: ['operator'],
  fc: ['fsType', 'readOnly'],
  fieldRef: ['apiVersion'],
  flexVolume: ['fsType', 'readOnly'],
  flocker: ['datasetName', 'datasetUUID'],
  gcePersistentDisk: ['fsType', 'partition', 'readOnly'],
  gitRepo: ['directory', 'revision'],
  glusterfs: ['readOnly'],
  httpGet: ['host', 'path', 'scheme'],
  image: ['pullPolicy', 'reference'],
  imagePullSecrets: ['name'],
  initContainers: [
    'image',
    'imagePullPolicy',
    'stdin',
    'stdinOnce',
    'terminationMessagePath',
    'terminationMessagePolicy',
    'tty',
    'workingDir',
  ],
  inlineVolumeSpec: ['persistentVolumeReclaimPolicy', 'storageClassName'],
  involvedObject: [
    'apiVersion',
    'fieldPath',
    'kind',
    'name',
    'namespace',
    'resourceVersion',
    'uid',
  ],
  iscsi: ['chapAuthDiscovery', 'chapAuthSession', 'fsType', 'iscsiInterface', 'readOnly'],
  jsonPatch: ['expression'],
  livenessProbe: [
    'failureThreshold',
    'initialDelaySeconds',
    'periodSeconds',
    'successThreshold',
    'timeoutSeconds',
  ],
  managedFields: ['apiVersion', 'fieldsType', 'manager', 'operation', 'subresource'],
  metadata: [
    'generateName',
    'generation',
    'name',
    'namespace',
    'resourceVersion',
    'selfLink',
    'uid',
  ],
  modifyVolumeStatus: ['targetVolumeAttributesClassName'],
  nfs: ['readOnly'],
  nodeExpandSecretRef: ['name', 'namespace'],
  nodePublishSecretRef: ['name', 'namespace'],
  nodeStageSecretRef: ['name', 'namespace'],
  notReadyAddresses: ['hostname'],
  paramKind: ['apiVersion', 'kind'],
  paramRef: ['name', 'namespace'],
  parentRef: ['group', 'name', 'namespace', 'resource'],
  paths: ['path'],
  persistentVolumeClaim: ['readOnly'],
  persistentVolumeClaimRetentionPolicy: ['whenDeleted', 'whenScaled'],
  photonPersistentDisk: ['fsType'],
  podCertificate: [
    'certificateChainPath',
    'credentialBundlePath',
    'keyPath',
    'keyType',
    'signerName',
  ],
  podGroupTemplates: ['priorityClassName'],
  port: ['name', 'number'],
  ports: ['hostIP', 'hostPort', 'nodePort'],
  portworxVolume: ['fsType', 'readOnly'],
  quobyte: ['group', 'readOnly', 'tenant', 'user'],
  rbd: ['fsType', 'keyring', 'pool', 'readOnly', 'user'],
  readinessProbe: [
    'failureThreshold',
    'initialDelaySeconds',
    'periodSeconds',
    'successThreshold',
    'timeoutSeconds',
  ],
  regarding: ['apiVersion', 'fieldPath', 'kind', 'name', 'namespace', 'resourceVersion', 'uid'],
  related: ['apiVersion', 'fieldPath', 'kind', 'name', 'namespace', 'resourceVersion', 'uid'],
  resourceFieldRef: ['containerName'],
  resourceRules: ['clusterScope'],
  restartPolicyRules: ['action'],
  rollbackTo: ['revision'],
  rules: ['host'],
  scaleIO: [
    'fsType',
    'protectionDomain',
    'readOnly',
    'sslEnabled',
    'storageMode',
    'storagePool',
    'volumeName',
  ],
  scaleTargetRef: ['apiVersion'],
  secret: ['name', 'secretName'],
  secretKeyRef: ['name'],
  secretRef: ['apiVersion', 'fieldPath', 'kind', 'name', 'namespace', 'resourceVersion', 'uid'],
  secrets: ['apiVersion', 'fieldPath', 'kind', 'name', 'namespace', 'resourceVersion', 'uid'],
  seLinuxOptions: ['level', 'role', 'type', 'user'],
  serviceAccountToken: ['audience'],
  source: ['component', 'host'],
  spec: [
    'clusterIP',
    'concurrencyPolicy',
    'controller',
    'dnsPolicy',
    'emulationVersion',
    'externalID',
    'externalName',
    'externalTrafficPolicy',
    'healthCheckNodePort',
    'hostIPC',
    'hostNetwork',
    'hostPID',
    'hostname',
    'loadBalancerIP',
    'minReadySeconds',
    'paused',
    'persistentVolumeReclaimPolicy',
    'podCIDR',
    'podManagementPolicy',
    'policyName',
    'priorityClassName',
    'providerID',
    'publishNotReadyAddresses',
    'reinvocationPolicy',
    'restartPolicy',
    'schedulerName',
    'serviceAccount',
    'sessionAffinity',
    'subdomain',
    'uid',
    'unschedulable',
    'username',
    'volumeName',
  ],
  startupProbe: [
    'failureThreshold',
    'initialDelaySeconds',
    'periodSeconds',
    'successThreshold',
    'timeoutSeconds',
  ],
  status: ['phase'],
  storageos: ['fsType', 'readOnly', 'volumeName', 'volumeNamespace'],
  strategy: ['type'],
  subjects: ['apiGroup', 'apiVersion', 'namespace'],
  taints: ['value'],
  targetRef: ['apiVersion', 'fieldPath', 'kind', 'name', 'namespace', 'resourceVersion', 'uid'],
  tcpSocket: ['host'],
  tls: ['secretName'],
  tolerations: ['effect', 'key', 'operator', 'value'],
  updateStrategy: ['type'],
  validations: ['message', 'messageExpression'],
  volumeClaimTemplates: ['apiVersion', 'kind'],
  volumeMounts: ['readOnly', 'subPath', 'subPathExpr'],
  vsphereVolume: ['fsType', 'storagePolicyID', 'storagePolicyName'],
};

/**
 * Whether an applied zero value (false, 0 or "") at the given path is missing in the live object
 * only because the API server leaves it out (see OMITTED_ZERO_VALUE_FIELDS), e.g. `paused: false`
 * of a Deployment or `value: ""` of an environment variable. A missing value anywhere else, such
 * as a ConfigMap entry or a custom resource field, is a real change.
 */
function isOmittedZeroValue(applied: unknown, type: ObjectType, path: string[]): boolean {
  if ((applied !== false && applied !== 0 && applied !== '') || path.length === 0) {
    return false;
  }
  if (!type.builtIn && path[0] !== 'metadata') {
    return false;
  }
  const parent = path.length > 1 ? path[path.length - 2] : '';
  return (
    hasOwn(OMITTED_ZERO_VALUE_FIELDS, parent) &&
    OMITTED_ZERO_VALUE_FIELDS[parent].includes(path[path.length - 1])
  );
}

/**
 * Whether an applied field at the given path is missing in the live object only because the API
 * server leaves it out: an empty collection (see isOmittedEmptyCollection) or a zero value (see
 * isOmittedZeroValue).
 */
function isOmittedField(applied: unknown, type: ObjectType, path: string[]): boolean {
  return (
    isOmittedEmptyCollection(applied, undefined, type, path) ||
    isOmittedZeroValue(applied, type, path)
  );
}

/**
 * Aligns the live object with the applied manifest for display: values that are the same (see
 * isSameValue), and empty collections and zero values the API server left out, are shown as applied, and fields
 * only present in the live object, which are mostly defaults set by the API server, are left out
 * unless `keepLiveOnlyFields` is set. Array items beyond the applied length (e.g. an injected
 * sidecar container) are always kept, as they are a real difference.
 */
export function projectOntoApplied(
  live: unknown,
  applied: unknown,
  keepLiveOnlyFields = false
): unknown {
  return projectOntoAppliedAt(live, applied, keepLiveOnlyFields, [], getObjectType(applied));
}

function projectOntoAppliedAt(
  live: unknown,
  applied: unknown,
  keepLiveOnlyFields: boolean,
  path: string[],
  type: ObjectType
): unknown {
  if (isOmittedEmptyCollection(applied, live, type, path)) {
    return applied;
  }

  if (isPlainObject(live) && isPlainObject(applied)) {
    const liveObj = live as Record<string, unknown>;
    const appliedObj = applied as Record<string, unknown>;
    const result = createDict();
    Object.keys(liveObj).forEach(key => {
      if (hasOwn(appliedObj, key)) {
        result[key] = projectOntoAppliedAt(
          liveObj[key],
          appliedObj[key],
          keepLiveOnlyFields,
          [...path, key],
          type
        );
      } else if (keepLiveOnlyFields) {
        result[key] = liveObj[key];
      }
    });
    Object.keys(appliedObj).forEach(key => {
      if (!hasOwn(liveObj, key) && isOmittedField(appliedObj[key], type, [...path, key])) {
        result[key] = appliedObj[key];
      }
    });
    return result;
  }

  if (Array.isArray(live) && Array.isArray(applied)) {
    return live.map((liveItem, index) =>
      index < applied.length
        ? projectOntoAppliedAt(liveItem, applied[index], keepLiveOnlyFields, path, type)
        : liveItem
    );
  }

  return isSameValue(applied, live, path, type) ? applied : live;
}

/**
 * Counts the fields of the applied manifest whose value differs in the live object, plus the
 * extra array items in the live object. Fields only present in the live object are not counted,
 * since they are usually defaults set by the API server, and neither are empty collections and
 * zero values the API server left out (see isOmittedField).
 */
export function countDifferences(applied: unknown, live: unknown): number {
  return countDifferencesAt(applied, live, [], getObjectType(applied));
}

function countDifferencesAt(
  applied: unknown,
  live: unknown,
  path: string[],
  type: ObjectType
): number {
  if (isOmittedEmptyCollection(applied, live, type, path)) {
    return 0;
  }

  if (isPlainObject(applied) && isPlainObject(live)) {
    const liveObj = live as Record<string, unknown>;
    return Object.entries(applied as Record<string, unknown>).reduce((count, [key, value]) => {
      if (hasOwn(liveObj, key)) {
        return count + countDifferencesAt(value, liveObj[key], [...path, key], type);
      }
      return count + (isOmittedField(value, type, [...path, key]) ? 0 : 1);
    }, 0);
  }

  if (Array.isArray(applied) && Array.isArray(live)) {
    const itemsCount = applied.reduce(
      (count: number, value, index) =>
        count + (index < live.length ? countDifferencesAt(value, live[index], path, type) : 1),
      0
    );
    return itemsCount + Math.max(0, live.length - applied.length);
  }

  return isSameValue(applied, live, path, type) ? 0 : 1;
}
