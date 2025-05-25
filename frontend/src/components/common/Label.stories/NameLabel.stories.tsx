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
import { NameLabel } from '../Label';

interface NameLabelStoryProps {
  children: React.ReactNode;
}

export default {
  title: 'Labels/NameLabel',
  component: NameLabel,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    children: { control: 'text', description: 'The text content of the NameLabel.' },
  },
} as Meta<typeof NameLabel>;

const Template: StoryFn<NameLabelStoryProps> = args => <NameLabel {...args} />;

export const Default = Template.bind({});
Default.args = {
  children: 'Label Name',
};
Default.storyName = 'Basic NameLabel';

export const LongText = Template.bind({});
LongText.args = {
  children:
    'This is a much longer label name to demonstrate text wrapping or truncation behavior inherent to the component or its typical usage context, if any specific styling is applied by default.',
};
LongText.storyName = 'Long NameLabel Text';
