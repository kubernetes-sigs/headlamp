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
import { TestContext } from '../../../test';
import AddCluster from './AddCluster';

export default {
  title: 'App/AddCluster',
  component: AddCluster,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof AddCluster> = args => <AddCluster {...args} />;

export const EmptyFormState = Template.bind({});
EmptyFormState.args = {
  open: true,
  onChoice: () => {},
};

export const FormValidationErrors = Template.bind({});
FormValidationErrors.args = {
  open: true,
  onChoice: () => {},
};

export const ClusterConnectionTestLoading = Template.bind({});
ClusterConnectionTestLoading.args = {
  open: true,
  onChoice: () => {},
};

export const ConnectionTestSuccess = Template.bind({});
ConnectionTestSuccess.args = {
  open: true,
  onChoice: () => {},
};

export const SaveClusterSuccess = Template.bind({});
SaveClusterSuccess.args = {
  open: true,
  onChoice: () => {},
};
