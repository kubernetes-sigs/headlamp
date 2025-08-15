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
import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter, Route } from 'react-router-dom';
import { initialState as configInitialState } from '../../redux/configSlice';
import { TestContext } from '../../test';
import NavigationTabs from './NavigationTabs';
import {
  DefaultSidebars,
  initialState as sidebarInitialState,
  SidebarEntry,
  SidebarState,
} from './sidebarSlice';

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
  NoURLItem: {
    name: 'NoURLItem',
    label: 'Item Without URL',
    parent: 'workloads',
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
  title: 'Sidebar/NavigationTabs',
  component: NavigationTabs,
  decorators: [
    (Story, context: { args: { mockSidebarState?: Partial<SidebarState> } }) => {
      const store = createMockStoryStore(context.args.mockSidebarState || {});
      return (
        <Provider store={store}>
          <BrowserRouter>
            <TestContext store={store}>
              <Route path="/">
                <div style={{ padding: '20px', backgroundColor: '#f5f5f5' }}>
                  <Story />
                </div>
              </Route>
            </TestContext>
          </BrowserRouter>
        </Provider>
      );
    },
  ],
  parameters: {
    controls: { include: ['mockSidebarState'] },
  },
  argTypes: {
    mockSidebarState: {
      control: 'object',
      description: 'Mock Redux sidebar state for the story.',
    },
  },
} as Meta<typeof NavigationTabs>;

const Template: StoryFn<{ mockSidebarState: Partial<SidebarState> }> = () => <NavigationTabs />;

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
};
WorkloadsChildSelected.storyName = "Workloads View (Child 'Pods' Selected)";

export const ItemWithoutOwnURLSelected = Template.bind({});
ItemWithoutOwnURLSelected.args = {
  mockSidebarState: {
    selected: {
      item: 'NoURLItem',
      sidebar: DefaultSidebars.IN_CLUSTER,
    },
    isSidebarOpen: false,
  },
};
ItemWithoutOwnURLSelected.storyName = "Workloads View (Child 'Item Without URL' Selected)";

export const SettingsParentSelected = Template.bind({});
SettingsParentSelected.args = {
  mockSidebarState: {
    selected: {
      item: 'settings',
      sidebar: DefaultSidebars.HOME,
    },
    isSidebarOpen: false,
  },
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
