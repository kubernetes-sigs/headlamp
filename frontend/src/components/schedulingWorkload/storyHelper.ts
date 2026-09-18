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

import type { KubeSchedulingWorkload } from '../../lib/k8s/schedulingWorkload';

const creationTimestamp = new Date('2022-01-01').toISOString();

export const SCHEDULING_WORKLOAD_DUMMY_DATA: KubeSchedulingWorkload[] = [
  {
    apiVersion: 'scheduling.k8s.io/v1beta1',
    kind: 'Workload',
    metadata: {
      name: 'training-job',
      namespace: 'default',
      creationTimestamp,
      uid: 'workload-uid-1',
    },
    spec: {
      controllerRef: { apiGroup: 'batch', kind: 'Job', name: 'training-job' },
      podGroupTemplates: [
        {
          name: 'workers',
          schedulingPolicy: { gang: { minCount: 4 } },
          schedulingConstraints: { topology: [{ key: 'kubernetes.io/hostname' }] },
          disruptionMode: { all: {} },
          priorityClassName: 'high-priority',
          priority: 1000,
          preemptionPolicy: 'PreemptLowerPriority',
        },
        {
          name: 'launcher',
          schedulingPolicy: { basic: {} },
        },
      ],
      compositePodGroupTemplates: [
        {
          name: 'gang-of-gangs',
          schedulingPolicy: { gang: { minGroupCount: 2 } },
          schedulingConstraints: { topology: [{ key: 'topology.kubernetes.io/zone' }] },
          disruptionMode: { all: {} },
          priorityClassName: 'high-priority',
          priority: 1000,
          preemptionPolicy: 'PreemptLowerPriority',
          podGroupTemplates: [{ name: 'workers', schedulingPolicy: { gang: { minCount: 4 } } }],
        },
      ],
    },
  } as KubeSchedulingWorkload,
  {
    apiVersion: 'scheduling.k8s.io/v1beta1',
    kind: 'Workload',
    metadata: {
      name: 'inference-service',
      namespace: 'default',
      creationTimestamp,
      uid: 'workload-uid-2',
    },
    spec: {
      controllerRef: { apiGroup: 'apps', kind: 'Deployment', name: 'inference-service' },
      podGroupTemplates: [{ name: 'servers', schedulingPolicy: { basic: {} } }],
    },
  } as KubeSchedulingWorkload,
];
