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

import { Box } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { AppLogo, AppLogoProps } from './AppLogo';
import OriginalAppLogo from './AppLogo';
import { darkTheme, initialState as themeInitialState, lightTheme } from './themeSlice';

// Mocking the Redux store parts that AppLogo might interact with indirectly (theme selection)
const mockStore = (themeName: string = 'light') => {
  const clonedThemeInitialState = JSON.parse(JSON.stringify(themeInitialState));
  return configureStore({
    reducer: {
      theme: (
        state = { ...clonedThemeInitialState, name: themeName, logo: null },
        action: { type: string; payload?: any }
      ) => {
        if (action.type === 'theme/setTheme') return { ...state, name: action.payload };
        return state;
      },
      plugins: (state = { loaded: true }) => state,
    },
  });
};

export default {
  title: 'App/AppLogo',
  component: AppLogo,
  decorators: [
    (Story, context) => {
      const currentThemeName = context.globals.backgrounds?.value === '#1f1f1f' ? 'dark' : 'light';
      const currentHeadlampTheme = currentThemeName === 'dark' ? darkTheme : lightTheme;
      const muiStoryTheme = createMuiTheme(currentHeadlampTheme);

      return (
        <Provider store={mockStore(currentThemeName)}>
          <ThemeProvider theme={muiStoryTheme}>
            <TestContext store={mockStore(currentThemeName)}>
              {' '}
              {/* TestContext also provides a router context if needed */}
              <Box sx={{ padding: 2, backgroundColor: muiStoryTheme.palette.background.default }}>
                <Story />
              </Box>
            </TestContext>
          </ThemeProvider>
        </Provider>
      );
    },
  ],
  argTypes: {
    logoType: {
      control: 'select',
      options: ['small', 'large'],
      description: 'Determines the size/version of the logo to display.',
    },
    themeName: {
      control: 'select',
      options: ['light', 'dark'],
      description:
        'The name of the current theme (light or dark). This is usually derived from context but can be overridden for testing.',
    },
    className: {
      control: 'text',
      description: 'Custom CSS class to apply to the logo SVG.',
    },
    sx: {
      control: 'object',
      description: 'MUI SxProps for custom styling.',
    },
  },
  parameters: {
    // Optional: If your component relies on theme for background, configure Storybook backgrounds
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1f1f1f' },
      ],
    },
  },
} satisfies Meta<typeof AppLogo>;

const Template: StoryFn<AppLogoProps> = args => <AppLogo {...args} />;

export const DefaultLargeLight = Template.bind({});
DefaultLargeLight.args = {
  logoType: 'large',
  themeName: 'light', // Explicitly set for story clarity, though decorator handles it
};
DefaultLargeLight.storyName = 'Default Logo - Large (Light Theme)';

export const DefaultSmallLight = Template.bind({});
DefaultSmallLight.args = {
  logoType: 'small',
  themeName: 'light',
};
DefaultSmallLight.storyName = 'Default Logo - Small (Light Theme)';

// To see dark theme versions, use the Storybook toolbar to switch background/theme.
// The decorator will pick up the theme and pass it to AppLogo if needed.

export const DefaultLargeDark = Template.bind({});
DefaultLargeDark.args = {
  logoType: 'large',
  themeName: 'dark',
};
DefaultLargeDark.parameters = { backgrounds: { default: 'dark' } };
DefaultLargeDark.storyName = 'Default Logo - Large (Dark Theme)';

export const DefaultSmallDark = Template.bind({});
DefaultSmallDark.args = {
  logoType: 'small',
  themeName: 'dark',
};
DefaultSmallDark.parameters = { backgrounds: { default: 'dark' } };
DefaultSmallDark.storyName = 'Default Logo - Small (Dark Theme)';

// Story for OriginalAppLogo to ensure it's testable in isolation if ever needed,
// though AppLogo is the primary export.
const OriginalTemplate: StoryFn<AppLogoProps> = args => <OriginalAppLogo {...args} />;

export const OriginalLargeLight = OriginalTemplate.bind({});
OriginalLargeLight.args = {
  logoType: 'large',
  themeName: 'light',
};
OriginalLargeLight.storyName = 'Original Logo Component - Large Light';

export const OriginalSmallDark = OriginalTemplate.bind({});
OriginalSmallDark.args = {
  logoType: 'small',
  themeName: 'dark',
};
OriginalSmallDark.parameters = { backgrounds: { default: 'dark' } };
OriginalSmallDark.storyName = 'Original Logo Component - Small Dark';

// Example of how a plugin might override the logo
const MyCustomPluginLogo: React.FC<AppLogoProps> = ({ logoType, themeName, ...props }) => (
  <div
    {...props}
    style={{
      padding: '5px',
      border: '1px solid red',
      backgroundColor: themeName === 'dark' ? 'lightgrey' : 'grey',
      color: themeName === 'dark' ? 'black' : 'white',
    }}
  >
    My Plugin {logoType} Logo ({themeName})
  </div>
);

const PluginOverrideTemplate: StoryFn<AppLogoProps> = args => {
  // In a real plugin, this would be done via registerAppLogo
  // For Storybook, we simulate it by setting the store state directly in the decorator
  // or by passing the component if AppLogo was designed to accept a component prop.
  // Since AppLogo reads from Redux, we'll set it in the decorator.
  return <AppLogo {...args} />;
};

export const WithPluginOverride = PluginOverrideTemplate.bind({});
WithPluginOverride.args = {
  logoType: 'large',
};
WithPluginOverride.decorators = [
  (Story, context) => {
    const currentThemeName = context.globals.backgrounds?.value === '#1f1f1f' ? 'dark' : 'light';
    const currentHeadlampTheme = currentThemeName === 'dark' ? darkTheme : lightTheme;
    const muiStoryTheme = createMuiTheme(currentHeadlampTheme);

    // Simulate plugin registration
    const storeWithPluginLogo = configureStore({
      reducer: {
        theme: (
          state = {
            ...JSON.parse(JSON.stringify(themeInitialState)),
            name: currentThemeName,
            logo: MyCustomPluginLogo,
          },
          action
        ) => {
          if (action.type === 'theme/setTheme') return { ...state, name: action.payload };
          if (action.type === 'theme/setBrandingAppLogoComponent')
            return { ...state, logo: action.payload };
          return state;
        },
        plugins: (state = { loaded: true }) => state,
      },
    });

    return (
      <Provider store={storeWithPluginLogo}>
        <ThemeProvider theme={muiStoryTheme}>
          <TestContext store={storeWithPluginLogo}>
            <Box sx={{ padding: 2, backgroundColor: muiStoryTheme.palette.background.default }}>
              <Story />
            </Box>
          </TestContext>
        </ThemeProvider>
      </Provider>
    );
  },
];
WithPluginOverride.storyName = 'With Plugin Override';
