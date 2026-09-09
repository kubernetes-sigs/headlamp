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
import Node from '../../lib/k8s/node';
import { TestContext } from '../../test';
import { UsageBarChart } from './Charts';
import { NODE_DETAILED_DATA, NODE_METRICS_DATA } from './storyHelper';

const node = new Node(NODE_DETAILED_DATA);

export default {
  title: 'node/Charts',
  component: UsageBarChart,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof UsageBarChart> = args => <UsageBarChart {...args} />;

export const CpuUsage = Template.bind({});
CpuUsage.args = {
  node,
  nodeMetrics: NODE_METRICS_DATA,
  resourceType: 'cpu',
};

export const MemoryUsage = Template.bind({});
MemoryUsage.args = {
  node,
  nodeMetrics: NODE_METRICS_DATA,
  resourceType: 'memory',
};

export const NoMetrics = Template.bind({});
NoMetrics.args = {
  node,
  nodeMetrics: null,
  resourceType: 'cpu',
  noMetrics: true,
};
