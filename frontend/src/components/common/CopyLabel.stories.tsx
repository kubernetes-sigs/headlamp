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
import { TestContext } from '../../test';
import CopyLabel, { CopyLabelProps } from './CopyLabel';

export default {
  title: 'CopyLabel',
  component: CopyLabel,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CopyLabelProps> = args => <CopyLabel {...args} />;

export const Default = Template.bind({});
Default.args = {
  textToCopy: '192.168.1.1',
  children: '192.168.1.1',
};

export const WithDifferentContent = Template.bind({});
WithDifferentContent.args = {
  textToCopy: 'my-pod-12345',
  children: 'my-pod (copy name)',
};
