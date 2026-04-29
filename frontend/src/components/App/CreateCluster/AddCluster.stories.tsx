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
import { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import {
  type ClusterProviderSliceState,
  initialState as CLUSTER_PROVIDER_INITIAL_STATE,
} from '../../../redux/clusterProviderSlice';
import reducers from '../../../redux/reducers/reducers';
import { TestContext } from '../../../test';
import {
  initialState as SIDEBAR_INITIAL_STATE,
  type SidebarState,
} from '../../Sidebar/sidebarSlice';
import AddCluster from './AddCluster';

function createStoryStore({
  clusterProvider,
  sidebar,
}: {
  clusterProvider?: ClusterProviderSliceState;
  sidebar?: SidebarState;
} = {}) {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      clusterProvider: clusterProvider ?? CLUSTER_PROVIDER_INITIAL_STATE,
      sidebar: sidebar ?? SIDEBAR_INITIAL_STATE,
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
        thunk: true,
      }),
  });
}

const meta: Meta<typeof AddCluster> = {
  title: 'App/AddCluster',
  component: AddCluster,
  decorators: [
    (Story, context) => (
      <TestContext store={context.parameters.store}>
        <Story />
      </TestContext>
    ),
  ],
  args: {
    open: true,
    onChoice: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof AddCluster>;

// No providers registered, no plugin catalog in sidebar
export const NoProviders: Story = {
  parameters: {
    store: createStoryStore({
      clusterProvider: {
        ...CLUSTER_PROVIDER_INITIAL_STATE,
        clusterProviders: [],
      },
      sidebar: {
        ...SIDEBAR_INITIAL_STATE,
        entries: {},
      },
    }),
  },
};

// No providers but plugin catalog is registered in sidebar
// This story mocks an Electron environment so the "Add Local Cluster Provider" button appears
export const WithPluginCatalog: Story = {
  parameters: {
    store: createStoryStore({
      clusterProvider: {
        ...CLUSTER_PROVIDER_INITIAL_STATE,
        clusterProviders: [],
      },
      sidebar: {
        ...SIDEBAR_INITIAL_STATE,
        entries: {
          pluginCatalog: {
            name: 'pluginCatalog',
            label: 'Plugin Catalog',
            url: '/plugin-catalog',
          },
        },
      },
    }),
  },
  decorators: [
    Story => {
      function ElectronStoryDecorator() {
        React.useEffect(() => {
          const original = (window as any).process;
          (window as any).process = {
            ...(original ?? {}),
            type: 'renderer',
          };
          return () => {
            if (original === undefined) {
              delete (window as any).process;
            } else {
              (window as any).process = original;
            }
          };
        }, []);

        return <Story />;
      }

      return <ElectronStoryDecorator />;
    },
  ],
};

// Cluster providers registered and shown in the list
export const WithProviders: Story = {
  parameters: {
    store: createStoryStore({
      clusterProvider: {
        ...CLUSTER_PROVIDER_INITIAL_STATE,
        clusterProviders: [
          {
            title: 'Minikube',
            icon: () => null,
            description: 'Run a local Kubernetes cluster with Minikube.',
            url: '/minikube',
          },
        ],
      },
      sidebar: {
        ...SIDEBAR_INITIAL_STATE,
        entries: {},
      },
    }),
  },
};
