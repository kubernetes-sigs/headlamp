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
import Tabs, { TabsProps } from './Tabs';

export default {
  title: 'Tabs',
  component: Tabs,
  argTypes: { onTabChanged: { action: 'tab changed' } },
} as Meta;

const Template: StoryFn<TabsProps> = args => <Tabs {...args} />;

export const BasicTabs = Template.bind({});
BasicTabs.args = {
  tabs: [
    {
      label: 'tab 1 label',
      component: <p>tab body 1</p>,
    },
    {
      label: 'tab 2 label',
      component: <p>tab body 2</p>,
    },
  ],
  ariaLabel: 'Basic Tabs',
};

export const StartingTab = Template.bind({});
StartingTab.args = {
  defaultIndex: 1,
  tabs: [
    {
      label: 'tab 1 label',
      component: <p>tab body 1</p>,
    },
    {
      label: 'tab 2 label',
      component: <p>We start on the second tab using defaultIndex=1</p>,
    },
  ],
  ariaLabel: 'Starting Tabs',
};
