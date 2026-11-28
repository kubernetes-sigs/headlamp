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
import App from '../../App';
import HPA from './hpa';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('HPA class', () => {
  const mockHpaData = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: 'test-hpa',
      namespace: 'default',
      resourceVersion: '123',
    },
    spec: {
      maxReplicas: 10,
      minReplicas: 1,
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: 'test-deployment',
      },
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: {
              type: 'Utilization',
              averageUtilization: 0,
            },
          },
        },
      ],
    },
    status: {
      currentReplicas: 1,
      desiredReplicas: 1,
      lastScaleTime: '2020-01-01T00:00:00Z',
      conditions: [],
      currentMetrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            current: {
              averageUtilization: 0,
              averageValue: '0m',
            },
          },
        },
      ],
    },
  };

  it('correctly handles averageUtilization of 0 in metrics', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    const hpa = new HPA(data);
    const mockT = (key: string) => {
      if (key.includes('translation|')) {
        return key.replace('translation|', '');
      }
      return key;
    };
    const metrics = hpa.metrics(mockT);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].value).toBe('0% (0m)/0%');
    expect(metrics[0].shortValue).toBe('0% /0%');
  });

  const mockT = (key: string, opts?: Record<string, string>) => {
    let res = key.includes('translation|') ? key.replace('translation|', '') : key;
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        res = res.replace(`{{${k}}}`, v);
      }
    }
    return res;
  };

  it('returns base object and status getter', () => {
    const base = HPA.getBaseObject();
    expect(base.spec).toEqual({
      maxReplicas: 0,
      minReplicas: 0,
      scaleTargetRef: { apiVersion: '', kind: '', name: '' },
      metrics: [],
    });

    const hpa = new HPA(JSON.parse(JSON.stringify(mockHpaData)));
    expect(hpa.status.currentReplicas).toBe(1);
  });

  it('formats External, Object, Pods, Resource, and ContainerResource metrics with and without status', () => {
    const hpaWithStatus = new HPA({
      ...mockHpaData,
      spec: {
        ...mockHpaData.spec,
        metrics: [
          {
            type: 'External',
            external: {
              metric: { name: 'queue_messages' } as any,
              target: { type: 'Value', value: '30' },
            },
          },
          {
            type: 'Object',
            object: {
              metric: { name: 'requests_per_second' } as any,
              describedObject: { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', name: 'web' },
              target: { type: 'Value', value: '10k' },
            },
          },
          {
            type: 'Pods',
            pods: {
              metric: { name: 'packets_per_second' } as any,
              target: { type: 'AverageValue', averageValue: '1k' },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: { type: 'AverageValue', averageValue: '500Mi' },
            },
          },
          {
            type: 'ContainerResource',
            containerResource: {
              container: 'app',
              name: 'cpu',
              target: { type: 'Utilization', averageUtilization: 80 },
            },
          },
        ],
      },
      status: {
        ...mockHpaData.status,
        currentMetrics: [
          { type: 'External', external: { current: { value: '15' }, metric: {} as any } },
          {
            type: 'Object',
            object: {
              current: { averageValue: '5k' },
              metric: {} as any,
              desiredObject: {} as any,
            },
          },
          { type: 'Pods', pods: { current: { averageUtilization: 42 }, metric: {} as any } },
          { type: 'Resource', resource: { name: 'memory', current: {} } },
          {
            type: 'ContainerResource',
            containerResource: {
              container: 'app',
              name: 'cpu',
              current: { averageUtilization: 50 },
            },
          },
        ],
      },
    } as any);

    const metrics = hpaWithStatus.metrics(mockT);
    expect(metrics).toEqual([
      {
        name: 'queue_messages',
        definition: '"queue_messages" (target value)',
        value: '15/30',
        shortValue: '15/30',
      },
      {
        name: 'requests_per_second',
        definition: '"requests_per_second" on Ingress/web (target value)',
        value: '5k/10k',
        shortValue: '5k/10k',
      },
      {
        name: 'packets_per_second',
        definition: '"packets_per_second" on pods',
        value: '42%/1k',
        shortValue: '42%/1k',
      },
      {
        name: 'memory',
        definition: 'resource memory on pods',
        value: '<unknown>/500Mi',
        shortValue: '<unknown>/500Mi',
      },
      {
        name: 'cpu',
        definition: 'resource cpu of container app on pods',
        value: '50%/80%',
        shortValue: '50%/80%',
      },
    ]);
  });

  it('handles missing currentMetrics, unknown target types, and Resource Utilization edge cases', () => {
    const hpaNoStatus = new HPA({
      ...mockHpaData,
      spec: {
        ...mockHpaData.spec,
        metrics: [
          {
            type: 'External',
            external: { metric: {} as any, target: { type: 'Unknown' as any } },
          },
          {
            type: 'Object',
            object: {
              metric: {} as any,
              describedObject: {} as any,
              target: { type: 'Utilization' },
            },
          },
          {
            type: 'Pods',
            pods: { metric: {} as any, target: { type: 'AverageValue', averageValue: '10' } },
          },
          {
            type: 'Resource',
            resource: { name: 'memory', target: { type: 'AverageValue', averageValue: '1Gi' } },
          },
          {
            type: 'Resource',
            resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 75 } },
          },
          {
            type: 'ContainerResource',
            containerResource: {
              container: 'app',
              name: 'memory',
              target: { type: 'AverageValue', averageValue: '256Mi' },
            },
          },
        ],
      },
      status: { ...mockHpaData.status, currentMetrics: null },
    } as any);

    const noStatusMetrics = hpaNoStatus.metrics(mockT);
    expect(noStatusMetrics[0]).toMatchObject({
      name: '<unknown>',
      definition: '"<unknown>" <auto>',
      value: '<unknown>/',
    });
    expect(noStatusMetrics[1].definition).toContain('<unknown>/<unknown>');
    expect(noStatusMetrics[2].value).toBe('<unknown>/10');
    expect(noStatusMetrics[3].value).toBe('<unknown>/1Gi');
    expect(noStatusMetrics[4]).toMatchObject({
      value: '<unknown>/75%',
      shortValue: '<unknown>/75%',
    });
    expect(noStatusMetrics[5].value).toBe('<unknown>/256Mi');

    // Resource Utilization when status entry exists but status.resource is missing
    const hpaPartialStatus = new HPA({
      ...mockHpaData,
      status: {
        ...mockHpaData.status,
        currentMetrics: [{ type: 'Resource' }],
      },
    } as any);
    const partialMetrics = hpaPartialStatus.metrics(mockT);
    expect(partialMetrics[0].value).toBe('<unknown>% (<unknown>)/0%');
    expect(partialMetrics[0].shortValue).toBe('<unknown>% /0%');
  });

  it('resolves referenceObject when target kind is known and returns null otherwise', () => {
    const hpaKnown = new HPA(JSON.parse(JSON.stringify(mockHpaData)), 'my-cluster');
    const ref = hpaKnown.referenceObject;
    expect(ref).not.toBeNull();
    expect(ref?.getName()).toBe('test-deployment');
    expect(ref?.getNamespace()).toBe('default');

    const hpaUnknown = new HPA({
      ...mockHpaData,
      spec: {
        ...mockHpaData.spec,
        scaleTargetRef: { apiVersion: 'v1', kind: 'UnknownKind', name: 'x' },
      },
    } as any);
    expect(hpaUnknown.referenceObject).toBeNull();

    const hpaGroupMismatch = new HPA({
      ...mockHpaData,
      spec: {
        ...mockHpaData.spec,
        scaleTargetRef: {
          apiVersion: 'example.com/v1',
          kind: 'Deployment',
          name: 'custom-deployment',
        },
      },
    } as any);
    expect(hpaGroupMismatch.referenceObject).toBeNull();

    const hpaNoRef = new HPA({
      ...mockHpaData,
      spec: { ...mockHpaData.spec, scaleTargetRef: undefined as any },
    } as any);
    expect(hpaNoRef.referenceObject).toBeNull();
  });
});
