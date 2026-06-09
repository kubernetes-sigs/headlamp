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

import Box from '@mui/material/Box';
import { Meta, StoryFn } from '@storybook/react';
import { KubeMetrics } from '../../../lib/k8s/cluster';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { parseCpu, TO_ONE_CPU } from '../../../lib/units';
import { TestContext } from '../../../test';
import { CircularChart, CircularChartProps } from './CircularChart';

function makeNode(name: string, cpu: string): Node {
  return new Node({
    kind: 'Node',
    apiVersion: 'v1',
    metadata: {
      name,
      uid: `node-${name}`,
      creationTimestamp: '2023-01-01T00:00:00Z',
    },
    status: {
      capacity: { cpu, memory: '16Gi' },
    },
    spec: {
      podCIDR: '10.0.0.0/24',
      taints: [],
    },
  });
}

function makeMetric(name: string, cpu: string): KubeMetrics {
  return {
    metadata: {
      name,
      uid: `metric-${name}`,
      creationTimestamp: '2023-01-01T00:00:00Z',
    },
    usage: { cpu, memory: '4Gi' },
    status: { capacity: { cpu: '4', memory: '16Gi' } },
  };
}

const nodes = [makeNode('node-1', '4'), makeNode('node-2', '4'), makeNode('node-3', '8')];

const metrics = [
  makeMetric('node-1', '1200m'),
  makeMetric('node-2', '2600m'),
  makeMetric('node-3', '3100m'),
];

const cpuUsedGetter = (item: KubeMetrics) => parseCpu(item.usage.cpu) / TO_ONE_CPU;
const cpuAvailableGetter = (item: Node | Pod) =>
  parseCpu(item.status?.capacity?.cpu ?? '0') / TO_ONE_CPU;
const cpuLegend = (used: number, available: number) =>
  used < 0 || available < 0 ? '…' : `${used.toFixed(1)} / ${available} cores`;

export default {
  title: 'Resource/CircularChart',
  component: CircularChart,
  decorators: [
    Story => (
      <TestContext>
        <Box sx={{ p: 2, width: 260 }}>
          <Story />
        </Box>
      </TestContext>
    ),
  ],
  argTypes: {
    noMetrics: {
      control: 'boolean',
      description: 'Show the "install metrics-server" message instead of a chart.',
    },
  },
} as Meta;

const Template: StoryFn<CircularChartProps> = args => <CircularChart {...args} />;

export const Basic = Template.bind({});
Basic.args = {
  title: 'CPU usage',
  items: nodes,
  itemsMetrics: metrics,
  resourceUsedGetter: cpuUsedGetter,
  resourceAvailableGetter: cpuAvailableGetter,
  getLegend: cpuLegend,
};
Basic.storyName = 'Basic (CPU across nodes)';

export const HighUtilization = Template.bind({});
HighUtilization.args = {
  title: 'CPU usage',
  items: nodes,
  itemsMetrics: [
    makeMetric('node-1', '3800m'),
    makeMetric('node-2', '3900m'),
    makeMetric('node-3', '7600m'),
  ],
  resourceUsedGetter: cpuUsedGetter,
  resourceAvailableGetter: cpuAvailableGetter,
  getLegend: cpuLegend,
};
HighUtilization.storyName = 'High utilization';

export const Loading = Template.bind({});
Loading.args = {
  title: 'CPU usage',
  items: null,
  itemsMetrics: null,
  resourceUsedGetter: cpuUsedGetter,
  resourceAvailableGetter: cpuAvailableGetter,
  getLegend: cpuLegend,
};
Loading.storyName = 'Loading (items not yet available)';

export const NoMetrics = Template.bind({});
NoMetrics.args = {
  title: 'CPU usage',
  items: nodes,
  itemsMetrics: null,
  noMetrics: true,
  resourceUsedGetter: cpuUsedGetter,
  resourceAvailableGetter: cpuAvailableGetter,
  getLegend: cpuLegend,
};
NoMetrics.storyName = 'No metrics (metrics-server missing)';

export const PartialMetrics = Template.bind({});
PartialMetrics.args = {
  title: 'CPU usage',
  items: nodes,
  itemsMetrics: [makeMetric('node-1', '1200m')],
  resourceUsedGetter: cpuUsedGetter,
  resourceAvailableGetter: cpuAvailableGetter,
  getLegend: cpuLegend,
};
PartialMetrics.storyName = 'Partial metrics';
