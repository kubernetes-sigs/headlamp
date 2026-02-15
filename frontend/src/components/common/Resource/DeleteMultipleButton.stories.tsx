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
import { getTestDate } from '../../../helpers/testHelpers';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { TestContext } from '../../../test';
import { PureDeleteMultipleButton, PureDeleteMultipleButtonProps } from './DeleteMultipleButton';

const createMockPod = (name: string, namespace: string = 'default', cluster: string = 'default') =>
  new KubeObject(
    {
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: {
        name,
        namespace,
        uid: `uid-${name}`,
        creationTimestamp: getTestDate().toISOString(),
      },
    },
    cluster
  );

const createMockDeployment = (
  name: string,
  namespace: string = 'default',
  cluster: string = 'default'
) =>
  new KubeObject(
    {
      kind: 'Deployment',
      apiVersion: 'apps/v1',
      metadata: {
        name,
        namespace,
        uid: `uid-${name}`,
        creationTimestamp: getTestDate().toISOString(),
      },
    },
    cluster
  );

const createMockService = (
  name: string,
  namespace: string = 'default',
  cluster: string = 'default'
) =>
  new KubeObject(
    {
      kind: 'Service',
      apiVersion: 'v1',
      metadata: {
        name,
        namespace,
        uid: `uid-${name}`,
        creationTimestamp: getTestDate().toISOString(),
      },
    },
    cluster
  );

const singlePod = [createMockPod('nginx-pod')];

const multiplePods = [
  createMockPod('nginx-pod-1'),
  createMockPod('nginx-pod-2'),
  createMockPod('redis-pod'),
];

const mixedResources = [
  createMockDeployment('nginx-deployment'),
  createMockService('redis-service'),
  createMockPod('app-pod'),
];

const multiClusterItems = [
  createMockPod('nginx-pod', 'default', 'cluster-1'),
  createMockPod('redis-pod', 'default', 'cluster-2'),
  createMockPod('app-pod', 'kube-system', 'cluster-1'),
];

export default {
  title: 'Resource/DeleteMultipleButton',
  component: PureDeleteMultipleButton,
  argTypes: {
    onToggleOpen: { action: 'toggle open' },
    onConfirm: { action: 'confirm delete' },
  },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<PureDeleteMultipleButtonProps> = args => (
  <PureDeleteMultipleButton {...args} />
);

const defaultArgs = {
  items: multiplePods,
  open: false,
  loading: false,
  error: undefined,
};

// Button disabled with no selection
export const NoSelection = Template.bind({});
NoSelection.args = {
  ...defaultArgs,
  items: [],
};

// Button enabled showing selection count
export const SingleItem = Template.bind({});
SingleItem.args = {
  ...defaultArgs,
  items: singlePod,
};

export const MultipleItems = Template.bind({});
MultipleItems.args = {
  ...defaultArgs,
  items: multiplePods,
};

// Batch delete confirmation dialog
export const ConfirmDialogOpen = Template.bind({});
ConfirmDialogOpen.args = {
  ...defaultArgs,
  open: true,
};

export const ConfirmDialogMixedTypes = Template.bind({});
ConfirmDialogMixedTypes.args = {
  ...defaultArgs,
  items: mixedResources,
  open: true,
};

export const ConfirmDialogMultiCluster = Template.bind({});
ConfirmDialogMultiCluster.args = {
  ...defaultArgs,
  items: multiClusterItems,
  open: true,
};

// Delete progress indicator
export const DeleteProgressIndicator = Template.bind({});
DeleteProgressIndicator.args = {
  ...defaultArgs,
  open: true,
  loading: true,
};
// Error states
export const NetworkError = Template.bind({});
NetworkError.args = {
  ...defaultArgs,
  open: true,
  error: 'Network error: Unable to connect to cluster.',
};

export const PermissionDeniedError = Template.bind({});
PermissionDeniedError.args = {
  ...defaultArgs,
  items: mixedResources,
  open: true,
  error:
    'Permission denied: You do not have permission to delete resources in namespace "default".',
};

// Button style variants
export const ActionButtonStyle = Template.bind({});
ActionButtonStyle.args = {
  ...defaultArgs,
  buttonStyle: 'action',
};

export const MenuButtonStyle = Template.bind({});
MenuButtonStyle.args = {
  ...defaultArgs,
  buttonStyle: 'menu',
};
