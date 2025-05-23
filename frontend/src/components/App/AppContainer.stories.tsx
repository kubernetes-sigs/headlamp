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
import i18n from '../../i18n/config'; // Your i18n instance
import { createMuiTheme, getThemeName } from '../../lib/themes'; // Headlamp's theme utilities
import store from '../../redux/stores/store'; // Your main Redux store
import AppContainer from './AppContainer';

// A minimal QueryClient for Storybook
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Don't retry failed queries in stories
      staleTime: Infinity, // Keep data fresh for the duration of the story
    },
  },
});

export default {
  title: 'App/AppContainer',
  component: AppContainer,
  decorators: [
    Story => {
      // This setup mimics the main App.tsx providers
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
    layout: 'fullscreen', // AppContainer typically takes up the whole screen
    docs: {
      description: {
        component:
          'The root container for the Headlamp application. It sets up routing, global providers, and the main layout. This story primarily verifies that it renders its children correctly.',
      },
    },
    // Actions and controls are less relevant for such a high-level component.
  },
} as Meta<typeof AppContainer>;

const Template: StoryFn = args => <AppContainer {...args} />; // AppContainer doesn't take props directly

export const Default = Template.bind({});
Default.storyName = 'Default Application Container';
Default.parameters = {
  msw: {
    handlers: {
      // Add any essential global API mocks here if AppContainer or its direct children
      // make immediate API calls on mount that are not covered by baseMocks.
      // For example, /config is often fetched early.
      story: [
        // http.get('http://localhost:4466/config', () => HttpResponse.json({ clusters: [] })),
        // http.get('http://localhost:4466/plugins', () => HttpResponse.json([])),
      ],
    },
  },
};
