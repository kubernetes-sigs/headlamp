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
import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { createMuiTheme } from '../../lib/themes';
import reducers from '../../redux/reducers/reducers';
import { lightTheme } from '../App/defaultAppThemes';
import ViewDetails from './ViewDetails';
import ViewsList from './ViewsList';

export default {
  title: 'CustomViews/Views',
  component: ViewsList,
  parameters: {
    storyshots: { disable: true },
  },
} as Meta;

function makeStoryStore(views: any[] = []) {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      customViews: {
        views,
        widgetDefinitions: [
          {
            type: 'example.plugin-chart',
            label: 'Plugin Metrics Chart',
            icon: 'mdi:chart-timeline-variant',
            component: () => <div>Plugin metrics content</div>,
          },
        ],
      },
    },
  });
}

export const EmptyViewsList: StoryFn = () => {
  const storyStore = makeStoryStore([]);
  return (
    <Provider store={storyStore}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <QueryClientProvider client={new QueryClient()}>
          <SnackbarProvider>
            <MemoryRouter initialEntries={['/c/default/views']}>
              <ViewsList />
            </MemoryRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </Provider>
  );
};

export const PopulatedViewDetails: StoryFn = () => {
  const storyStore = makeStoryStore([
    {
      id: 'demo-view',
      name: 'Checkout Observability',
      description: 'Combined plugin charts and fallback missing widget state',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      widgets: [
        {
          id: 'w-1',
          type: 'example.plugin-chart',
          title: 'HTTP Request Rate',
          colSpan: 6,
          config: {},
        },
        {
          id: 'w-2',
          type: 'missing.plugin.widget',
          title: 'Unavailable Plugin Widget',
          colSpan: 6,
          config: {},
        },
      ],
    },
  ]);

  return (
    <Provider store={storyStore}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <QueryClientProvider client={new QueryClient()}>
          <SnackbarProvider>
            <MemoryRouter initialEntries={['/c/default/views/demo-view']}>
              <Route path="/c/:cluster/views/:id">
                <ViewDetails />
              </Route>
            </MemoryRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </Provider>
  );
};
