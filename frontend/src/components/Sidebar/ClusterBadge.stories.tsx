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
import ClusterBadge, { ClusterBadgeProps } from './ClusterBadge';

export default {
  title: 'Sidebar/ClusterBadge',
  component: ClusterBadge,
  argTypes: {
    name: { control: 'text', description: 'Cluster display name.' },
    accentColor: {
      control: 'color',
      description: 'Accent color for the circular icon border.',
    },
    icon: { control: 'text', description: 'Iconify icon shown inside the circle.' },
  },
} as Meta<typeof ClusterBadge>;

const Template: StoryFn<ClusterBadgeProps> = args => <ClusterBadge {...args} />;

export const Default = Template.bind({});
Default.args = {
  name: 'my-cluster',
};

export const WithIcon = Template.bind({});
WithIcon.args = {
  name: 'my-cluster',
  icon: 'mdi:kubernetes',
};

export const WithAccentColor = Template.bind({});
WithAccentColor.args = {
  name: 'production',
  icon: 'mdi:kubernetes',
  accentColor: '#f44336',
};

export const LongName = Template.bind({});
LongName.args = {
  name: 'a-very-long-cluster-name-that-should-be-truncated-with-an-ellipsis',
  icon: 'mdi:kubernetes',
};
