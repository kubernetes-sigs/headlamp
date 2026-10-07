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

import type { KubePodGroup } from '../../lib/k8s/podGroup';

const creationTimestamp = new Date('2022-01-01').toISOString();

export const POD_GROUP_DUMMY_DATA: KubePodGroup[] = [
  {
    apiVersion: 'scheduling.k8s.io/v1beta1',
    kind: 'PodGroup',
    metadata: {
      name: 'training-job-workers',
      namespace: 'default',
      creationTimestamp,
      uid: 'pod-group-uid-1',
    },
    spec: {
      schedulingPolicy: { gang: { minCount: 4 } },
      workloadRef: { workloadName: 'training-job', templateName: 'workers' },
      disruptionMode: { all: {} },
      priorityClassName: 'high-priority',
      priority: 1000,
      preemptionPolicy: 'PreemptLowerPriority',
      schedulingConstraints: { topology: [{ key: 'kubernetes.io/hostname' }] },
    },
    status: {
      conditions: [
        {
          type: 'PodGroupScheduled',
          status: 'True',
          reason: 'Scheduled',
          message: 'All pods of the group were scheduled.',
          lastProbeTime: creationTimestamp,
          lastTransitionTime: creationTimestamp,
        },
      ],
    },
  } as KubePodGroup,
  {
    apiVersion: 'scheduling.k8s.io/v1beta1',
    kind: 'PodGroup',
    metadata: {
      name: 'training-job-launcher',
      namespace: 'default',
      creationTimestamp,
      uid: 'pod-group-uid-2',
    },
    spec: {
      schedulingPolicy: { basic: {} },
      workloadRef: { workloadName: 'training-job', templateName: 'launcher' },
    },
    status: {
      conditions: [
        {
          type: 'PodGroupScheduled',
          status: 'False',
          reason: 'Unschedulable',
          message: 'Not enough resources to schedule the whole group.',
          lastProbeTime: creationTimestamp,
          lastTransitionTime: creationTimestamp,
        },
      ],
    },
  } as KubePodGroup,
];
