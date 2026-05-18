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
import React from 'react';
import { createStore } from 'redux';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import Link, { LinkProps } from './Link';

const store = createStore(reducers);

export default {
  title: 'Link',
  component: Link,
  decorators: [
    Story => (
      <TestContext store={store}>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<LinkProps> = args => <Link {...args}>a link</Link>;

// @todo: the Link depends on some router.tsx global functions
//        that would require mocking at the webpack layer.

export const Basic = Template.bind({});
Basic.args = {
  routeName: 'namespaces',
  params: {},
  search: '',
  state: {},
};

export const Params = Template.bind({});
Params.args = {
  routeName: 'node',
  params: { name: 'anode' },
};

export const AutoTooltip = Template.bind({});
AutoTooltip.args = {
  routeName: 'node',
  params: { name: 'anode' },
  tooltip: true,
};

export const ExplicitTooltip = Template.bind({});
ExplicitTooltip.args = {
  routeName: 'node',
  params: { name: 'anode' },
  tooltip: 'A tooltip',
};
