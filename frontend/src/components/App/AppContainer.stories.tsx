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

import { ThemeProvider } from '@mui/material/styles';
import { Meta, StoryFn } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import i18n from '../../i18n/config';
import { createMuiTheme, getThemeName } from '../../lib/themes';
import store from '../../redux/stores/store';
import AppContainer from './AppContainer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
    },
  },
});

export default {
  title: 'App/AppContainer',
  component: AppContainer,
  decorators: [
    Story => {
      const muiTheme = createMuiTheme(
        getThemeName() === 'dark'
          ? store.getState().theme.appThemes.find(t => t.name === 'dark') ||
              store.getState().theme.appThemes[0]
          : store.getState().theme.appThemes.find(t => t.name === 'light') ||
              store.getState().theme.appThemes[0]
      );

      return (
        <Provider store={store}>
          <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
              <ThemeProvider theme={muiTheme}>
                {/* AppContainer itself sets up SnackbarProvider and Router */}
                <Story />
              </ThemeProvider>
            </I18nextProvider>
          </QueryClientProvider>
        </Provider>
      );
    },
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The root container for the Headlamp application. It sets up routing, global providers, and the main layout. This story primarily verifies that it renders its children correctly.',
      },
    },
  },
} as Meta<typeof AppContainer>;

const Template: StoryFn = args => <AppContainer {...args} />;

export const Default = Template.bind({});
Default.storyName = 'Default Application Container';
Default.parameters = {
  msw: {
    handlers: {
      story: [],
    },
  },
};
