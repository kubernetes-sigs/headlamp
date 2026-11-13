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

  it('pairs spec metrics with status entries by identity, not by position', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'Resource',
        resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 50 } },
      },
      {
        type: 'Resource',
        resource: { name: 'memory', target: { type: 'AverageValue', averageValue: '100Mi' } },
      },
    ];
    // The cpu metric could not be read, so the HPA controller leaves it out of
    // status.currentMetrics and the memory entry moves up to index 0.
    data.status.currentMetrics = [
      { type: 'Resource', resource: { name: 'memory', current: { averageValue: '100Mi' } } },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].name).toBe('cpu');
    expect(metrics[0].value).toBe('<unknown>/50%');
    expect(metrics[0].shortValue).toBe('<unknown>/50%');
    expect(metrics[1].name).toBe('memory');
    expect(metrics[1].value).toBe('100Mi/100Mi');
  });

  it('pairs pods metrics with the same name by their selectors', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'Pods',
        pods: {
          metric: { name: 'packets_per_second' },
          target: { type: 'AverageValue', averageValue: '1000' },
        },
      },
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'packets_per_second',
            selector: { matchLabels: { app: 'front' } },
          },
          target: { type: 'AverageValue', averageValue: '2000' },
        },
      },
    ];
    // The selector-less series could not be read; the entry that remains
    // belongs to the selected one and must not be reused for both rows.
    data.status.currentMetrics = [
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'packets_per_second',
            selector: { matchLabels: { app: 'front' } },
          },
          current: { averageValue: '42' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].value).toBe('<unknown>/1000');
    expect(metrics[1].value).toBe('42/2000');
  });

  it('treats omitted, empty and equivalent selectors as the same', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'packets_per_second',
            selector: {
              matchExpressions: [
                { key: 'env', operator: 'In', values: ['prod', 'dev'] },
                { key: 'tier', operator: 'In', values: ['web'] },
              ],
            },
          },
          target: { type: 'AverageValue', averageValue: '1000' },
        },
      },
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'bytes_per_second',
            selector: {},
          },
          target: { type: 'AverageValue', averageValue: '500' },
        },
      },
    ];
    // The first entry serializes the same requirements as the spec but with
    // the expressions in a different order; the second has no selector field
    // although the spec spells out an empty one.
    data.status.currentMetrics = [
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'bytes_per_second',
          },
          current: { averageValue: '8' },
        },
      },
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'packets_per_second',
            selector: {
              matchExpressions: [
                { key: 'tier', operator: 'In', values: ['web'] },
                { key: 'env', operator: 'In', values: ['dev', 'prod'] },
              ],
            },
          },
          current: { averageValue: '42' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].value).toBe('42/1000');
    expect(metrics[1].value).toBe('8/500');
  });

  it('pairs metrics whose existence selectors omit values', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'packets_per_second',
            selector: {
              matchExpressions: [
                { key: 'env', operator: 'Exists' },
                { key: 'legacy', operator: 'DoesNotExist' },
              ],
            },
          },
          target: { type: 'AverageValue', averageValue: '1000' },
        },
      },
    ];
    // Exists and DoesNotExist requirements omit values in the API, both in the
    // spec and in status, and must not make the lookup throw.
    data.status.currentMetrics = [
      {
        type: 'Pods',
        pods: {
          metric: {
            name: 'packets_per_second',
            selector: {
              matchExpressions: [
                { key: 'legacy', operator: 'DoesNotExist' },
                { key: 'env', operator: 'Exists' },
              ],
            },
          },
          current: { averageValue: '42' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].value).toBe('42/1000');
  });

  it('pairs object metrics with the same name by their described objects', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'Object',
        object: {
          metric: { name: 'requests_per_second' },
          describedObject: { apiVersion: 'v1', kind: 'Service', name: 'frontend' },
          target: { type: 'AverageValue', averageValue: '100' },
        },
      },
      {
        type: 'Object',
        object: {
          metric: { name: 'requests_per_second' },
          describedObject: { apiVersion: 'v1', kind: 'Service', name: 'backend' },
          target: { type: 'AverageValue', averageValue: '200' },
        },
      },
    ];
    // The frontend metric could not be read, so only the backend entry is in
    // the status; it must not be reported for both rows.
    data.status.currentMetrics = [
      {
        type: 'Object',
        object: {
          metric: { name: 'requests_per_second' },
          describedObject: { apiVersion: 'v1', kind: 'Service', name: 'backend' },
          current: { averageValue: '55' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].value).toBe('<unknown>/100');
    expect(metrics[1].value).toBe('55/200');
  });
  it('pairs external metrics with repeated identities by their target types', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'External',
        external: {
          metric: { name: 'queue_depth' },
          target: { type: 'Value', value: '100' },
        },
      },
      {
        type: 'External',
        external: {
          metric: { name: 'queue_depth' },
          target: { type: 'AverageValue', averageValue: '10' },
        },
      },
    ];
    data.status.currentMetrics = [
      {
        type: 'External',
        external: {
          metric: { name: 'queue_depth' },
          current: { value: '150' },
        },
      },
      {
        type: 'External',
        external: {
          metric: { name: 'queue_depth' },
          current: { averageValue: '15' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].value).toBe('150/100');
    expect(metrics[1].value).toBe('15/10');

    // When the AverageValue status is absent, it must not reuse the Value entry.
    data.status.currentMetrics = [
      {
        type: 'External',
        external: {
          metric: { name: 'queue_depth' },
          current: { value: '150' },
        },
      },
    ];
    const hpaMissing = new HPA(data);
    const metricsMissing = hpaMissing.metrics(mockT);
    expect(metricsMissing).toHaveLength(2);
    expect(metricsMissing[0].value).toBe('150/100');
    expect(metricsMissing[1].value).toBe('<unknown>/10');
  });

  it('pairs resource metrics sharing the same resource name across different target types', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'Resource',
        resource: {
          name: 'cpu',
          target: { type: 'Utilization', averageUtilization: 50 },
        },
      },
      {
        type: 'Resource',
        resource: {
          name: 'cpu',
          target: { type: 'AverageValue', averageValue: '200m' },
        },
      },
    ];
    data.status.currentMetrics = [
      {
        type: 'Resource',
        resource: {
          name: 'cpu',
          current: { averageUtilization: 40, averageValue: '160m' },
        },
      },
      {
        type: 'Resource',
        resource: {
          name: 'cpu',
          current: { averageValue: '160m' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(2);
    expect(metrics[0].value).toBe('40% (160m)/50%');
    expect(metrics[1].value).toBe('160m/200m');
  });

  it('handles missing utilization without reusing raw usage for resource metrics', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'Resource',
        resource: {
          name: 'cpu',
          target: { type: 'Utilization', averageUtilization: 50 },
        },
      },
    ];
    // Raw usage is present in status, but utilization could not be computed
    // (e.g. request not set); it must report <unknown> rather than reusing raw usage.
    data.status.currentMetrics = [
      {
        type: 'Resource',
        resource: {
          name: 'cpu',
          current: { averageValue: '100m' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].value).toBe('<unknown>/50%');
    expect(metrics[0].shortValue).toBe('<unknown>/50%');
  });

  it('handles missing utilization without reusing raw usage for container resource metrics', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'ContainerResource',
        containerResource: {
          container: 'app',
          name: 'cpu',
          target: { type: 'Utilization', averageUtilization: 50 },
        },
      },
    ];
    data.status.currentMetrics = [
      {
        type: 'ContainerResource',
        containerResource: {
          container: 'app',
          name: 'cpu',
          current: { averageValue: '100m' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].value).toBe('<unknown>/50%');
  });

  it('correctly handles averageUtilization of 0 in container resource metrics', () => {
    const data = JSON.parse(JSON.stringify(mockHpaData));
    data.spec.metrics = [
      {
        type: 'ContainerResource',
        containerResource: {
          container: 'app',
          name: 'cpu',
          target: { type: 'Utilization', averageUtilization: 50 },
        },
      },
    ];
    data.status.currentMetrics = [
      {
        type: 'ContainerResource',
        containerResource: {
          container: 'app',
          name: 'cpu',
          current: { averageUtilization: 0, averageValue: '0m' },
        },
      },
    ];

    const hpa = new HPA(data);
    const mockT = (key: string) => key.replace('translation|', '');
    const metrics = hpa.metrics(mockT);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].value).toBe('0%/50%');
  });
});
