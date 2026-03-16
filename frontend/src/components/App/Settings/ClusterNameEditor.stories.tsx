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
import { Provider } from 'react-redux';
import { ClusterNameEditor } from './ClusterNameEditor';

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

const meta: Meta<typeof ClusterNameEditor> = {
  title: 'Settings/ClusterNameEditor',
  component: ClusterNameEditor,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
const Template: StoryFn<typeof ClusterNameEditor> = args => {
  const store = configureStore({
    reducer: (state = getMockState()) => state,
    preloadedState: getMockState(),
  });

  return (
    <Provider store={store}>
      <ClusterNameEditor {...args} />
    </Provider>
  );
};

export const Default = Template.bind({});
Default.args = {
  cluster: 'my-cluster',
  clusterSettings: null,
  setClusterSettings: () => {},
};

export const WithInvalidName = Template.bind({});
WithInvalidName.args = {
  ...Default.args,
  clusterSettings: {
    currentName: 'Invalid Cluster Name',
  },
};

export const WithNewName = Template.bind({});
WithNewName.args = {
  ...Default.args,
  clusterSettings: {
    currentName: 'new-cluster-name',
  },
};
