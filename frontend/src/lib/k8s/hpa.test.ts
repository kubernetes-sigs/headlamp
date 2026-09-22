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

  it('matches metrics by identifier when status.currentMetrics is in different order than spec.metrics', () => {
    const data = {
      ...mockHpaData,
      spec: {
        ...mockHpaData.spec,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 80,
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: {
                type: 'AverageValue',
                averageValue: '500Mi',
              },
            },
          },
        ],
      },
      status: {
        ...mockHpaData.status,
        currentMetrics: [
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              current: {
                averageValue: '250Mi',
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              current: {
                averageUtilization: 45,
                averageValue: '450m',
              },
            },
          },
        ],
      },
    };
    const hpa = new HPA(data as any);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].name).toBe('cpu');
    expect(metrics[0].value).toBe('45% (450m)/80%');
    expect(metrics[0].shortValue).toBe('45% /80%');

    expect(metrics[1].name).toBe('memory');
    expect(metrics[1].value).toBe('250Mi/500Mi');
    expect(metrics[1].shortValue).toBe('250Mi/500Mi');
  });

  it('handles partially reported or missing currentMetrics gracefully with <unknown>', () => {
    const data = {
      ...mockHpaData,
      spec: {
        ...mockHpaData.spec,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 80,
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: {
                type: 'AverageValue',
                averageValue: '500Mi',
              },
            },
          },
        ],
      },
      status: {
        ...mockHpaData.status,
        currentMetrics: [
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              current: {
                averageValue: '250Mi',
              },
            },
          },
        ],
      },
    };
    const hpa = new HPA(data as any);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].name).toBe('cpu');
    expect(metrics[0].value).toBe('<unknown>/80%');
    expect(metrics[0].shortValue).toBe('<unknown>/80%');

    expect(metrics[1].name).toBe('memory');
    expect(metrics[1].value).toBe('250Mi/500Mi');
  });

  it('matches Pods, Object, External, and ContainerResource metrics by identifier', () => {
    const data = {
      ...mockHpaData,
      spec: {
        ...mockHpaData.spec,
        metrics: [
          {
            type: 'Pods',
            pods: {
              metric: { name: 'packets-per-second' },
              target: { type: 'AverageValue', averageValue: '1k' },
            },
          },
          {
            type: 'Object',
            object: {
              describedObject: {
                apiVersion: 'networking.k8s.io/v1',
                kind: 'Ingress',
                name: 'main-ingress',
              },
              metric: { name: 'requests-per-second' },
              target: { type: 'Value', value: '10k' },
            },
          },
          {
            type: 'External',
            external: {
              metric: { name: 'queue-depth' },
              target: { type: 'Value', value: '30' },
            },
          },
          {
            type: 'ContainerResource',
            containerResource: {
              container: 'app',
              name: 'cpu',
              target: { type: 'AverageValue', averageValue: '200m' },
            },
          },
        ],
      },
      status: {
        ...mockHpaData.status,
        currentMetrics: [
          {
            type: 'ContainerResource',
            containerResource: {
              container: 'app',
              name: 'cpu',
              current: { averageValue: '120m' },
            },
          },
          {
            type: 'Object',
            object: {
              describedObject: {
                apiVersion: 'networking.k8s.io/v1',
                kind: 'Ingress',
                name: 'main-ingress',
              },
              metric: { name: 'requests-per-second' },
              current: { value: '2k' },
            },
          },
          {
            type: 'External',
            external: {
              metric: { name: 'queue-depth' },
              current: { value: '15' },
            },
          },
          {
            type: 'Pods',
            pods: {
              metric: { name: 'packets-per-second' },
              current: { averageValue: '800' },
            },
          },
        ],
      },
    };
    const hpa = new HPA(data as any);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(4);
    expect(metrics[0].name).toBe('packets-per-second');
    expect(metrics[0].value).toBe('800/1k');

    expect(metrics[1].name).toBe('requests-per-second');
    expect(metrics[1].value).toBe('2k/10k');

    expect(metrics[2].name).toBe('queue-depth');
    expect(metrics[2].value).toBe('15/30');

    expect(metrics[3].name).toBe('cpu');
    expect(metrics[3].value).toBe('120m/200m');
  });

  it('safely handles HPA with undefined status or null currentMetrics', () => {
    const data = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name: 'unready-hpa', namespace: 'default' },
      spec: {
        maxReplicas: 5,
        scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'app' },
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: { type: 'Utilization', averageUtilization: 70 },
            },
          },
        ],
      },
    };
    const hpa = new HPA(data as any);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('cpu');
    expect(metrics[0].value).toBe('<unknown>/70%');
  });
});
