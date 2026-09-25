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

import MenuList from '@mui/material/MenuList';
import { Meta, StoryFn } from '@storybook/react';
import { getTestDate } from '../../../helpers/testHelpers';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { TestContext } from '../../../test';
import EditMetadataMultipleButton from './EditMetadataMultipleButton';

export default {
  title: 'Resource/EditMetadataMultipleButton',
  component: EditMetadataMultipleButton,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof EditMetadataMultipleButton> = args => (
  <EditMetadataMultipleButton {...args} />
);

function createMockItem(
  uid: string,
  name: string,
  labels: Record<string, string> = {},
  annotations: Record<string, string> = {}
): KubeObject {
  return {
    metadata: {
      uid,
      name,
      namespace: 'default',
      creationTimestamp: getTestDate().toISOString(),
      labels,
      annotations,
    },
    kind: 'Deployment',
    patch: async () => undefined,
    getAuthorization: async () => ({ status: { allowed: true, reason: '' } }),
  } as unknown as KubeObject;
}

const mockItems = [
  createMockItem(
    '1',
    'deployment-alpha',
    { app: 'frontend', environment: 'staging' },
    { 'prometheus.io/scrape': 'true' }
  ),
  createMockItem(
    '2',
    'deployment-beta',
    { app: 'backend', environment: 'staging' },
    { 'prometheus.io/scrape': 'true', 'prometheus.io/port': '8080' }
  ),
];

export const Default = Template.bind({});
Default.args = {
  items: mockItems,
};

export const AfterConfirmCallback = Template.bind({});
AfterConfirmCallback.args = {
  items: mockItems,
  afterConfirm: () => {
    console.log('afterConfirm callback executed!');
  },
};

export const MenuButtonStyle = Template.bind({});
MenuButtonStyle.args = {
  items: mockItems,
  buttonStyle: 'menu',
};
MenuButtonStyle.decorators = [
  Story => (
    <MenuList>
      <Story />
    </MenuList>
  ),
];

export const SingleItem = Template.bind({});
SingleItem.args = {
  items: [mockItems[0]],
};

/** Items with no existing labels or annotations — only the "add" section is shown. */
export const NoExistingMetadata = Template.bind({});
NoExistingMetadata.args = {
  items: [createMockItem('3', 'deployment-gamma'), createMockItem('4', 'deployment-delta')],
};

/** Items with differing labels so the remove section shows partial-coverage counts. */
export const MixedMetadata = Template.bind({});
MixedMetadata.args = {
  items: [
    createMockItem('5', 'deployment-epsilon', { app: 'web', tier: 'frontend' }),
    createMockItem('6', 'deployment-zeta', { app: 'api' }),
    createMockItem('7', 'deployment-eta', { app: 'worker', version: 'v2' }),
  ],
};

function createDeniedItem(uid: string, name: string): KubeObject {
  return {
    metadata: {
      uid,
      name,
      namespace: 'default',
      creationTimestamp: getTestDate().toISOString(),
    },
    kind: 'Deployment',
    patch: async () => undefined,
    getAuthorization: async () => ({ status: { allowed: false, reason: 'Forbidden' } }),
  } as unknown as KubeObject;
}

/** All items are unauthorized — renders the disabled button with tooltip. */
export const NoPermission = Template.bind({});
NoPermission.args = {
  items: [createDeniedItem('8', 'deployment-theta'), createDeniedItem('9', 'deployment-iota')],
};
