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
import { KubeMetrics } from '../../../lib/k8s/cluster';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { CircularChartProps } from '../../common/Resource/CircularChart';
import { CpuCircularChart, MemoryCircularChart } from './ResourceCharts';

interface ResourceCircularChartProps {
  chart_props: CircularChartProps;
  resource: 'memory' | 'cpu';
}

const Template1: StoryFn<ResourceCircularChartProps> = (args: ResourceCircularChartProps) => {
  if (args.resource === 'memory') {
    return <MemoryCircularChart {...args.chart_props} />;
  } else {
    return <CpuCircularChart {...args.chart_props} />;
  }
};

const meta: Meta = {
  title: 'Cluster/ResourceCharts',
  component: Template1,
  decorators: [Story => <Story />],
};

export default meta;

// Base objects for mock data
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
      cpu: '2', // 2 CPU cores
      memory: '8Gi', // 8GB memory
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

// Mock data
const mockNode = new Node({
  ...baseNodeData,
  metadata: {
    ...baseNodeData.metadata,
    name: 'node-1',
  },
});

const mockNodeMetrics: KubeMetrics = {
  metadata: {
    name: 'node-1',
    uid: '1',
    resourceVersion: '1',
    creationTimestamp: '2021-01-01T00:00:00Z',
    namespace: 'default',
  },
  usage: {
    cpu: '500m', // 0.5 CPU
    memory: '2Gi', // 2GB memory
  },
  status: {
    capacity: {
      cpu: '2',
      memory: '8Gi',
    },
  },
};

const mockPod = new Pod({
  ...basePodData,
  metadata: {
    ...basePodData.metadata,
    name: 'pod-1',
  },
});

const mockPodMetrics: KubeMetrics = {
  metadata: {
    name: 'pod-1',
    uid: '1',
    resourceVersion: '1',
    creationTimestamp: '2021-01-01T00:00:00Z',
    namespace: 'default',
  },
  usage: {
    cpu: '200m', // 0.2 CPU
    memory: '500Mi', // 500MB memory
  },
  status: {
    capacity: {
      cpu: '1',
      memory: '1Gi',
    },
  },
};

// Memory Chart Stories
export const MemoryChartWithMetrics = Template1.bind({});
MemoryChartWithMetrics.args = {
  chart_props: {
    items: [mockNode],
    itemsMetrics: [mockNodeMetrics],
    noMetrics: false,
  },
  resource: 'memory',
};

export const MemoryChartNoMetrics = Template1.bind({});
MemoryChartNoMetrics.args = {
  chart_props: {
    items: [mockNode],
    itemsMetrics: null,
    noMetrics: true,
  },
  resource: 'memory',
};

export const MemoryChartPod = Template1.bind({});
MemoryChartPod.args = {
  chart_props: {
    items: [mockPod],
    itemsMetrics: [mockPodMetrics],
    noMetrics: false,
  },
  resource: 'memory',
};

// CPU Chart Stories
export const CpuChartWithMetrics = Template1.bind({});
CpuChartWithMetrics.args = {
  chart_props: {
    items: [mockNode],
    itemsMetrics: [mockNodeMetrics],
    noMetrics: false,
  },
  resource: 'cpu',
};

export const CpuChartNoMetrics = Template1.bind({});
CpuChartNoMetrics.args = {
  chart_props: {
    items: [mockNode],
    itemsMetrics: null,
    noMetrics: true,
  },
  resource: 'cpu',
};

export const CpuChartPod = Template1.bind({});
CpuChartPod.args = {
  chart_props: {
    items: [mockPod],
    itemsMetrics: [mockPodMetrics],
    noMetrics: false,
  },
  resource: 'cpu',
};
