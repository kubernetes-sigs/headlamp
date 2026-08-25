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
import { TestContext } from '../../test';
import ClusterPreparingDialog, { ClusterPreparingDialogProps } from './ClusterPreparingDialog';

export default {
  title: 'App/ClusterPreparingDialog',
  component: ClusterPreparingDialog,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    cluster: { control: 'text' },
    message: { control: 'text' },
  },
} satisfies Meta<typeof ClusterPreparingDialog>;

const Template: StoryFn<ClusterPreparingDialogProps> = args => <ClusterPreparingDialog {...args} />;

export const WithProgressMessage = Template.bind({});
WithProgressMessage.args = {
  cluster: 'edge-cluster-1',
  message: 'Starting AKS Hybrid & Edge proxy…',
};
WithProgressMessage.storyName = 'With Progress Message';

export const DefaultMessage = Template.bind({});
DefaultMessage.args = {
  // No message reported yet — falls back to the generic "Preparing cluster…".
  cluster: 'edge-cluster-1',
};
DefaultMessage.storyName = 'Default (No Progress Message)';
