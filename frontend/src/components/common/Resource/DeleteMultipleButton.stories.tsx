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
import DeleteMultipleButton from './DeleteMultipleButton';

export default {
  title: 'common/Resource/DeleteMultipleButton',
  component: DeleteMultipleButton,
  parameters: {
    docs: {
      description: {
        component: 'A button component for deleting multiple Kubernetes resources at once.',
      },
    },
  },
} as Meta;

const Template: StoryFn = args => (
  <TestContext>
    <DeleteMultipleButton {...args} />
  </TestContext>
);

// Button enabled with items selected
export const WithSelection = Template.bind({});
WithSelection.storyName = 'Button enabled showing selection count';
WithSelection.args = {
  items: [
    {
      kind: 'Pod',
      cluster: 'cluster1',
      metadata: { name: 'pod-1', uid: 'uid-1' },
      delete: () => Promise.resolve(),
    },
    {
      kind: 'Pod',
      cluster: 'cluster1',
      metadata: { name: 'pod-2', uid: 'uid-2' },
      delete: () => Promise.resolve(),
    },
  ],
};

// Button disabled with no selection
export const NoSelection = Template.bind({});
NoSelection.storyName = 'Button disabled with no selection';
NoSelection.args = {
  items: [],
};

// Batch delete confirmation dialog
export const WithConfirmDialog = Template.bind({});
WithConfirmDialog.storyName = 'Batch delete confirmation dialog';
WithConfirmDialog.args = {
  items: [
    {
      kind: 'Deployment',
      cluster: 'cluster1',
      metadata: { name: 'my-deployment', uid: 'uid-3' },
      delete: () => Promise.resolve(),
    },
  ],
};
