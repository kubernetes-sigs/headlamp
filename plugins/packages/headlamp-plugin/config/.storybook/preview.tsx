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
import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
// import { initialize, mswLoader } from 'msw-storybook-addon';
// import './index.css';
import { Title, Subtitle, Description, Primary, Controls } from '@storybook/blocks';
// import { baseMocks } from './baseMocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  darkTheme,
  lightTheme,
} from '@kinvolk/headlamp-plugin/lib/components/App/defaultAppThemes';
import { createMuiTheme } from '@kinvolk/headlamp-plugin/lib/lib/themes';

// https://github.com/mswjs/msw-storybook-addon
// initialize({
//   onUnhandledRequest: 'warn',
//   waitUntilReady: true,
// });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: 'always',
      staleTime: 0,
      retry: false,
      gcTime: 0,
    },
  },
});

const withThemeProvider = (Story: any, context: any) => {
  const theme = context.globals.backgrounds?.value === '#1f1f1f' ? darkTheme : lightTheme;

  const ourThemeProvider = (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={createMuiTheme(theme)}>
        <Story {...context} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return ourThemeProvider;
};
export const decorators = [withThemeProvider];

export const parameters = {
  backgrounds: {
    values: [
      { name: 'light', value: '#FFF' },
      { name: 'dark', value: '#1f1f1f' },
    ],
  },

  docs: {
    toc: { disable: true },
    // Customize docs page to exclude display of all stories
    // Becasue it would cause stories override each others' mocks
    page: () => (
      <>
        <Title />
        <Subtitle />
        <Description />
        <Primary />
        <Controls />
      </>
    ),
  },

  // https://github.com/mswjs/msw-storybook-addon#composing-request-handlers
  // msw: {
  //   handlers: {
  //     /**
  //      * If you wan't to override or disable them in a particular story
  //      * set base to null in msw configuration
  //      *
  //      * parameters: {
  //      *   msw: {
  //      *     handlers: {
  //      *       base: null,
  //      *       story: [yourMocks]
  //      *     }
  //      *   }
  //      * }
  //      */
  //     base: baseMocks,
  //   },
  // },
};

// export const loaders = [mswLoader];

export const tags = ['autodocs'];
