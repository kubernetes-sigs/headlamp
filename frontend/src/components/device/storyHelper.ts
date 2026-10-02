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

import type { KubeDeviceClass } from '../../lib/k8s/deviceClass';
import type { KubeResourceClaim } from '../../lib/k8s/resourceClaim';

const creationTimestamp = new Date('2022-01-01').toISOString();

/** Device classes as published by the dra-example-driver, plus hand-written variants. */
export const DEVICE_CLASS_DUMMY_DATA: KubeDeviceClass[] = [
  {
    apiVersion: 'resource.k8s.io/v1',
    kind: 'DeviceClass',
    metadata: {
      name: 'gpu.example.com',
      creationTimestamp,
      uid: 'device-class-uid-1',
    },
    spec: {
      selectors: [{ cel: { expression: "device.driver == 'gpu.example.com'" } }],
    },
  },
  {
    apiVersion: 'resource.k8s.io/v1',
    kind: 'DeviceClass',
    metadata: {
      name: 'big-gpu.example.com',
      creationTimestamp,
      uid: 'device-class-uid-2',
    },
    spec: {
      selectors: [
        { cel: { expression: "device.driver == 'gpu.example.com'" } },
        {
          cel: {
            expression:
              "device.capacity['gpu.example.com'].memory.compareTo(quantity('40Gi')) >= 0",
          },
        },
      ],
      config: [
        {
          opaque: {
            driver: 'gpu.example.com',
            parameters: {
              apiVersion: 'gpu.resource.example.com/v1alpha1',
              kind: 'GpuConfig',
              sharing: { strategy: 'TimeSlicing' },
            },
          },
        },
      ],
      extendedResourceName: 'example.com/big-gpu',
    },
  },
  {
    apiVersion: 'resource.k8s.io/v1',
    kind: 'DeviceClass',
    metadata: {
      name: 'any-device',
      creationTimestamp,
      uid: 'device-class-uid-3',
    },
    spec: {},
  },
];

const worker = 'gpu-worker-0';

/** The node selector the scheduler writes for devices that live on one node. */
const singleNodeSelector = {
  nodeSelectorTerms: [
    { matchFields: [{ key: 'metadata.name', operator: 'In', values: [worker] }] },
  ],
};

/**
 * Claims covering the states an operator meets: waiting to be scheduled, allocated
 * and shared by two pods, a prioritized list that settled on its fallback, and a
 * claim generated for a pod from a template.
 */
export const RESOURCE_CLAIM_DUMMY_DATA: KubeResourceClaim[] = [
  {
    apiVersion: 'resource.k8s.io/v1',
    kind: 'ResourceClaim',
    metadata: {
      name: 'pending-gpu',
      namespace: 'default',
      creationTimestamp,
      uid: 'resource-claim-uid-1',
    },
    spec: {
      devices: {
        requests: [
          {
            name: 'gpu',
            exactly: {
              deviceClassName: 'nothing.example.com',
              allocationMode: 'ExactCount',
              count: 1,
            },
          },
        ],
      },
    },
    // A claim the scheduler has not answered yet is served with an empty status.
    status: {},
  },
  {
    apiVersion: 'resource.k8s.io/v1',
    kind: 'ResourceClaim',
    metadata: {
      name: 'shared-gpu',
      namespace: 'default',
      creationTimestamp,
      uid: 'resource-claim-uid-2',
    },
    spec: {
      devices: {
        requests: [
          {
            name: 'gpu',
            exactly: {
              deviceClassName: 'gpu.example.com',
              allocationMode: 'ExactCount',
              count: 1,
            },
          },
        ],
      },
    },
    status: {
      allocation: {
        devices: {
          results: [{ request: 'gpu', driver: 'gpu.example.com', pool: worker, device: 'gpu-5' }],
        },
        nodeSelector: singleNodeSelector,
      },
      reservedFor: [
        { resource: 'pods', name: 'trainer-0', uid: 'pod-uid-1' },
        { resource: 'pods', name: 'trainer-1', uid: 'pod-uid-2' },
      ],
    },
  },
  {
    apiVersion: 'resource.k8s.io/v1',
    kind: 'ResourceClaim',
    metadata: {
      name: 'fallback-gpu',
      namespace: 'default',
      creationTimestamp,
      uid: 'resource-claim-uid-3',
    },
    spec: {
      devices: {
        requests: [
          {
            name: 'gpu',
            firstAvailable: [
              { name: 'big', deviceClassName: 'a100.example.com', count: 1 },
              { name: 'small', deviceClassName: 'gpu.example.com', count: 1 },
            ],
          },
        ],
      },
    },
    status: {
      allocation: {
        // The scheduler reports the alternative it settled on as <request>/<subrequest>.
        devices: {
          results: [
            { request: 'gpu/small', driver: 'gpu.example.com', pool: worker, device: 'gpu-6' },
          ],
        },
        nodeSelector: singleNodeSelector,
      },
      reservedFor: [{ resource: 'pods', name: 'fallback-pod', uid: 'pod-uid-3' }],
    },
  },
  {
    apiVersion: 'resource.k8s.io/v1',
    kind: 'ResourceClaim',
    metadata: {
      name: 'trainer-2-gpus-vfghv',
      namespace: 'default',
      creationTimestamp,
      uid: 'resource-claim-uid-4',
      // Claims made from a template are owned by the pod and keep this annotation.
      annotations: { 'resource.kubernetes.io/pod-claim-name': 'gpus' },
      ownerReferences: [
        {
          apiVersion: 'v1',
          kind: 'Pod',
          name: 'trainer-2',
          uid: 'pod-uid-4',
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
    },
    spec: {
      devices: {
        requests: [
          {
            name: 'gpu-1',
            exactly: {
              deviceClassName: 'gpu.example.com',
              allocationMode: 'ExactCount',
              count: 1,
            },
          },
          {
            name: 'gpu-2',
            exactly: {
              deviceClassName: 'gpu.example.com',
              allocationMode: 'ExactCount',
              count: 1,
            },
          },
        ],
      },
    },
    status: {
      allocation: {
        devices: {
          results: [
            { request: 'gpu-1', driver: 'gpu.example.com', pool: worker, device: 'gpu-2' },
            { request: 'gpu-2', driver: 'gpu.example.com', pool: worker, device: 'gpu-3' },
          ],
        },
        nodeSelector: singleNodeSelector,
      },
      reservedFor: [{ resource: 'pods', name: 'trainer-2', uid: 'pod-uid-4' }],
    },
  },
];
