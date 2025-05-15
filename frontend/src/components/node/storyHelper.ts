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

import { KubeNode } from '../../lib/k8s/node';

const creationTimestamp = new Date('2022-01-01').toISOString();

export const NODE_DUMMY_DATA: KubeNode[] = [
  {
    kind: 'Node',
    apiVersion: 'v1',
    metadata: {
      name: 'node',
      namespace: 'default',
      creationTimestamp,
      uid: '123',
      labels: {},
    },
    spec: {
      podCIDR: '',
      podCIDRs: [],
      providerID: '',
      taints: [],
      unschedulable: false,
    },
    status: {
      addresses: [],
      allocatable: {
        cpu: '',
        ephemeralStorage: '',
        hugepages_1Gi: '',
        hugepages_2Mi: '',
        memory: '',
        pods: '',
      },
      conditions: [],
      capacity: {
        cpu: '',
        ephemeralStorage: '',
        hugepages_1Gi: '',
        hugepages_2Mi: '',
        memory: '',
        pods: '',
      },
      nodeInfo: {
        architecture: '',
        bootID: '',
        containerRuntimeVersion: '',
        kernelVersion: '',
        kubeProxyVersion: '',
        kubeletVersion: '',
        machineID: '',
        operatingSystem: '',
        osImage: '',
        systemUUID: '',
      },
    },
  },
  {
    kind: 'Node',
    apiVersion: 'v1',
    metadata: {
      name: 'node-2',
      namespace: 'default',
      creationTimestamp,
      uid: '123',
      labels: {},
    },
    spec: {
      podCIDR: '',
      podCIDRs: [],
      providerID: '',
      taints: [],
      unschedulable: false,
    },
    status: {},
  },
];
