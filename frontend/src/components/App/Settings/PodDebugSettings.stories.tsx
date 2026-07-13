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

/**
 * Storybook stories for PodDebugSettings component.
 * Demonstrates enabled and disabled configurations.
 */

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import { ClusterSettings } from '../../../helpers/clusterSettings';
import PodDebugSettings from './PodDebugSettings';

const mockClusterName = 'mock-cluster';

/** Creates mock Redux state for stories. */
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
  title: 'Settings/PodDebugSettings',
  component: PodDebugSettings,
} as Meta<typeof PodDebugSettings>;

/** Story template with Redux Provider and stateful clusterSettings. */
const Template: StoryFn<typeof PodDebugSettings> = args => {
  const store = configureStore({
    reducer: (state = getMockState()) => state,
    preloadedState: getMockState(),
  });

  const [clusterSettings, setClusterSettings] = React.useState<ClusterSettings>(
    args.clusterSettings
  );

  return (
    <Provider store={store}>
      <PodDebugSettings
        {...args}
        clusterSettings={clusterSettings}
        setClusterSettings={setClusterSettings}
      />
    </Provider>
  );
};

/** Default story with debugging enabled and busybox image. */
export const Default = Template.bind({});
Default.args = {
  cluster: mockClusterName,
  clusterSettings: {
    podDebugTerminal: {
      isEnabled: true,
      debugImage: 'docker.io/library/busybox:latest',
    },
  },
};

/** Story with debugging disabled and alpine image. */
export const Disabled = Template.bind({});
Disabled.args = {
  cluster: mockClusterName,
  clusterSettings: {
    podDebugTerminal: {
      isEnabled: false,
      debugImage: 'docker.io/library/alpine:latest',
    },
  },
};
