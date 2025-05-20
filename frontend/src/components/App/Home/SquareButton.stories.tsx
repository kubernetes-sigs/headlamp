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
import SquareButton, { SquareButtonProps } from './SquareButton';

export default {
  title: 'common/SquareButton',
  component: SquareButton,
  argTypes: {},
} as Meta;

const Template: StoryFn<SquareButtonProps> = args => <SquareButton {...args} />;

export const Basic = Template.bind({});
Basic.args = {
  icon: 'mdi:pencil',
  label: 'Some label',
};

export const DifferentIconSize = Template.bind({});
DifferentIconSize.args = {
  icon: 'mdi:pencil',
  label: 'Some label',
  iconSize: 100,
};

export const DifferentIconColor = Template.bind({});
DifferentIconColor.args = {
  icon: 'mdi:pencil',
  label: 'Some label',
  iconColor: 'red',
};

export const Primary = Template.bind({});
Primary.args = {
  icon: 'mdi:pencil',
  label: 'Some label',
  primary: true,
};
