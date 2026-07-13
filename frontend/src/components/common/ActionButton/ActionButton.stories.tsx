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
import ActionButton, { ActionButtonProps } from './ActionButton';

export default {
  title: 'common/ActionButton',
  component: ActionButton,
  argTypes: {},
} as Meta;

const Template: StoryFn<ActionButtonProps> = args => <ActionButton {...args} />;

export const Basic = Template.bind({});
Basic.args = {
  description: 'Some label',
  icon: 'mdi:pencil',
};

export const LargeAndColorful = Template.bind({});
LargeAndColorful.args = {
  description: 'Some label',
  icon: 'mdi:pencil',
  width: '95',
  color: '#FF0000',
};

export const LongDescription = Template.bind({});
LongDescription.args = {
  description: 'Some label',
  longDescription: 'Although this is Some label, there is more to it than meets the eye.',
  icon: 'mdi:pencil',
};
