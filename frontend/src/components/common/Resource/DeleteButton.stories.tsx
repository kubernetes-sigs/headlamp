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
import DeleteButton from './DeleteButton';

export default {
  title: 'Resource/DeleteButton',
  component: DeleteButton,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const createMockItem = (name: string, namespace: string = 'default', kind: string = 'ConfigMap') =>
  ({
    metadata: {
      uid: `uid-${name}`,
      name,
      namespace,
      creationTimestamp: getTestDate().toISOString(),
    },
    kind,
    getAuthorization: async () => ({ status: { allowed: true, reason: '' } }),
    delete: async () => undefined,
    evict: async () => undefined,
    getListLink: () => `/${kind.toLowerCase()}s`,
    _class: () => ({ apiName: kind.toLowerCase() + 's', apiVersion: 'v1' }),
  } as unknown as KubeObject);

const Template: StoryFn<typeof DeleteButton> = args => <DeleteButton {...args} />;

export const Default = Template.bind({});
Default.args = {
  item: createMockItem('my-configmap'),
};

export const WithAfterConfirmCallback = Template.bind({});
WithAfterConfirmCallback.args = {
  item: createMockItem('my-configmap'),
  afterConfirm: () => {},
};

export const MenuButtonStyle = Template.bind({});
MenuButtonStyle.args = {
  item: createMockItem('my-configmap'),
  buttonStyle: 'menu',
};
MenuButtonStyle.decorators = [
  Story => (
    <MenuList>
      <Story />
    </MenuList>
  ),
];

export const PodEvict = Template.bind({});
PodEvict.args = {
  item: createMockItem('my-pod', 'default', 'Pod'),
};
PodEvict.parameters = {
  docs: {
    description: {
      story:
        'When the item is a Pod, demonstrates the Pod-specific delete path. The button shows "Evict" instead of "Delete" when the useEvict cluster setting is enabled.',
    },
  },
};

export const NoItem = Template.bind({});
NoItem.args = {
  item: undefined,
};
NoItem.parameters = {
  docs: {
    description: {
      story: 'When no item is provided, the button renders nothing.',
    },
  },
};
