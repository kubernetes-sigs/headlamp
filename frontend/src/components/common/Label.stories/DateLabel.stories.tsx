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
import { DateLabel as DateLabelComponent, DateLabelProps } from '../Label';

export default {
  title: 'Label/DateLabel',
  component: DateLabelComponent,
  argTypes: {},
} as Meta;

const Template: StoryFn<DateLabelProps> = args => <DateLabelComponent {...args} />;

const fixedDate = new Date('2021-01-01T00:00:00Z');

export const Default = Template.bind({});
Default.args = {
  date: fixedDate,
};

export const MiniLabel = Template.bind({});
MiniLabel.args = {
  date: fixedDate,
  format: 'mini',
};
