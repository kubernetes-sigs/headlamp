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

import { configureStore, createSlice } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { initialState as configInitialState } from '../../redux/configSlice';
import { TestContext } from '../../test';
import {
  DefaultSidebars,
  initialState as sidebarInitialState,
  SidebarEntry,
  SidebarState,
} from '../Sidebar/sidebarSlice';
import NavigationTabs from './NavigationTabs';

const mockClusterSidebarEntries: Record<string, SidebarEntry> = {
  cluster: {
    name: 'cluster',
    label: 'Cluster',
    icon: 'mdi:hexagon-multiple-outline',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
  namespaces: {
    name: 'namespaces',
    label: 'Namespaces',
    parent: 'cluster',
    url: '/namespaces',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
  nodes: {
    name: 'nodes',
    label: 'Nodes',
    parent: 'cluster',
    url: '/nodes',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
  workloads: {
    name: 'workloads',
    label: 'Workloads',
    icon: 'mdi:circle-slice-2',
    sidebar: DefaultSidebars.IN_CLUSTER,
    url: '/workloads',
  },
  Pods: {
    name: 'Pods',
    label: 'Pods',
    parent: 'workloads',
    url: '/pods',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
  Deployments: {
    name: 'Deployments',
    label: 'Deployments',
    parent: 'workloads',
    url: '/deployments',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
};

const mockHomeSidebarEntries: Record<string, SidebarEntry> = {
  home: { name: 'home', label: 'Home', icon: 'mdi:home', url: '/', sidebar: DefaultSidebars.HOME },
  settings: {
    name: 'settings',
    label: 'Settings',
    icon: 'mdi:cog',
    sidebar: DefaultSidebars.HOME,
    url: '/settings/general',
  },
  settingsGeneral: {
    name: 'settingsGeneral',
    label: 'General',
    parent: 'settings',
    url: '/settings/general',
    sidebar: DefaultSidebars.HOME,
  },
  plugins: {
    name: 'plugins',
    label: 'Plugins',
    parent: 'settings',
    url: '/settings/plugins',
    sidebar: DefaultSidebars.HOME,
  },
};

const createMockStoryStore = (sidebarConfig: Partial<SidebarState>) => {
  const fullSidebarState: SidebarState = {
    ...sidebarInitialState,
    entries:
      sidebarConfig.selected?.sidebar === DefaultSidebars.HOME
        ? mockHomeSidebarEntries
        : mockClusterSidebarEntries,
    ...sidebarConfig,
    isSidebarOpen: sidebarConfig.isSidebarOpen === undefined ? false : sidebarConfig.isSidebarOpen,
  };

  return configureStore({
    reducer: {
      sidebar: createSlice({ name: 'sidebar', initialState: fullSidebarState, reducers: {} })
        .reducer,
      config: (state = configInitialState) => state,
      filter: (state = { namespaces: new Set() }) => state,
      routes: (state = { routes: {}, routeFilters: [] }) => state,
      ui: (state = { functionsToOverride: {} }) => state,
      projects: (state = { projects: {} }) => state,
    },
  });
};

export default {
  title: 'Navigation/NavigationTabs',
  component: NavigationTabs,
  decorators: [
    (Story, context: { args: { mockSidebarState?: Partial<SidebarState>; initialPath?: string } }) => {
      const store = createMockStoryStore(context.args.mockSidebarState || {});
      const queryClient = new QueryClient();
      const initialPath = context.args.initialPath || '/';
      return (
        <Provider store={store}>
          <MemoryRouter initialEntries={[initialPath]}>
            <TestContext store={store}>
              <QueryClientProvider client={queryClient}>
                <Route path="/">
                  <div style={{ padding: '20px', backgroundColor: '#f5f5f5' }}>
                    <Story />
                  </div>
                </Route>
              </QueryClientProvider>
            </TestContext>
          </MemoryRouter>
        </Provider>
      );
    },
  ],
  parameters: {
    controls: { include: ['mockSidebarState', 'initialPath'] },
    msw: {
      handlers: {
        story: [
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
            () =>
              HttpResponse.json({
                kind: 'List',
                items: [],
                metadata: {},
              })
          ),
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions',
            () =>
              HttpResponse.json({
                kind: 'List',
                items: [],
                metadata: {},
              })
          ),
        ],
      },
    },
  },
  argTypes: {
    mockSidebarState: {
      control: 'object',
      description: 'Mock Redux sidebar state for the story.',
    },
    initialPath: {
      control: 'text',
      description: 'Initial router path to simulate current location.',
    },
  },
} as Meta<typeof NavigationTabs>;

const Template: StoryFn<{ mockSidebarState: Partial<SidebarState>; initialPath?: string }> = () => (
  <NavigationTabs />
);

export const ClusterParentSelected = Template.bind({});
ClusterParentSelected.args = {
  mockSidebarState: {
    selected: {
      item: 'cluster',
      sidebar: DefaultSidebars.IN_CLUSTER,
    },
    isSidebarOpen: false,
  },
};
ClusterParentSelected.storyName = 'Cluster View (Parent Selected)';

export const WorkloadsParentSelected = Template.bind({});
WorkloadsParentSelected.args = {
  mockSidebarState: {
    selected: {
      item: 'workloads',
      sidebar: DefaultSidebars.IN_CLUSTER,
    },
    isSidebarOpen: false,
  },
  initialPath: '/workloads',
};
WorkloadsParentSelected.storyName = 'Workloads View (Parent Selected)';

export const WorkloadsChildSelected = Template.bind({});
WorkloadsChildSelected.args = {
  mockSidebarState: {
    selected: {
      item: 'Pods',
      sidebar: DefaultSidebars.IN_CLUSTER,
    },
    isSidebarOpen: false,
  },
  initialPath: '/pods',
};
WorkloadsChildSelected.storyName = "Workloads View (Child 'Pods' Selected)";

export const SettingsParentSelected = Template.bind({});
SettingsParentSelected.args = {
  mockSidebarState: {
    selected: {
      item: 'settings',
      sidebar: DefaultSidebars.HOME,
    },
    isSidebarOpen: false,
  },
  initialPath: '/settings/general',
};
SettingsParentSelected.storyName = 'Settings View (Parent Selected)';

export const NoSubList = Template.bind({});
NoSubList.args = {
  mockSidebarState: {
    selected: {
      item: 'home',
      sidebar: DefaultSidebars.HOME,
    },
    isSidebarOpen: false,
  },
};
NoSubList.storyName = 'No Sub-List (Should Render Nothing)';

export const SidebarOpen = Template.bind({});
SidebarOpen.args = {
  mockSidebarState: {
    selected: {
      item: 'workloads',
      sidebar: DefaultSidebars.IN_CLUSTER,
    },
    isSidebarOpen: true,
  },
};
SidebarOpen.storyName = 'Sidebar Open (Should Render Nothing)';
