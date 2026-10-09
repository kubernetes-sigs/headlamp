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
    const appliedResources = {
      metadata: { creationTimestamp: null, labels: { app: 'edge-cases' } },
      resources: { limits: { cpu: 2, memory: '0.5Gi' }, requests: { cpu: 1, memory: '64Mi' } },
    };
    const liveResources = {
      metadata: { labels: { app: 'edge-cases' } },
      resources: { limits: { cpu: '2', memory: '512Mi' }, requests: { cpu: '1', memory: '64Mi' } },
    };
    expect(countDifferences(omitNullFields(appliedResources, liveResources), liveResources)).toBe(
      0
    );
  });

  it('accepts canonical forms of quantities in quantity fields', () => {
    const limits = (value: unknown) => ({ resources: { limits: { cpu: value } } });
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
    const limits = (value: unknown) => ({ resources: { limits: { cpu: value } } });
    expect(countDifferences(limits(1), limits('2'))).toBe(1);
    expect(countDifferences(limits('512Mi'), limits('1Gi'))).toBe(1);
    expect(countDifferences(limits('1000'), limits('1Ki'))).toBe(1);
    expect(countDifferences(limits('1'), limits('abc'))).toBe(1);
    expect(countDifferences({ version: '1.10' }, { version: '1.1' })).toBe(1);
    expect(countDifferences({ image: 'nginx:1.27' }, { image: 'nginx:1.28' })).toBe(1);
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
    const live = { resources: { requests: { cpu: '1' } }, dnsPolicy: 'ClusterFirst' };
    const appliedResources = { resources: { requests: { cpu: 1 } } };
    expect(projectOntoApplied(live, appliedResources)).toEqual(appliedResources);
    expect(projectOntoApplied(live, appliedResources, true)).toEqual({
      ...appliedResources,
      dnsPolicy: 'ClusterFirst',
    });
  });

  it('shows canonical forms of quantities as applied', () => {
    const appliedLimits = { resources: { limits: { cpu: '1.0', memory: '1000' } } };
    const liveLimits = { resources: { limits: { cpu: '1', memory: '1k' } } };
    expect(projectOntoApplied(liveLimits, appliedLimits)).toEqual(appliedLimits);
  });

  it('shows changed values outside quantity fields as live', () => {
    expect(projectOntoApplied({ data: { cpu: '1' } }, { data: { cpu: '1000m' } })).toEqual({
      data: { cpu: '1' },
    });
  });
});

describe('omitNullFields', () => {
  it('removes null object fields that are unset in the live object, at any depth', () => {
    expect(
      omitNullFields(
        { a: null, b: { c: null, d: 1 }, e: [{ f: null, g: 'x' }], h: [null] },
        {
          b: { d: 1 },
          e: [{ g: 'x' }],
          h: [null],
        }
      )
    ).toEqual({ b: { d: 1 }, e: [{ g: 'x' }], h: [null] });
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
  it('matches the quantity fields of built-in types', () => {
    for (const path of [
      ['spec', 'containers', 'resources', 'limits', 'cpu'],
      ['spec', 'resources', 'requests', 'storage'],
      ['spec', 'hard', 'requests.cpu'],
      ['spec', 'capacity', 'storage'],
      ['spec', 'limits', 'defaultRequest', 'memory'],
      ['spec', 'overhead', 'cpu'],
      ['overhead', 'podFixed', 'memory'],
      ['spec', 'volumes', 'emptyDir', 'sizeLimit'],
    ]) {
      expect(isQuantityPath(path)).toBe(true);
    }
  });

  it('does not match other fields', () => {
    for (const path of [
      [],
      ['cpu'],
      ['data', 'cpu'],
      ['data', 'limits'],
      ['spec', 'containers', 'env', 'value'],
      ['constructor', 'limits', 'cpu'],
    ]) {
      expect(isQuantityPath(path)).toBe(false);
    }
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
      JSON.stringify({ kind: 'ConfigMap', data: { other: 'x' } }).replace(
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
    const live = { kind: 'ConfigMap', data: { other: 'x' } };
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
