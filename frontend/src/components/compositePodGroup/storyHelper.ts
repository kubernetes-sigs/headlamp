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

import type { KubeCompositePodGroup } from '../../lib/k8s/compositePodGroup';

const creationTimestamp = new Date('2022-01-01').toISOString();

/**
 * A disaggregated serving hierarchy: a root that gangs the prefill and decode stages
 * together, and the two stage groups nested under it. The decode stage never met its
 * requirement, which is the case these views exist to explain.
 */
export const COMPOSITE_POD_GROUP_DUMMY_DATA: KubeCompositePodGroup[] = [
  {
    apiVersion: 'scheduling.k8s.io/v1alpha3',
    kind: 'CompositePodGroup',
    metadata: {
      name: 'llm-serving-root',
      namespace: 'inference',
      creationTimestamp,
      uid: 'composite-pod-group-uid-1',
    },
    spec: {
      schedulingPolicy: { gang: { minGroupCount: 2 } },
      workloadRef: { workloadName: 'llm-serving', templateName: 'serving' },
      schedulingConstraints: { topology: [{ key: 'topology.kubernetes.io/zone' }] },
      disruptionMode: { all: {} },
      priorityClassName: 'high-priority',
      priority: 1000,
      preemptionPolicy: 'PreemptLowerPriority',
    },
    status: {
      conditions: [
        {
          type: 'CompositePodGroupInitiallyScheduled',
          status: 'True',
          reason: 'Scheduled',
          message: 'The subtree of the composite pod group was scheduled.',
          lastProbeTime: creationTimestamp,
          lastTransitionTime: creationTimestamp,
        },
      ],
    },
  } as KubeCompositePodGroup,
  {
    apiVersion: 'scheduling.k8s.io/v1alpha3',
    kind: 'CompositePodGroup',
    metadata: {
      name: 'llm-serving-prefill',
      namespace: 'inference',
      creationTimestamp,
      uid: 'composite-pod-group-uid-2',
    },
    spec: {
      schedulingPolicy: { gang: { minGroupCount: 2 } },
      workloadRef: { workloadName: 'llm-serving', templateName: 'prefill' },
      parentCompositePodGroupName: 'llm-serving-root',
      disruptionMode: { all: {} },
    },
    status: {
      conditions: [
        {
          type: 'CompositePodGroupInitiallyScheduled',
          status: 'True',
          reason: 'Scheduled',
          message: 'The subtree of the composite pod group was scheduled.',
          lastProbeTime: creationTimestamp,
          lastTransitionTime: creationTimestamp,
        },
      ],
    },
  } as KubeCompositePodGroup,
  {
    apiVersion: 'scheduling.k8s.io/v1alpha3',
    kind: 'CompositePodGroup',
    metadata: {
      name: 'llm-serving-decode',
      namespace: 'inference',
      creationTimestamp,
      uid: 'composite-pod-group-uid-3',
    },
    spec: {
      schedulingPolicy: { basic: {} },
      workloadRef: { workloadName: 'llm-serving', templateName: 'decode' },
      parentCompositePodGroupName: 'llm-serving-root',
      disruptionMode: { single: {} },
    },
    status: {
      conditions: [
        {
          type: 'CompositePodGroupInitiallyScheduled',
          status: 'False',
          reason: 'Unschedulable',
          message: 'No feasible placements found for the subtree.',
          lastProbeTime: creationTimestamp,
          lastTransitionTime: creationTimestamp,
        },
      ],
    },
  } as KubeCompositePodGroup,
];
