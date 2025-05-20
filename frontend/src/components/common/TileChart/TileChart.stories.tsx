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

import '../../../i18n/config';
import { Meta, StoryFn } from '@storybook/react';
import TileChart, { TileChartProps } from './TileChart';

export default {
  title: 'Charts/TileChart',
  component: TileChart,
  argTypes: {},
} as Meta;

const Template: StoryFn<TileChartProps> = args => <TileChart {...args} />;

export const WithProgress = Template.bind({});
WithProgress.args = {
  data: [
    {
      name: 'progress',
      value: 10,
    },
    {
      name: 'remaining',
      value: 90,
      fill: '#ff0',
    },
  ],
  total: 100,
  title: 'My chart',
  legend: 'Progress so far',
  label: '10%',
};

export const WithoutProgress = Template.bind({});
WithoutProgress.args = {
  title: 'My chart',
  legend: 'Progress so far',
  infoTooltip: 'This is a tooltip',
};
