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
import { Provider } from 'react-redux';
import NodeShellSettings from './NodeShellSettings';

const mockClusterName = 'mock-cluster';

localStorage.setItem(
  `clusterSettings-${mockClusterName}`,
  JSON.stringify({
    nodeShellTerminal: {
      isEnabled: true,
      namespace: 'kube-system',
      linuxImage: 'busybox:1.28',
    },
  })
);

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
  title: 'Settings/NodeShellSettings',
  component: NodeShellSettings,
} as Meta<typeof NodeShellSettings>;

const Template: StoryFn<typeof NodeShellSettings> = args => {
  const store = configureStore({
    reducer: (state = getMockState()) => state,
    preloadedState: getMockState(),
  });

  return (
    <Provider store={store}>
      <NodeShellSettings {...args} />
    </Provider>
  );
};

export const Default = Template.bind({});
Default.args = {
  cluster: mockClusterName,
};
