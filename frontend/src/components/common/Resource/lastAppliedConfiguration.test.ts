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

import { describe, expect, it } from 'vitest';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import {
  convertToLiveApiVersion,
  countAllDifferences,
  countDifferences,
  isQuantityPath,
  LAST_APPLIED_ANNOTATION,
  mergeSecretStringData,
  omitNullFields,
  parseLastAppliedConfiguration,
  projectOntoApplied,
  stripServerFields,
} from './lastAppliedConfiguration';

const applied = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { annotations: {}, name: 'nginx', namespace: 'default' },
  spec: {
    replicas: 2,
    template: {
      spec: {
        containers: [{ name: 'nginx', image: 'nginx:1.25' }],
      },
    },
  },
};

function makeLive(overrides: Record<string, any> = {}): KubeObjectInterface {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'nginx',
      namespace: 'default',
      uid: 'abc',
      resourceVersion: '123',
      creationTimestamp: '2025-01-01T00:00:00Z',
      generation: 3,
      managedFields: [
        {
          manager: 'kubectl-client-side-apply',
          operation: 'Update',
          apiVersion: 'apps/v1',
          fieldsType: 'FieldsV1',
          fieldsV1: {},
          subresource: '',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
      annotations: {
        [LAST_APPLIED_ANNOTATION]: JSON.stringify(applied),
        'deployment.kubernetes.io/revision': '1',
      },
    },
    spec: {
      replicas: 2,
      progressDeadlineSeconds: 600,
      template: {
        spec: {
          containers: [{ name: 'nginx', image: 'nginx:1.25', imagePullPolicy: 'IfNotPresent' }],
          dnsPolicy: 'ClusterFirst',
        },
      },
      ...overrides.spec,
    },
    status: { replicas: 2 },
  } as KubeObjectInterface;
}

/** A Pod with one container, with the given container resources. */
function pod(resources: unknown, metadata: Record<string, unknown> = {}) {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata,
    spec: { containers: [{ name: 'app', resources }] },
  };
}

function diffCount(live: KubeObjectInterface) {
  return countDifferences(
    stripServerFields(parseLastAppliedConfiguration(live)!),
    stripServerFields(live)
  );
}

describe('parseLastAppliedConfiguration', () => {
  it('returns the parsed manifest', () => {
    expect(parseLastAppliedConfiguration(makeLive())).toEqual(applied);
  });

  it('returns null when the annotation is missing', () => {
    expect(parseLastAppliedConfiguration({ metadata: {} } as KubeObjectInterface)).toBeNull();
    expect(parseLastAppliedConfiguration(null)).toBeNull();
  });

  it('returns null when the annotation is not a JSON object', () => {
    for (const value of ['{not json', '"a string"', '[1, 2]', 'null']) {
      const item = { metadata: { annotations: { [LAST_APPLIED_ANNOTATION]: value } } };
      expect(parseLastAppliedConfiguration(item as any)).toBeNull();
    }
  });
});

describe('stripServerFields', () => {
  it('removes server-populated fields and the annotation itself', () => {
    const live = makeLive();
    const stripped = stripServerFields(live);

    expect(stripped).not.toHaveProperty('status');
    expect(stripped.metadata).toEqual({
      name: 'nginx',
      namespace: 'default',
      annotations: { 'deployment.kubernetes.io/revision': '1' },
    });
    // The original object is not modified.
    expect(live.metadata.uid).toBe('abc');
    expect(live.metadata.annotations).toHaveProperty(LAST_APPLIED_ANNOTATION);
  });

  it('removes annotations when they end up empty', () => {
    const stripped = stripServerFields(applied as KubeObjectInterface);
    expect(stripped.metadata).not.toHaveProperty('annotations');
  });
});

describe('countDifferences', () => {
  it('ignores server defaults and server-populated fields', () => {
    expect(diffCount(makeLive())).toBe(0);
  });

  it('counts changed values', () => {
    const live = makeLive({
      spec: {
        replicas: 5,
        template: {
          spec: { containers: [{ name: 'nginx', image: 'nginx:1.26' }] },
        },
      },
    });
    expect(diffCount(live)).toBe(2);
  });

  it('counts extra array items, such as an injected sidecar', () => {
    const live = makeLive({
      spec: {
        replicas: 2,
        template: {
          spec: {
            containers: [
              { name: 'nginx', image: 'nginx:1.25' },
              { name: 'istio-proxy', image: 'istio/proxyv2' },
            ],
          },
        },
      },
    });
    expect(diffCount(live)).toBe(1);
  });

  it('accepts quantities and null fields as stored by the API server', () => {
    // Taken from a real cluster: the manifest had `cpu: 1`, `memory: 0.5Gi` and
    // `creationTimestamp: null`, which the API server stored as "1", "512Mi" and no field.
    const appliedResources = pod(
      { limits: { cpu: 2, memory: '0.5Gi' }, requests: { cpu: 1, memory: '64Mi' } },
      { creationTimestamp: null, labels: { app: 'edge-cases' } }
    );
    const liveResources = pod(
      { limits: { cpu: '2', memory: '512Mi' }, requests: { cpu: '1', memory: '64Mi' } },
      { labels: { app: 'edge-cases' } }
    );
    expect(countDifferences(omitNullFields(appliedResources, liveResources), liveResources)).toBe(
      0
    );
  });

  it('accepts canonical forms of quantities in quantity fields', () => {
    const limits = (value: unknown) => pod({ limits: { cpu: value } });
    for (const [appliedValue, liveValue] of [
      ['0.5', '500m'],
      ['1.0', '1'],
      [1.5, '1500m'],
      ['1000', '1k'],
      ['1e3', '1k'],
      ['1Gi', '1024Mi'],
      ['.5', '500m'],
    ]) {
      expect(countDifferences(limits(appliedValue), limits(liveValue))).toBe(0);
    }
  });

  it('still counts real quantity and version changes', () => {
    const limits = (value: unknown) => pod({ limits: { cpu: value } });
    expect(countDifferences(limits(1), limits('2'))).toBe(1);
    expect(countDifferences(limits('512Mi'), limits('1Gi'))).toBe(1);
    expect(countDifferences(limits('1000'), limits('1Ki'))).toBe(1);
    expect(countDifferences(limits('1'), limits('abc'))).toBe(1);
    expect(countDifferences({ version: '1.10' }, { version: '1.1' })).toBe(1);
    expect(countDifferences({ image: 'nginx:1.27' }, { image: 'nginx:1.28' })).toBe(1);
  });

  it('accepts quantities the API server rounded up to milli precision', () => {
    // Taken from a real cluster with a server-side dry run, e.g. "0.1m" is stored as "1m".
    const limits = (value: unknown) => pod({ limits: { cpu: value } });
    for (const [appliedValue, liveValue] of [
      ['0.1m', '1m'],
      ['1.5n', '1m'],
      ['1500u', '2m'],
      ['1.0001m', '2m'],
      ['2.5m', '3m'],
      // Rounded away from zero.
      ['-0.1m', '-1m'],
      ['-2.5m', '-3m'],
    ]) {
      expect(countDifferences(limits(appliedValue), limits(liveValue))).toBe(0);
    }
    expect(countDifferences(limits('0.1m'), limits('2m'))).toBe(1);
    expect(countDifferences(limits('-2.5m'), limits('-2m'))).toBe(1);

    const limitRange = (ratio: string) => ({
      apiVersion: 'v1',
      kind: 'LimitRange',
      spec: { limits: [{ type: 'Container', maxLimitRequestRatio: { cpu: ratio } }] },
    });
    expect(countDifferences(limitRange('1.0001'), limitRange('1001m'))).toBe(0);
  });

  it('accepts quantities rounded up to nano precision in other quantity fields', () => {
    // emptyDir sizeLimit and RuntimeClass overhead are not rounded to milli precision.
    const runtimeClass = (cpu: string) => ({
      apiVersion: 'node.k8s.io/v1',
      kind: 'RuntimeClass',
      overhead: { podFixed: { cpu } },
    });
    expect(countDifferences(runtimeClass('0.1m'), runtimeClass('100u'))).toBe(0);
    expect(countDifferences(runtimeClass('0.1n'), runtimeClass('1n'))).toBe(0);
    expect(countDifferences(runtimeClass('-1.5n'), runtimeClass('-2n'))).toBe(0);
    expect(countDifferences(runtimeClass('0.1m'), runtimeClass('1m'))).toBe(1);

    const sizeLimit = (value: string) => ({
      apiVersion: 'v1',
      kind: 'Pod',
      spec: { volumes: [{ name: 'cache', emptyDir: { sizeLimit: value } }] },
    });
    expect(countDifferences(sizeLimit('1500u'), sizeLimit('1500u'))).toBe(0);
    expect(countDifferences(sizeLimit('1500u'), sizeLimit('2m'))).toBe(1);
  });

  it('accepts HorizontalPodAutoscaler metric targets as stored by the API server', () => {
    // Taken from a real cluster with a server-side dry run: metric targets keep nano precision.
    const hpa = (target: Record<string, unknown>) => ({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      spec: { metrics: [{ type: 'Pods', pods: { metric: { name: 'qps' }, target } }] },
    });
    for (const [appliedValue, liveValue] of [
      ['1000m', '1'],
      [0.5, '500m'],
      ['1e3', '1k'],
      ['0.5Gi', '512Mi'],
      ['0.1m', '100u'],
      ['0.1n', '1n'],
    ]) {
      expect(
        countDifferences(hpa({ averageValue: appliedValue }), hpa({ averageValue: liveValue }))
      ).toBe(0);
      expect(countDifferences(hpa({ value: appliedValue }), hpa({ value: liveValue }))).toBe(0);
    }
    expect(countDifferences(hpa({ averageValue: '0.1m' }), hpa({ averageValue: '1m' }))).toBe(1);
    expect(countDifferences(hpa({ averageValue: '500m' }), hpa({ averageValue: '1' }))).toBe(1);
  });

  it('accepts the other quantity fields of built-in types as stored by the API server', () => {
    // Single quantities, which keep nano precision, e.g. "0.5Gi" is stored as "512Mi".
    const csiStorageCapacity = (capacity: string) => ({
      apiVersion: 'storage.k8s.io/v1',
      kind: 'CSIStorageCapacity',
      storageClassName: 'standard',
      capacity,
      maximumVolumeSize: capacity,
    });
    const divisor = (value: string) => ({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      spec: {
        template: {
          spec: {
            containers: [
              {
                name: 'app',
                env: [
                  {
                    name: 'MEM',
                    valueFrom: { resourceFieldRef: { resource: 'limits.memory', divisor: value } },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    const downwardAPIVolume = (value: string) => ({
      apiVersion: 'v1',
      kind: 'Pod',
      spec: {
        volumes: [
          {
            name: 'info',
            downwardAPI: { items: [{ path: 'mem', resourceFieldRef: { divisor: value } }] },
            projected: {
              sources: [
                { downwardAPI: { items: [{ path: 'mem', resourceFieldRef: { divisor: value } }] } },
              ],
            },
          },
        ],
      },
    });
    const tolerance = (value: string) => ({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      spec: { behavior: { scaleUp: { tolerance: value }, scaleDown: { tolerance: value } } },
    });
    const resourceSlice = (value: string) => ({
      apiVersion: 'resource.k8s.io/v1',
      kind: 'ResourceSlice',
      spec: {
        devices: [
          {
            name: 'gpu-0',
            capacity: {
              memory: {
                value,
                requestPolicy: {
                  default: value,
                  validValues: [value],
                  validRange: { min: value, max: value, step: value },
                },
              },
            },
            consumesCounters: [{ counterSet: 'gpu', counters: { memory: { value } } }],
            nodeAllocatableResourceMappings: { memory: { allocationMultiplier: value } },
          },
        ],
        sharedCounters: [{ name: 'gpu', counters: { memory: { value } } }],
      },
    });
    // resource.k8s.io/v1beta1, where the device fields are under `basic`.
    const resourceSliceV1beta1 = (value: string) => ({
      apiVersion: 'resource.k8s.io/v1beta1',
      kind: 'ResourceSlice',
      spec: { devices: [{ name: 'gpu-0', basic: { capacity: { memory: { value } } } }] },
    });
    const claimRequests = (value: string) => [
      { name: 'exact', exactly: { capacity: { requests: { memory: value } } } },
      {
        name: 'any',
        firstAvailable: [{ name: 'small', capacity: { requests: { memory: value } } }],
      },
      // resource.k8s.io/v1beta1, where the fields of an exact request are inline.
      { name: 'inline', capacity: { requests: { memory: value } } },
    ];
    const resourceClaim = (value: string) => ({
      apiVersion: 'resource.k8s.io/v1',
      kind: 'ResourceClaim',
      spec: { devices: { requests: claimRequests(value) } },
    });
    const resourceClaimTemplate = (value: string) => ({
      apiVersion: 'resource.k8s.io/v1',
      kind: 'ResourceClaimTemplate',
      spec: { spec: { devices: { requests: claimRequests(value) } } },
    });

    for (const make of [
      csiStorageCapacity,
      divisor,
      downwardAPIVolume,
      tolerance,
      resourceSlice,
      resourceSliceV1beta1,
      resourceClaim,
      resourceClaimTemplate,
    ]) {
      expect(countDifferences(make('0.5Gi'), make('512Mi'))).toBe(0);
      expect(countDifferences(make('1000'), make('1k'))).toBe(0);
      expect(countDifferences(make('0.1m'), make('100u'))).toBe(0);
      expect(countDifferences(make('0.1n'), make('1n'))).toBe(0);
      expect(countDifferences(make('0.5Gi'), make('1Gi'))).toBeGreaterThan(0);
      expect(countDifferences(make('0.1m'), make('1m'))).toBeGreaterThan(0);
    }
    // Each quantity field is counted on its own.
    expect(countDifferences(csiStorageCapacity('0.5Gi'), csiStorageCapacity('1Gi'))).toBe(2);
    expect(countDifferences(resourceSlice('0.5Gi'), resourceSlice('1Gi'))).toBe(9);
  });

  it('accepts binary quantities capped at the largest stored value', () => {
    const limits = (value: unknown) => pod({ limits: { memory: value } });
    expect(countDifferences(limits('8Ei'), limits('9223372036854775807'))).toBe(0);
    expect(countDifferences(limits('-8Ei'), limits('-9223372036854775807'))).toBe(0);
    // Decimal quantities are not capped.
    expect(countDifferences(limits('9223372036854775808'), limits('9223372036854775807'))).toBe(1);
  });

  it('compares values outside quantity fields exactly', () => {
    // A ConfigMap value and an environment variable that look like quantities.
    const configMap = (value: string) => ({ kind: 'ConfigMap', data: { cpu: value } });
    expect(countDifferences(configMap('1000m'), configMap('1'))).toBe(1);
    const env = (value: string) => ({
      spec: { containers: [{ env: [{ name: 'MEMORY', value }] }] },
    });
    expect(countDifferences(env('1Gi'), env('1024Mi'))).toBe(1);
    expect(countDifferences({ cpu: 1 }, { cpu: '1' })).toBe(1);
  });

  it('compares quantity-like fields of CRDs and custom resources exactly', () => {
    // A CRD schema default shaped like container resources.
    const crd = (cpu: string) => ({
      apiVersion: 'apiextensions.k8s.io/v1',
      kind: 'CustomResourceDefinition',
      spec: {
        versions: [
          {
            schema: {
              openAPIV3Schema: {
                properties: { config: { default: { resources: { limits: { cpu } } } } },
              },
            },
          },
        ],
      },
    });
    expect(countDifferences(crd('1000m'), crd('1'))).toBe(1);

    // Custom resources can use any fields, even with the paths of built-in quantity fields.
    const custom = (spec: unknown) => ({ apiVersion: 'example.com/v1', kind: 'Pod', spec });
    expect(
      countDifferences(
        custom({ containers: [{ resources: { limits: { cpu: '1000m' } } }] }),
        custom({ containers: [{ resources: { limits: { cpu: '1' } } }] })
      )
    ).toBe(1);
    expect(
      countDifferences(
        custom({ capacity: { profile: '1Gi' } }),
        custom({ capacity: { profile: '1024Mi' } })
      )
    ).toBe(1);
  });

  it('ignores empty collections the API server left out of built-in types', () => {
    const configMap = (fields: Record<string, unknown>) => ({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'app' },
      ...fields,
    });
    expect(countDifferences(configMap({ data: {} }), configMap({}))).toBe(0);

    // A list can also come back as null, e.g. the rules of a Role.
    const role = (rules: unknown) => ({
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      rules,
    });
    expect(countDifferences(role([]), role(null))).toBe(0);
  });

  it('ignores empty metadata collections the API server left out of custom resources', () => {
    // metadata is the built-in ObjectMeta for every object, so its empty collections are left out.
    const widget = (metadata: Record<string, unknown>) => ({
      apiVersion: 'example.com/v1',
      kind: 'Widget',
      metadata: { name: 'w', ...metadata },
      spec: { size: 1 },
    });
    expect(countDifferences(widget({ labels: {}, finalizers: [] }), widget({}))).toBe(0);
    expect(countDifferences(widget({ labels: { app: 'w' } }), widget({}))).toBe(1);
  });

  it('ignores zero values the API server left out of built-in types', () => {
    // Taken from a real cluster: these zero values are not in the stored objects.
    const priorityClass = {
      apiVersion: 'scheduling.k8s.io/v1',
      kind: 'PriorityClass',
      value: 1000,
      globalDefault: false,
      description: '',
    };
    const { globalDefault, description, ...livePriorityClass } = priorityClass;
    expect(globalDefault).toBe(false);
    expect(description).toBe('');
    expect(countDifferences(priorityClass, livePriorityClass)).toBe(0);

    const deployment = (spec: Record<string, unknown>, env: Record<string, unknown>) => ({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      spec: {
        ...spec,
        template: { spec: { containers: [{ name: 'app', env: [{ name: 'EMPTY', ...env }] }] } },
      },
    });
    expect(countDifferences(deployment({ paused: false }, { value: '' }), deployment({}, {}))).toBe(
      0
    );
    expect(countDifferences(deployment({ minReadySeconds: 0 }, {}), deployment({}, {}))).toBe(0);
  });

  it('still counts changed and missing zero values where they are kept', () => {
    const deployment = (spec: Record<string, unknown>) => ({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      spec,
    });
    // Real changes of these fields.
    expect(countDifferences(deployment({ paused: false }), deployment({ paused: true }))).toBe(1);
    expect(countDifferences(deployment({ paused: true }), deployment({}))).toBe(1);
    // Map entries keep empty values, so a missing one was removed.
    const configMap = (data: Record<string, string>) => ({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      data,
    });
    expect(countDifferences(configMap({ a: 'x', paused: '' }), configMap({ a: 'x' }))).toBe(1);
    // Custom resources keep zero values.
    const custom = (spec: Record<string, unknown>) => ({
      apiVersion: 'example.com/v1',
      kind: 'Deployment',
      spec,
    });
    expect(countDifferences(custom({ paused: false }), custom({}))).toBe(1);
    // A field named like an omitted one, but which is a pointer elsewhere, is compared exactly.
    const service = (port: Record<string, unknown>) => ({
      apiVersion: 'v1',
      kind: 'Service',
      spec: { ports: [{ port: 80, ...port }] },
    });
    expect(countDifferences(service({ name: '' }), service({}))).toBe(1);
  });

  it('counts an empty struct the API server keeps, such as an empty PDB selector', () => {
    // An empty selector selects all pods, while a missing or null one selects none.
    const pdb = (spec: Record<string, unknown>) => ({
      apiVersion: 'policy/v1',
      kind: 'PodDisruptionBudget',
      spec: { minAvailable: 1, ...spec },
    });
    expect(countDifferences(pdb({ selector: {} }), pdb({}))).toBe(1);
    expect(countDifferences(pdb({ selector: {} }), pdb({ selector: null }))).toBe(1);
    expect(countDifferences(pdb({ selector: {} }), pdb({ selector: {} }))).toBe(0);
  });

  it('still ignores empty maps the API server left out', () => {
    // Taken from a real cluster: these empty maps are not in the stored objects.
    const service = (spec: Record<string, unknown>) => ({
      apiVersion: 'v1',
      kind: 'Service',
      spec: { ports: [{ port: 80 }], ...spec },
    });
    expect(countDifferences(service({ selector: {} }), service({}))).toBe(0);
    const pod = (spec: Record<string, unknown>) => ({
      apiVersion: 'v1',
      kind: 'Pod',
      spec: { containers: [{ name: 'app', resources: { limits: {} } }], ...spec },
    });
    expect(countDifferences(pod({ nodeSelector: {} }), pod({}))).toBe(0);
    expect(
      countDifferences(pod({}), {
        apiVersion: 'v1',
        kind: 'Pod',
        spec: { containers: [{ name: 'app', resources: {} }] },
      })
    ).toBe(0);
  });

  it('still counts missing nonempty collections, and empty ones of custom resources', () => {
    const configMap = (fields: Record<string, unknown>) => ({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      ...fields,
    });
    expect(countDifferences(configMap({ data: { key: 'value' } }), configMap({}))).toBe(1);

    const custom = (spec: unknown) => ({ apiVersion: 'example.com/v1', kind: 'Widget', spec });
    expect(countDifferences(custom({ options: {} }), custom({}))).toBe(1);
  });

  it('counts fields that were removed from the live object', () => {
    const live = makeLive({ spec: { template: applied.spec.template } });
    delete live.spec.replicas;
    expect(diffCount(live)).toBe(1);
  });
});

describe('projectOntoApplied', () => {
  it('keeps only the applied fields, plus extra array items', () => {
    const live = {
      spec: {
        replicas: 3,
        progressDeadlineSeconds: 600,
        containers: [
          { name: 'nginx', imagePullPolicy: 'IfNotPresent' },
          { name: 'sidecar', imagePullPolicy: 'Always' },
        ],
      },
    };
    const appliedSpec = { spec: { replicas: 2, containers: [{ name: 'nginx' }] } };

    expect(projectOntoApplied(live, appliedSpec)).toEqual({
      spec: {
        replicas: 3,
        containers: [{ name: 'nginx' }, { name: 'sidecar', imagePullPolicy: 'Always' }],
      },
    });
  });

  it('shows equal quantities as applied, and live-only fields when asked', () => {
    const appliedClaim = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      spec: { resources: { requests: { storage: 1 } } },
    };
    const live = {
      ...appliedClaim,
      spec: { resources: { requests: { storage: '1' } }, volumeMode: 'Filesystem' },
    };
    expect(projectOntoApplied(live, appliedClaim)).toEqual(appliedClaim);
    expect(projectOntoApplied(live, appliedClaim, true)).toEqual({
      ...appliedClaim,
      spec: { ...appliedClaim.spec, volumeMode: 'Filesystem' },
    });
  });

  it('shows canonical forms of quantities as applied', () => {
    const appliedLimits = pod({ limits: { cpu: '1.0', memory: '1000' } });
    const liveLimits = pod({ limits: { cpu: '1', memory: '1k' } });
    expect(projectOntoApplied(liveLimits, appliedLimits)).toEqual(appliedLimits);
  });

  it('shows the other quantity fields of built-in types as applied', () => {
    const csiStorageCapacity = (capacity: string) => ({
      apiVersion: 'storage.k8s.io/v1',
      kind: 'CSIStorageCapacity',
      capacity,
    });
    expect(projectOntoApplied(csiStorageCapacity('512Mi'), csiStorageCapacity('0.5Gi'))).toEqual(
      csiStorageCapacity('0.5Gi')
    );
    expect(projectOntoApplied(csiStorageCapacity('1Gi'), csiStorageCapacity('0.5Gi'))).toEqual(
      csiStorageCapacity('1Gi')
    );
  });

  it('shows quantities the API server rounded up as applied', () => {
    const appliedLimits = pod({ limits: { cpu: '0.1m' }, requests: { cpu: '-2.5m' } });
    const liveLimits = pod({ limits: { cpu: '1m' }, requests: { cpu: '-3m' } });
    expect(projectOntoApplied(liveLimits, appliedLimits)).toEqual(appliedLimits);
  });

  it('shows quantity-like fields of custom resources as live', () => {
    const custom = (profile: string) => ({
      apiVersion: 'example.com/v1',
      kind: 'Widget',
      spec: { capacity: { profile } },
    });
    expect(projectOntoApplied(custom('1024Mi'), custom('1Gi'), true)).toEqual(custom('1024Mi'));
  });

  it('shows empty metadata collections of custom resources the API server left out as applied', () => {
    const appliedWidget = {
      apiVersion: 'example.com/v1',
      kind: 'Widget',
      metadata: { name: 'w', labels: {} },
    };
    const liveWidget = { apiVersion: 'example.com/v1', kind: 'Widget', metadata: { name: 'w' } };
    expect(projectOntoApplied(liveWidget, appliedWidget)).toEqual(appliedWidget);
  });

  it('shows zero values the API server left out as applied', () => {
    const applied = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      spec: {
        paused: false,
        template: { spec: { containers: [{ name: 'app', env: [{ name: 'EMPTY', value: '' }] }] } },
      },
    };
    const live = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      spec: { template: { spec: { containers: [{ name: 'app', env: [{ name: 'EMPTY' }] }] } } },
    };
    expect(projectOntoApplied(live, applied)).toEqual(applied);

    const configMap = (data: Record<string, string>) => ({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      data,
    });
    expect(projectOntoApplied(configMap({}), configMap({ removed: '' }))).toEqual(configMap({}));
  });

  it('shows a missing or null PDB selector as live, also with all live fields', () => {
    const pdb = (spec: Record<string, unknown>) => ({
      apiVersion: 'policy/v1',
      kind: 'PodDisruptionBudget',
      spec: { minAvailable: 1, ...spec },
    });
    const applied = pdb({ selector: {} });
    expect(projectOntoApplied(pdb({}), applied)).toEqual(pdb({}));
    expect(projectOntoApplied(pdb({}), applied, true)).toEqual(pdb({}));
    expect(projectOntoApplied(pdb({ selector: null }), applied)).toEqual(pdb({ selector: null }));
    expect(projectOntoApplied(pdb({ selector: null }), applied, true)).toEqual(
      pdb({ selector: null })
    );
  });

  it('shows empty collections the API server left out as applied', () => {
    const appliedConfigMap = { apiVersion: 'v1', kind: 'ConfigMap', data: {} };
    const liveConfigMap = { apiVersion: 'v1', kind: 'ConfigMap' };
    expect(projectOntoApplied(liveConfigMap, appliedConfigMap)).toEqual(appliedConfigMap);

    const appliedWidget = { apiVersion: 'example.com/v1', kind: 'Widget', spec: { options: {} } };
    const liveWidget = { apiVersion: 'example.com/v1', kind: 'Widget', spec: {} };
    expect(projectOntoApplied(liveWidget, appliedWidget)).toEqual(liveWidget);
  });

  it('shows changed values outside quantity fields as live', () => {
    expect(projectOntoApplied({ data: { cpu: '1' } }, { data: { cpu: '1000m' } })).toEqual({
      data: { cpu: '1' },
    });
  });
});

describe('omitNullFields', () => {
  describe('null entries of maps of strings', () => {
    // Taken from a real cluster: `kubectl create --save-config` keeps these nulls in the
    // annotation, while the API server stores them as empty strings.
    const configMap = (data: Record<string, unknown>, labels?: Record<string, unknown>) => ({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'settings', ...(labels ? { labels } : {}) },
      data,
    });
    const compare = (applied: unknown, live: unknown) =>
      countDifferences(omitNullFields(applied, live), live);
    const project = (applied: unknown, live: unknown) =>
      projectOntoApplied(live, omitNullFields(applied, live), true);

    it('treats a null entry stored as an empty string as unchanged', () => {
      const applied = configMap({ empty: null, mode: 'prod' }, { team: null });
      const live = configMap({ empty: '', mode: 'prod' }, { team: '' });
      expect(compare(applied, live)).toBe(0);
      expect(project(applied, live)).toEqual(live);
      expect(omitNullFields(applied, live)).toEqual(live);

      const secret = (data: Record<string, unknown>) => ({
        apiVersion: 'v1',
        kind: 'Secret',
        data,
      });
      expect(compare(secret({ token: null }), secret({ token: '' }))).toBe(0);
      const service = (selector: Record<string, unknown>) => ({
        apiVersion: 'v1',
        kind: 'Service',
        spec: { selector },
      });
      expect(compare(service({ app: null }), service({ app: '' }))).toBe(0);
    });

    it('still counts a changed or removed entry', () => {
      const applied = configMap({ empty: null, mode: 'prod' });
      // A changed nonempty string.
      expect(compare(applied, configMap({ empty: 'x', mode: 'prod' }))).toBe(1);
      expect(project(applied, configMap({ empty: 'x', mode: 'prod' }))).toEqual(
        configMap({ empty: 'x', mode: 'prod' })
      );
      // A removed entry.
      expect(compare(applied, configMap({ empty: '' }))).toBe(1);
      expect(project(applied, configMap({ empty: '' }))).toEqual(configMap({ empty: '' }));
    });

    it('still ignores a null entry the live object does not have', () => {
      // Taken from a real cluster: `kubectl apply` leaves null entries out of the object.
      const applied = configMap({ empty: null, mode: 'prod' }, { team: null });
      expect(compare(applied, configMap({ mode: 'prod' }))).toBe(0);
    });

    it('keeps null values of custom resource maps exact', () => {
      const widget = (options: Record<string, unknown>, labels?: Record<string, unknown>) => ({
        apiVersion: 'example.com/v1',
        kind: 'Widget',
        metadata: { name: 'big', ...(labels ? { labels } : {}) },
        spec: { options },
      });
      expect(compare(widget({ mode: null }), widget({ mode: '' }))).toBe(1);
      // metadata is the built-in ObjectMeta for every object.
      expect(compare(widget({}, { team: null }), widget({}, { team: '' }))).toBe(0);
    });
  });

  it('removes null object fields that are unset in the live object, at any depth', () => {
    const type = { apiVersion: 'v1', kind: 'Pod' };
    expect(
      omitNullFields(
        { ...type, a: null, b: { c: null, d: 1 }, e: [{ f: null, g: 'x' }], h: [null] },
        {
          ...type,
          b: { d: 1 },
          e: [{ g: 'x' }],
          h: [null],
        }
      )
    ).toEqual({ ...type, b: { d: 1 }, e: [{ g: 'x' }], h: [null] });
  });

  it('keeps null fields of custom resources, except in metadata', () => {
    // A field declared `nullable: true` keeps an explicit null, so removing it is a change.
    const widget = (metadata: Record<string, unknown>, spec: Record<string, unknown>) => ({
      apiVersion: 'example.com/v1',
      kind: 'Widget',
      metadata,
      spec,
    });
    const applied = widget({ name: 'w', creationTimestamp: null }, { option: null });
    const live = widget({ name: 'w' }, {});

    expect(omitNullFields(applied, live)).toEqual(widget({ name: 'w' }, { option: null }));
    expect(countDifferences(omitNullFields(applied, live), live)).toBe(1);

    // Still in sync while the live object keeps the null.
    const liveWithNull = widget({ name: 'w' }, { option: null });
    expect(countDifferences(omitNullFields(applied, liveWithNull), liveWithNull)).toBe(0);
  });

  it('keeps null fields that do have a live value, as that is a real difference', () => {
    const applied = { spec: { option: null, nested: { value: null } } };
    const live = { spec: { option: 'changed', nested: { value: false } } };

    expect(omitNullFields(applied, live)).toEqual(applied);
    expect(countDifferences(omitNullFields(applied, live), live)).toBe(2);
  });

  it('keeps null array item fields that do have a live value', () => {
    const applied = { containers: [{ name: 'nginx', command: null }] };
    const live = { containers: [{ name: 'nginx', command: ['sleep'] }] };

    expect(omitNullFields(applied, live)).toEqual(applied);
    expect(countDifferences(omitNullFields(applied, live), live)).toBe(1);
  });
});

describe('isQuantityPath', () => {
  const type = (apiVersion: string, kind: string) => ({ apiVersion, kind });

  it('matches the quantity fields of built-in types', () => {
    for (const [item, path] of [
      [type('v1', 'Pod'), ['spec', 'containers', 'resources', 'limits', 'cpu']],
      [type('v1', 'Pod'), ['spec', 'initContainers', 'resources', 'requests', 'memory']],
      [type('v1', 'Pod'), ['spec', 'overhead', 'cpu']],
      [type('v1', 'Pod'), ['spec', 'volumes', 'emptyDir', 'sizeLimit']],
      [
        type('apps/v1', 'Deployment'),
        ['spec', 'template', 'spec', 'containers', 'resources', 'limits', 'cpu'],
      ],
      [
        type('batch/v1', 'CronJob'),
        [
          'spec',
          'jobTemplate',
          'spec',
          'template',
          'spec',
          'containers',
          'resources',
          'limits',
          'cpu',
        ],
      ],
      [
        type('apps/v1', 'StatefulSet'),
        ['spec', 'volumeClaimTemplates', 'spec', 'resources', 'requests', 'storage'],
      ],
      [type('v1', 'PersistentVolumeClaim'), ['spec', 'resources', 'requests', 'storage']],
      [type('v1', 'ResourceQuota'), ['spec', 'hard', 'requests.cpu']],
      [type('v1', 'PersistentVolume'), ['spec', 'capacity', 'storage']],
      [type('v1', 'LimitRange'), ['spec', 'limits', 'defaultRequest', 'memory']],
      [type('node.k8s.io/v1', 'RuntimeClass'), ['overhead', 'podFixed', 'memory']],
      [
        type('autoscaling/v2', 'HorizontalPodAutoscaler'),
        ['spec', 'metrics', 'containerResource', 'target', 'averageValue'],
      ],
      [
        type('autoscaling/v2', 'HorizontalPodAutoscaler'),
        ['spec', 'metrics', 'object', 'target', 'value'],
      ],
      [
        type('autoscaling/v2', 'HorizontalPodAutoscaler'),
        ['spec', 'behavior', 'scaleDown', 'tolerance'],
      ],
      [
        type('v1', 'Pod'),
        ['spec', 'ephemeralContainers', 'env', 'valueFrom', 'resourceFieldRef', 'divisor'],
      ],
      [
        type('apps/v1', 'DaemonSet'),
        [
          'spec',
          'template',
          'spec',
          'volumes',
          'downwardAPI',
          'items',
          'resourceFieldRef',
          'divisor',
        ],
      ],
      [type('storage.k8s.io/v1', 'CSIStorageCapacity'), ['capacity']],
      [type('storage.k8s.io/v1', 'CSIStorageCapacity'), ['maximumVolumeSize']],
      [
        type('resource.k8s.io/v1', 'ResourceSlice'),
        ['spec', 'devices', 'capacity', 'memory', 'requestPolicy', 'validRange', 'step'],
      ],
      [
        type('resource.k8s.io/v1beta1', 'ResourceSlice'),
        ['spec', 'devices', 'basic', 'consumesCounters', 'counters', 'memory', 'value'],
      ],
      [
        type('resource.k8s.io/v1', 'ResourceSlice'),
        ['spec', 'sharedCounters', 'counters', 'memory', 'value'],
      ],
      [
        type('resource.k8s.io/v1', 'ResourceClaimTemplate'),
        ['spec', 'spec', 'devices', 'requests', 'firstAvailable', 'capacity', 'requests', 'memory'],
      ],
    ] as const) {
      expect(isQuantityPath(item, [...path])).toBe(true);
    }
  });

  it('does not match other fields, or fields of other types', () => {
    for (const [item, path] of [
      [type('v1', 'Pod'), []],
      [type('v1', 'Pod'), ['spec', 'containers', 'env', 'value']],
      [type('v1', 'Pod'), ['spec', 'containers', 'resources', 'limits']],
      [type('v1', 'ConfigMap'), ['data', 'cpu']],
      [
        type('v1', 'Pod'),
        ['spec', 'containers', 'env', 'valueFrom', 'resourceFieldRef', 'resource'],
      ],
      [type('resource.k8s.io/v1', 'ResourceSlice'), ['spec', 'devices', 'capacity', 'memory']],
      [
        type('resource.k8s.io/v1', 'DeviceClass'),
        ['spec', 'devices', 'capacity', 'memory', 'value'],
      ],
      // A suffix of a quantity field is not enough.
      [type('apps/v1', 'Deployment'), ['metadata', 'resources', 'limits', 'cpu']],
      [
        type('apiextensions.k8s.io/v1', 'CustomResourceDefinition'),
        ['spec', 'versions', 'schema', 'openAPIV3Schema', 'resources', 'limits', 'cpu'],
      ],
      // Custom resources, even with the kind and paths of a built-in type.
      [type('example.com/v1', 'Pod'), ['spec', 'containers', 'resources', 'limits', 'cpu']],
      [{}, ['spec', 'containers', 'resources', 'limits', 'cpu']],
    ] as const) {
      expect(isQuantityPath(item, [...path])).toBe(false);
    }
  });
});

describe('convertToLiveApiVersion', () => {
  // Taken from a real cluster: an HPA applied as autoscaling/v1 and fetched as autoscaling/v2.
  const appliedV1 = {
    apiVersion: 'autoscaling/v1',
    kind: 'HorizontalPodAutoscaler',
    metadata: { name: 'web', namespace: 'default' },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
      minReplicas: 1,
      maxReplicas: 3,
      targetCPUUtilizationPercentage: 60,
    },
  } as KubeObjectInterface;
  const liveV2 = (averageUtilization: number) =>
    ({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name: 'web', namespace: 'default' },
      spec: {
        scaleTargetRef: { kind: 'Deployment', name: 'web', apiVersion: 'apps/v1' },
        minReplicas: 1,
        maxReplicas: 3,
        metrics: [
          {
            type: 'Resource',
            resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization } },
          },
        ],
      },
    } as KubeObjectInterface);

  it('converts an applied autoscaling/v1 HPA to the autoscaling/v2 form it is fetched in', () => {
    const converted = convertToLiveApiVersion(appliedV1, liveV2(60));
    expect(converted.apiVersion).toBe('autoscaling/v2');
    expect(converted.spec).not.toHaveProperty('targetCPUUtilizationPercentage');
    expect(countDifferences(converted, liveV2(60))).toBe(0);
    expect(projectOntoApplied(liveV2(60), converted)).toEqual(converted);
    // Without the conversion, the unchanged HPA is reported as drifted.
    expect(countDifferences(appliedV1, liveV2(60))).toBeGreaterThan(0);
  });

  it('still counts a changed CPU target', () => {
    expect(countDifferences(convertToLiveApiVersion(appliedV1, liveV2(80)), liveV2(80))).toBe(1);
  });

  it('adds no metrics when the applied HPA has no CPU target', () => {
    const { targetCPUUtilizationPercentage, ...spec } = appliedV1.spec;
    expect(targetCPUUtilizationPercentage).toBe(60);
    const converted = convertToLiveApiVersion({ ...appliedV1, spec }, liveV2(80));
    expect(converted.spec).not.toHaveProperty('metrics');
    // The default CPU metric the API server adds is only in the live object, so it is not counted.
    expect(countDifferences(converted, liveV2(80))).toBe(0);
  });

  it('returns other objects as is', () => {
    expect(
      convertToLiveApiVersion(appliedV1, { ...liveV2(60), apiVersion: 'autoscaling/v1' })
    ).toBe(appliedV1);
    const deployment = { apiVersion: 'apps/v1', kind: 'Deployment' } as KubeObjectInterface;
    expect(convertToLiveApiVersion(deployment, deployment)).toBe(deployment);
  });
});

describe('base64 data', () => {
  const secret = (token: string) => ({ apiVersion: 'v1', kind: 'Secret', data: { token } });
  const configMap = (field: 'data' | 'binaryData', value: string) => ({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    [field]: { blob: value },
  });

  it('compares Secret data and ConfigMap binaryData by their decoded bytes', () => {
    // Taken from a real cluster: base64 applied over several lines is stored without line breaks.
    expect(countDifferences(secret('YWJj\nZGVm'), secret('YWJjZGVm'))).toBe(0);
    expect(
      countDifferences(configMap('binaryData', 'YWJj\nZGVm'), configMap('binaryData', 'YWJjZGVm'))
    ).toBe(0);
    expect(projectOntoApplied(secret('YWJjZGVm'), secret('YWJj\nZGVm'))).toEqual(
      secret('YWJj\nZGVm')
    );
  });

  it('still counts changed bytes', () => {
    // "abcdef" and "abcdeg".
    expect(countDifferences(secret('YWJj\nZGVm'), secret('YWJjZGVn'))).toBe(1);
    expect(
      countDifferences(configMap('binaryData', 'YWJj\nZGVm'), configMap('binaryData', 'YWJjZGVn'))
    ).toBe(1);
    expect(countDifferences(secret('not base64!'), secret('bm90'))).toBe(1);
  });

  it('compares other strings exactly', () => {
    expect(countDifferences(configMap('data', 'YWJj\nZGVm'), configMap('data', 'YWJjZGVm'))).toBe(
      1
    );
    const custom = (token: string) => ({
      apiVersion: 'example.com/v1',
      kind: 'Secret',
      data: { token },
    });
    expect(countDifferences(custom('YWJj\nZGVm'), custom('YWJjZGVm'))).toBe(1);
  });
});

describe('mergeSecretStringData', () => {
  const secret = (fields: Record<string, unknown>) =>
    ({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'creds' },
      ...fields,
    } as KubeObjectInterface);

  it('encodes stringData into data, as stored by the API server', () => {
    const appliedSecret = mergeSecretStringData(
      secret({ data: { token: 'YWJj' }, stringData: { user: 'admin' } })
    );
    expect(appliedSecret).not.toHaveProperty('stringData');
    expect(appliedSecret.data).toEqual({ token: 'YWJj', user: 'YWRtaW4=' });

    const live = secret({ data: { token: 'YWJj', user: 'YWRtaW4=' } });
    expect(countDifferences(appliedSecret, live)).toBe(0);
  });

  it('counts changed secret values', () => {
    const appliedSecret = mergeSecretStringData(secret({ stringData: { user: 'admin' } }));
    // "root"
    expect(countDifferences(appliedSecret, secret({ data: { user: 'cm9vdA==' } }))).toBe(1);
  });

  it('encodes non-ASCII text as UTF-8', () => {
    const appliedSecret = mergeSecretStringData(secret({ stringData: { greeting: 'héllo 世界' } }));
    expect(appliedSecret.data).toEqual({ greeting: 'aMOpbGxvIOS4lueVjA==' });
  });

  it('lets stringData override data entries with the same key', () => {
    const appliedSecret = mergeSecretStringData(
      secret({ data: { user: 'b2xk' }, stringData: { user: 'new' } })
    );
    expect(appliedSecret.data).toEqual({ user: 'bmV3' });
  });

  it('returns custom resources of a kind named Secret as is', () => {
    const custom = (fields: Record<string, unknown>) =>
      ({ apiVersion: 'example.com/v1', kind: 'Secret', ...fields } as KubeObjectInterface);
    const applied = custom({ stringData: { user: 'admin' } });
    expect(mergeSecretStringData(applied)).toBe(applied);

    // Its stringData is an ordinary field, compared as is.
    expect(countDifferences(applied, custom({ stringData: { user: 'admin' } }))).toBe(0);
    expect(countDifferences(applied, custom({ data: { user: 'YWRtaW4=' } }))).toBe(1);
  });

  it('returns other objects as is', () => {
    const configMap = { kind: 'ConfigMap', stringData: { a: 'b' } } as any;
    expect(mergeSecretStringData(configMap)).toBe(configMap);
    const plainSecret = secret({ data: { a: 'Yg==' } });
    expect(mergeSecretStringData(plainSecret)).toBe(plainSecret);
  });
});

describe('__proto__ keys', () => {
  // JSON.parse creates an own __proto__ property, as for a ConfigMap with that data key.
  const configMap = (value: string | null) =>
    JSON.parse(
      JSON.stringify({ apiVersion: 'v1', kind: 'ConfigMap', data: { other: 'x' } }).replace(
        '"other":"x"',
        `"other":"x","__proto__":${JSON.stringify(value)}`
      )
    );

  it('counts a changed __proto__ value', () => {
    expect(countDifferences(configMap('a'), configMap('b'))).toBe(1);
    expect(countDifferences(configMap('a'), configMap('a'))).toBe(0);
  });

  it('keeps __proto__ keys when omitting null fields', () => {
    const result = omitNullFields(configMap('a'), configMap('b')) as any;
    expect(Object.keys(result.data)).toEqual(['other', '__proto__']);
    expect(countDifferences(result, configMap('b'))).toBe(1);

    // A null __proto__ is still dropped when the live object does not have the key.
    const live = { apiVersion: 'v1', kind: 'ConfigMap', data: { other: 'x' } };
    expect(Object.keys((omitNullFields(configMap(null), live) as any).data)).toEqual(['other']);
  });

  it('keeps __proto__ keys when projecting', () => {
    const projected = projectOntoApplied(configMap('b'), configMap('a')) as any;
    expect(Object.keys(projected.data)).toEqual(['other', '__proto__']);
    expect(Object.getOwnPropertyDescriptor(projected.data, '__proto__')?.value).toBe('b');

    const allFields = projectOntoApplied(configMap('b'), { kind: 'ConfigMap' }, true) as any;
    expect(Object.keys(allFields.data)).toEqual(['other', '__proto__']);
  });
});

describe('countAllDifferences', () => {
  const deployment = (spec: Record<string, unknown>) => ({
    kind: 'Deployment',
    metadata: { name: 'web' },
    spec,
  });

  it('returns 0 for identical objects', () => {
    const a = deployment({ replicas: 2, paused: false });
    expect(countAllDifferences(a, deployment({ replicas: 2, paused: false }))).toBe(0);
  });

  it('counts fields only present on either side, at any depth', () => {
    const a = deployment({ replicas: 2, template: { metadata: { labels: { app: 'web' } } } });
    const b = deployment({ paused: true, template: { metadata: { labels: { tier: 'front' } } } });
    // replicas and app only in a, paused and tier only in b.
    expect(countAllDifferences(a, b)).toBe(4);
    expect(countAllDifferences(b, a)).toBe(4);
  });

  it('counts changed values and extra array items once', () => {
    const a = deployment({ containers: [{ name: 'app', image: 'web:1' }] });
    const b = deployment({
      containers: [
        { name: 'app', image: 'web:2' },
        { name: 'sidecar', image: 'proxy:1' },
      ],
    });
    expect(countAllDifferences(a, b)).toBe(2);
    expect(countAllDifferences(b, a)).toBe(2);
  });

  it('counts fields only present in one side of a shared array item', () => {
    const a = deployment({ containers: [{ name: 'app' }] });
    const b = deployment({ containers: [{ name: 'app', args: ['--debug'] }] });
    expect(countAllDifferences(a, b)).toBe(1);
    expect(countAllDifferences(b, a)).toBe(1);
  });
});
