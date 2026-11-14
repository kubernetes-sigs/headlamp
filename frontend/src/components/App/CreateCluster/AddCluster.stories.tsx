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

/**
 * Storybook coverage for AddCluster (provider chooser).
 *
 * Form / connection-test states named in older #4687 wording live in
 * KubeConfigLoader, which already has stories. A prior AddCluster stories PR
 * (#5171) was reverted (#5301) after CI failures — one cause was replacing
 * `window.process` wholesale (which can wipe `process.env` under Vitest/jsdom).
 */

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

/** Safely mark the environment as Electron without clobbering process.env. */
function ElectronEnvDecorator({ children }: { children: React.ReactNode }) {
  const win = window as any;
  const previousRef = React.useRef(win.process);
  const didSetRef = React.useRef(false);

  // Must run during render so isElectron() sees renderer on the first paint.
  // Spreading the prior process keeps env/NODE_ENV intact under Vitest/jsdom.
  if (!didSetRef.current) {
    previousRef.current = win.process;
    const previous = previousRef.current;
    const base =
      previous && typeof previous === 'object'
        ? previous
        : typeof process !== 'undefined'
        ? process
        : {};
    win.process = {
      ...base,
      type: 'renderer',
      env: (base as any).env ?? (typeof process !== 'undefined' ? process.env : {}),
    };
    didSetRef.current = true;
  }

  React.useEffect(() => {
    return () => {
      const previous = previousRef.current;
      if (previous === undefined) {
        delete win.process;
      } else {
        win.process = previous;
      }
    };
  }, []);

  return <>{children}</>;
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

/** No providers registered and no plugin catalog sidebar entry. */
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

/**
 * Plugin catalog registered + Electron so "Add Local Cluster Provider" shows.
 * Uses a safe process mock that preserves env (see file header).
 */
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
    Story => (
      <ElectronEnvDecorator>
        <Story />
      </ElectronEnvDecorator>
    ),
  ],
};

/** Cluster providers registered and shown in the list. */
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
