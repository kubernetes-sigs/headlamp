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
  LAST_APPLIED_ANNOTATION,
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
    expect(countDifferences({ cpu: '0.5' }, { cpu: '500m' })).toBe(0);
  });

  it('still counts real quantity and version changes', () => {
    expect(countDifferences({ cpu: 1 }, { cpu: '2' })).toBe(1);
    expect(countDifferences({ memory: '512Mi' }, { memory: '1Gi' })).toBe(1);
    // Plain strings are not treated as quantities.
    expect(countDifferences({ version: '1.10' }, { version: '1.1' })).toBe(1);
    expect(countDifferences({ image: 'nginx:1.27' }, { image: 'nginx:1.28' })).toBe(1);
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
    const live = { cpu: '1', dnsPolicy: 'ClusterFirst' };
    expect(projectOntoApplied(live, { cpu: 1 })).toEqual({ cpu: 1 });
    expect(projectOntoApplied(live, { cpu: 1 }, true)).toEqual({
      cpu: 1,
      dnsPolicy: 'ClusterFirst',
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
