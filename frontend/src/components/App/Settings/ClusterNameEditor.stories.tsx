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

import { Meta, StoryObj } from '@storybook/react';
import { ClusterNameEditor } from './ClusterNameEditor';

const meta: Meta<typeof ClusterNameEditor> = {
  title: 'Settings/ClusterNameEditor',
  component: ClusterNameEditor,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ClusterNameEditor>;

export const Default: Story = {
  args: {
    cluster: 'my-cluster',
    newClusterName: '',
    setNewClusterName: () => {},
    setClusterErrorDialogOpen: () => {},
    handleUpdateClusterName: () => {},
  },
};

export const WithInvalidName: Story = {
  args: {
    ...Default.args,
    newClusterName: 'Invalid Cluster Name',
  },
};

export const WithNewName: Story = {
  args: {
    ...Default.args,
    newClusterName: 'new-cluster-name',
  },
};
