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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../test';
import { AppLogo, AppLogoProps } from './AppLogo';

const getMockState = (themeName: 'light' | 'dark' = 'light', loaded = true, logo: any = null) => ({
  plugins: { loaded },
  theme: {
    logo,
    name: themeName,
    palette: {
      navbar: {
        background: '#fff',
      },
    },
  },
});

export default {
  title: 'App/AppLogo',
  component: AppLogo,
  argTypes: {
    logoType: {
      control: { type: 'radio' },
      options: ['small', 'large'],
    },
    themeName: {
      control: { type: 'radio' },
      options: ['light', 'dark'],
    },
  },
} as Meta<typeof AppLogo>;

const Template: StoryFn<AppLogoProps> = args => {
  const themeName = args.themeName === 'dark' ? 'dark' : 'light';
  const store = configureStore({
    reducer: (state = getMockState(themeName)) => state,
    preloadedState: getMockState(themeName),
  });

  return (
    <TestContext store={store}>
      <AppLogo {...args} />
    </TestContext>
  );
};

export const LargeLight = Template.bind({});
LargeLight.args = {
  logoType: 'large',
  themeName: 'light',
};

export const LargeDark = Template.bind({});
LargeDark.args = {
  logoType: 'large',
  themeName: 'dark',
};

export const SmallLight = Template.bind({});
SmallLight.args = {
  logoType: 'small',
  themeName: 'light',
};

export const SmallDark = Template.bind({});
SmallDark.args = {
  logoType: 'small',
  themeName: 'dark',
};
