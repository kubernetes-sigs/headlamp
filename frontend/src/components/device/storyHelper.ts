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
