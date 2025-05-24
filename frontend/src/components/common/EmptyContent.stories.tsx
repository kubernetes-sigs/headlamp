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
import EmptyContent from './EmptyContent';

// ... existing code ...
export default {
  title: 'Common/EmptyContent',
  component: EmptyContent,
  argTypes: {
    color: {
      control: 'select',
      options: ['textPrimary', 'textSecondary', 'error', 'warning', 'info', 'success'],
    },
  },
} as Meta;

const Template: StoryFn<typeof EmptyContent> = args => <EmptyContent {...args} />;

export const Default = Template.bind({});
Default.args = {
  children: 'No data to be shown.',
};

export const WithCustomColor = Template.bind({});
WithCustomColor.args = {
  children: 'No data to be shown.',
  color: 'error',
};

export const WithMultipleChildren = Template.bind({});
WithMultipleChildren.args = {
  children: ['No data to be shown.', <div key="custom-element">Custom element</div>],
};

export const Empty = Template.bind({});
Empty.args = {
  children: '',
};
