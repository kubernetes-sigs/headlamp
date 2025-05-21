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
import NameValueTable, { NameValueTableProps } from './NameValueTable';

export default {
  title: 'NameValueTable',
  component: NameValueTable,
  argTypes: { onTabChanged: { action: 'tab changed' } },
} as Meta;

const Template: StoryFn<NameValueTableProps> = args => <NameValueTable {...args} />;

export const WithChildren = Template.bind({});
WithChildren.args = {
  rows: [
    {
      name: 'MyName0',
      value: 'MyValue0',
    },
    {
      name: 'MyName1',
      value: 'MyValue1',
    },
    {
      name: 'MyName2',
      value: 'MyValue2',
    },
  ],
};

export const Empty = Template.bind({});
Empty.args = {
  rows: [],
};

// Hidden name/values that were the last children were causing the table to have a bottom border.
export const WithHiddenLastChildren = Template.bind({});
WithHiddenLastChildren.args = {
  rows: [
    {
      name: 'MyName0',
      value: 'MyValue0',
    },
    {
      name: 'MyName1',
      value: 'MyValue1',
    },
    {
      name: 'MyName2',
      value: 'MyValue2',
      hide: value => !!value,
    },
    {
      name: 'MyName2',
      value: 'MyValue2',
      hide: true,
    },
  ],
};
