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

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import ClusterSelector, { ClusterSelectorProps } from './ClusterSelector';

const theme = createTheme({
  palette: {
    mode: 'light',
    navbar: {
      background: '#fff',
    },
  },
});

const getMockState = () => ({
  plugins: { loaded: true },
  theme: {
    name: 'light',
    logo: null,
    palette: {
      navbar: {
        background: '#fff',
      },
    },
  },
});

export default {
  title: 'Components/ClusterSelector',
  component: ClusterSelector,
} as Meta<typeof ClusterSelector>;

const Template: StoryFn<ClusterSelectorProps> = args => {
  const store = configureStore({
    reducer: (state = getMockState()) => state,
    preloadedState: getMockState(),
  });

  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <ClusterSelector {...args} />
      </ThemeProvider>
    </Provider>
  );
};

export const Default = Template.bind({});
Default.args = {
  currentCluster: 'dev',
  clusters: ['dev', 'staging', 'prod'],
};
