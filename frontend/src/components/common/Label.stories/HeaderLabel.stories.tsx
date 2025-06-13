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
import React from 'react';
import { TestContext } from '../../../test';
import { HeaderLabel, HeaderLabelProps } from '../Label';

export default {
  title: 'Labels/HeaderLabel',
  component: HeaderLabel,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    label: {
      control: 'text',
      description: 'The main label text (typically smaller, above value).',
    },
    value: { control: 'text', description: 'The prominent value text (typically larger).' },
    tooltip: {
      control: 'text',
      description: 'Optional tooltip text to show on hover of the info icon.',
    },
  },
} as Meta<typeof HeaderLabel>;

const Template: StoryFn<HeaderLabelProps> = args => <HeaderLabel {...args} />;

export const Default = Template.bind({});
Default.args = {
  label: 'Uptime',
  value: '25 days',
};
Default.storyName = 'Basic Header Label';

export const WithTooltip = Template.bind({});
WithTooltip.args = {
  label: 'Active Pods',
  value: '120',
  tooltip: 'Number of currently active pods in the cluster.',
};
WithTooltip.storyName = 'With Tooltip';

export const NumericValue = Template.bind({});
NumericValue.args = {
  label: 'CPU Usage',
  value: '75%',
};

export const ShortLabelAndValue = Template.bind({});
ShortLabelAndValue.args = {
  label: 'Nodes',
  value: '5',
};
