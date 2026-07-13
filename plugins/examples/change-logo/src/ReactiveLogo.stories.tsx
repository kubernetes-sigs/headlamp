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

import { AppLogoProps } from '@kinvolk/headlamp-plugin/lib';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ReactiveLogo } from './index';

export default {
  title: 'ReactiveLogo',
  component: ReactiveLogo,
  decorators: [
    Story => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} as Meta;

const Template: StoryFn<AppLogoProps> = args => <ReactiveLogo {...args} />;

export const SmallDark = Template.bind({});
SmallDark.args = {
  logoType: 'small',
  themeName: 'dark',
};

export const SmallLight = Template.bind({});
SmallLight.args = {
  logoType: 'small',
  themeName: 'light',
};

export const LargeDark = Template.bind({});
LargeDark.args = {
  logoType: 'large',
  themeName: 'dark',
};

export const LargeLight = Template.bind({});
LargeLight.args = {
  logoType: 'large',
  themeName: 'light',
};
