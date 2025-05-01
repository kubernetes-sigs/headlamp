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
import { PercentageBar, PercentageBarProps } from '../Chart';

export default {
  title: 'Charts/PercentageBar',
  component: PercentageBar,
  argTypes: {},
} as Meta;

const Template: StoryFn<PercentageBarProps> = args => <PercentageBar {...args} />;

export const Percent100 = Template.bind({});
Percent100.args = {
  data: [
    { name: 'ready', value: 9 },
    { name: 'notReady', value: 0, fill: '#f44336' },
  ],
  total: 9,
};

export const Percent50 = Template.bind({});
Percent50.args = {
  data: [
    { name: 'ready', value: 5 },
    { name: 'notReady', value: 5, fill: '#f44336' },
  ],
  total: 10,
};

export const NoData = Template.bind({});
NoData.args = {
  data: [],
  total: -1,
};

export const Tooltip = Template.bind({});
Tooltip.args = {
  data: [
    { name: 'ready', value: 5 },
    { name: 'notReady', value: 5, fill: '#f44336' },
  ],
  total: 10,
  tooltipFunc: () => <p>here is the tooltip</p>,
};
