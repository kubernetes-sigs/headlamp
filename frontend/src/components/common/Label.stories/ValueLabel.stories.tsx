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
import { ValueLabel } from '../Label';

interface ValueLabelStoryProps {
  children: React.ReactNode;
}

export default {
  title: 'Labels/ValueLabel',
  component: ValueLabel,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    children: { control: 'text', description: 'The text content of the ValueLabel.' },
  },
} as Meta<typeof ValueLabel>;

const Template: StoryFn<ValueLabelStoryProps> = args => <ValueLabel {...args} />;

export const Default = Template.bind({});
Default.args = {
  children: 'Actual Value',
};
Default.storyName = 'Basic ValueLabel';

export const LongText = Template.bind({});
LongText.args = {
  children:
    'This is a very long value string to observe how it behaves with word breaks and potential wrapping within its container, especially focusing on the `wordBreak: break-word` style.',
};
LongText.storyName = 'Long ValueLabel Text';
