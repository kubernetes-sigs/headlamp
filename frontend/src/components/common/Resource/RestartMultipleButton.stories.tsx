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
import { TestContext } from '../../../test';
import { RestartableResource } from './RestartButton';
import RestartMultipleButton from './RestartMultipleButton';

export default {
  title: 'Resource/RestartMultipleButton',
  component: RestartMultipleButton,

  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof RestartMultipleButton> = args => <RestartMultipleButton {...args} />;

export const Default = Template.bind({});
Default.args = {
  items: [
    { metadata: { uid: '1', name: 'Resource 1', creationTimestamp: getTestDate().toISOString() } },
    { metadata: { uid: '2', name: 'Resource 2', creationTimestamp: getTestDate().toISOString() } },
  ] as RestartableResource[],
};

export const AfterConfirmCallback = Template.bind({});
AfterConfirmCallback.args = {
  items: [
    { metadata: { uid: '1', name: 'Resource 1', creationTimestamp: getTestDate().toISOString() } },
    { metadata: { uid: '2', name: 'Resource 2', creationTimestamp: getTestDate().toISOString() } },
  ] as RestartableResource[],
  afterConfirm: () => {
    console.log('afterConfirm callback executed!');
  },
};

export const MenuButtonStyle = Template.bind({});
MenuButtonStyle.args = {
  items: [
    { metadata: { uid: '1', name: 'Resource 1', creationTimestamp: getTestDate().toISOString() } },
    { metadata: { uid: '2', name: 'Resource 2', creationTimestamp: getTestDate().toISOString() } },
  ] as RestartableResource[],
  buttonStyle: 'menu',
};
MenuButtonStyle.decorators = [
  Story => (
    <MenuList>
      <Story />
    </MenuList>
  ),
];
