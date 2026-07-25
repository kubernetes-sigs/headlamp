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
});
