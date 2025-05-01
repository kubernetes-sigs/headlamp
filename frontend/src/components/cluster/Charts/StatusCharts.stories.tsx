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

import { Meta, StoryFn } from '@storybook/react';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { NodesStatusCircleChart, PodsStatusCircleChart } from './StatusCharts';

const meta: Meta = {
  title: 'Cluster/StatusCharts',
  decorators: [Story => <Story />],
};

export default meta;

// Base objects for mock data
const basePodData = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    uid: '1',
    resourceVersion: '1',
    creationTimestamp: '2021-01-01T00:00:00Z',
    namespace: 'default',
  },
  spec: {
    containers: [],
    nodeName: 'node-1',
  },
  status: {
    phase: 'Running',
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        lastTransitionTime: '2021-01-01T00:00:00Z',
        lastProbeTime: '2021-01-01T00:00:00Z',
        message: 'Pod is ready',
        reason: 'PodReady',
      },
    ],
    containerStatuses: [],
    startTime: '2021-01-01T00:00:00Z',
  },
};

const baseNodeData = {
  kind: 'Node',
  apiVersion: 'v1',
  metadata: {
    uid: '1',
    resourceVersion: '1',
    creationTimestamp: '2021-01-01T00:00:00Z',
    namespace: 'default',
  },
  spec: {
    podCIDR: '10.244.0.0/24',
    taints: [],
  },
  status: {
    capacity: {
      cpu: '2',
      memory: '8Gi',
      ephemeralStorage: '100Gi',
      hugepages_1Gi: '0',
      hugepages_2Mi: '0',
      pods: '110',
    },
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        lastHeartbeatTime: '2021-01-01T00:00:00Z',
        lastTransitionTime: '2021-01-01T00:00:00Z',
        message: 'Node is ready',
        reason: 'KubeletReady',
      },
    ],
  },
};

// Pod Stories
type PodStatusProps = { items: Pod[] | null };
const PodTemplate: StoryFn<PodStatusProps> = args => <PodsStatusCircleChart {...args} />;

export const PodsStatusWithMixedStates = PodTemplate.bind({});
PodsStatusWithMixedStates.args = {
  items: [
    new Pod({
      ...basePodData,
      metadata: {
        ...basePodData.metadata,
        name: 'pod-1',
      },
    }),
    new Pod({
      ...basePodData,
      metadata: {
        ...basePodData.metadata,
        name: 'pod-2',
        uid: '2',
      },
      status: {
        ...basePodData.status,
        conditions: [
          {
            type: 'Ready',
            status: 'False',
            lastTransitionTime: '2021-01-01T00:00:00Z',
            lastProbeTime: '2021-01-01T00:00:00Z',
            message: 'Pod is not ready',
            reason: 'PodNotReady',
          },
        ],
      },
    }),
    new Pod({
      ...basePodData,
      metadata: {
        ...basePodData.metadata,
        name: 'pod-3',
        uid: '3',
      },
      status: {
        ...basePodData.status,
        phase: 'Succeeded',
        conditions: [
          {
            type: 'Ready',
            status: 'True',
            lastTransitionTime: '2021-01-01T00:00:00Z',
            lastProbeTime: '2021-01-01T00:00:00Z',
            message: 'Pod completed successfully',
            reason: 'PodSucceeded',
          },
        ],
      },
    }),
  ],
};

export const PodsStatusEmpty = PodTemplate.bind({});
PodsStatusEmpty.args = {
  items: [],
};

export const PodsStatusLoading = PodTemplate.bind({});
PodsStatusLoading.args = {
  items: null,
};

// Node Stories
type NodeStatusProps = { items: Node[] | null };
const NodeTemplate: StoryFn<NodeStatusProps> = args => <NodesStatusCircleChart {...args} />;

export const NodesStatusWithMixedStates = NodeTemplate.bind({});
NodesStatusWithMixedStates.args = {
  items: [
    new Node({
      ...baseNodeData,
      metadata: {
        ...baseNodeData.metadata,
        name: 'node-1',
      },
    }),
    new Node({
      ...baseNodeData,
      metadata: {
        ...baseNodeData.metadata,
        name: 'node-2',
        uid: '2',
      },
      status: {
        ...baseNodeData.status,
        conditions: [
          {
            type: 'Ready',
            status: 'False',
            lastHeartbeatTime: '2021-01-01T00:00:00Z',
            lastTransitionTime: '2021-01-01T00:00:00Z',
            message: 'Node is not ready',
            reason: 'KubeletNotReady',
          },
        ],
      },
    }),
    new Node({
      ...baseNodeData,
      metadata: {
        ...baseNodeData.metadata,
        name: 'node-3',
        uid: '3',
      },
    }),
  ],
};

export const NodesStatusEmpty = NodeTemplate.bind({});
NodesStatusEmpty.args = {
  items: [],
};

export const NodesStatusLoading = NodeTemplate.bind({});
NodesStatusLoading.args = {
  items: null,
};
