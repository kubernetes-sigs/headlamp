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

import type { KubeMetrics } from '../../lib/k8s/cluster';
import type { KubeNode } from '../../lib/k8s/node';
import { NODE_POOL_LABEL_KEYS } from '../../lib/k8s/nodeConstants';

const creationTimestamp = new Date('2022-01-01').toISOString();

/**
 * A fully-populated node with capacity, allocatable, conditions and system info.
 * Useful for Details and Charts stories that need realistic resource data.
 */
export const NODE_DETAILED_DATA: KubeNode = {
  kind: 'Node',
  apiVersion: 'v1',
  metadata: {
    name: 'node',
    creationTimestamp,
    uid: 'detailed-node-uid',
    labels: {
      'node-role.kubernetes.io/control-plane': '',
      'kubernetes.io/arch': 'amd64',
      'kubernetes.io/os': 'linux',
    },
  },
  spec: {
    podCIDR: '10.244.0.0/24',
    podCIDRs: ['10.244.0.0/24'],
    providerID: 'kind://docker/headlamp/node',
    taints: [],
    unschedulable: false,
  },
  status: {
    addresses: [
      { type: 'InternalIP', address: '172.18.0.2' },
      { type: 'Hostname', address: 'node' },
    ],
    allocatable: {
      cpu: '4',
      'ephemeral-storage': '50000000Ki',
      'hugepages-1Gi': '0',
      'hugepages-2Mi': '0',
      memory: '8000000Ki',
      pods: '110',
    },
    capacity: {
      cpu: '4',
      'ephemeral-storage': '50000000Ki',
      'hugepages-1Gi': '0',
      'hugepages-2Mi': '0',
      memory: '8000000Ki',
      pods: '110',
    },
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        lastHeartbeatTime: creationTimestamp,
        lastTransitionTime: creationTimestamp,
        reason: 'KubeletReady',
        message: 'kubelet is posting ready status',
      },
    ],
    nodeInfo: {
      architecture: 'amd64',
      bootID: 'boot-id',
      containerRuntimeVersion: 'containerd://1.6.9',
      kernelVersion: '5.15.0',
      kubeProxyVersion: 'v1.25.3',
      kubeletVersion: 'v1.25.3',
      machineID: 'machine-id',
      operatingSystem: 'linux',
      osImage: 'Ubuntu 22.04 LTS',
      systemUUID: 'system-uuid',
    },
  },
};

/**
 * Node metrics matching {@link NODE_DETAILED_DATA}: usage is half of the node's
 * capacity, so the interactive Storybook view renders ~50% CPU/memory usage.
 *
 * Note: the storyshot snapshot shows 0% usage because metric polling resolves
 * after the snapshot is captured (same as the cluster/Overview stories).
 */
export const NODE_METRICS_DATA: KubeMetrics[] = [
  {
    metadata: {
      name: 'node',
      creationTimestamp,
      uid: 'node-metrics-uid',
    },
    usage: {
      cpu: '2',
      memory: '4000000Ki',
    },
    status: {
      capacity: {
        cpu: '4',
        memory: '8000000Ki',
      },
    },
  },
];

export const NODE_DUMMY_DATA: KubeNode[] = [
  {
    kind: 'Node',
    apiVersion: 'v1',
    metadata: {
      name: 'node',
      namespace: 'default',
      creationTimestamp,
      uid: '123',
      labels: {
        'cloud.google.com/gke-nodepool': 'default-pool',
      },
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

/**
 * Node data where no node has a node pool label.
 * Used to verify the "Node Pool" column is hidden when no pool labels exist.
 */
export const NODE_DUMMY_DATA_NO_POOLS: KubeNode[] = NODE_DUMMY_DATA.map(node => ({
  ...node,
  metadata: {
    ...node.metadata,
    labels: Object.fromEntries(
      Object.entries(node.metadata.labels ?? {}).filter(
        ([key]) => !(NODE_POOL_LABEL_KEYS as readonly string[]).includes(key)
      )
    ),
  },
}));
