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
import { SnackbarProvider } from 'notistack';
import { initialState as THEME_INITIAL_STATE } from '../../components/App/themeSlice';
import { initialState as CONFIG_INITIAL_STATE } from '../../redux/configSlice';
import { initialState as FILTER_INITIAL_STATE } from '../../redux/filterSlice';
import { INITIAL_STATE as UI_INITIAL_STATE } from '../../redux/reducers/ui';
import { TestContext } from '../../test';
import Sidebar, { DefaultSidebars, PureSidebar } from './Sidebar';
import { initialState as SIDEBAR_INITIAL_STATE, SidebarState } from './sidebarSlice';

export default {
  title: 'Sidebar/Sidebar',
  component: PureSidebar,
  argTypes: {
    dispatch: { action: 'dispatch' },
  },
} as Meta;

type StoryProps = Partial<SidebarState>;

const Template: StoryFn<StoryProps> = args => {
  const sidebarStore = configureStore({
    reducer: (
      state = {
        ui: { ...UI_INITIAL_STATE },
      }
    ) => state,
    preloadedState: {
      plugins: {
        loaded: true,
      },
      theme: {
        ...THEME_INITIAL_STATE,
      },
      config: {
        ...CONFIG_INITIAL_STATE,
      },
      filter: {
        ...FILTER_INITIAL_STATE,
      },
      ui: {
        ...UI_INITIAL_STATE,
      },
      sidebar: {
        ...SIDEBAR_INITIAL_STATE,
        isVisible: true,
        ...args,
      },
    },
  });

  return (
    <TestContext store={sidebarStore}>
      <SnackbarProvider>
        <Sidebar />
      </SnackbarProvider>
    </TestContext>
  );
};

export const InClusterSidebarOpen = Template.bind({});
InClusterSidebarOpen.args = {
  isSidebarOpen: true,
  selected: {
    item: 'cluster',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
};
export const InClusterSidebarClosed = Template.bind({});
InClusterSidebarClosed.args = {
  isSidebarOpen: false,
  selected: {
    item: 'cluster',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
};
export const NoSidebar = Template.bind({});
NoSidebar.args = {
  selected: {
    item: null,
    sidebar: null,
  },
};
export const SelectedItemWithSidebarOmitted = Template.bind({});
SelectedItemWithSidebarOmitted.args = {
  selected: {
    item: 'workloads',
    // This is what happens internally when plugins only set a selected name, not a selected sidebar.
    // i.e. it will use the in-cluster sidebar by default.
    sidebar: '',
  },
};
export const HomeSidebarOpen = Template.bind({});
HomeSidebarOpen.args = {
  selected: {
    item: 'settings',
    sidebar: DefaultSidebars.HOME,
  },
};
export const HomeSidebarClosed = Template.bind({});
HomeSidebarClosed.args = {
  isSidebarOpen: false,
  selected: {
    item: 'settings',
    sidebar: DefaultSidebars.HOME,
  },
};
export const NotVisibleSidebar = Template.bind({});
NotVisibleSidebar.args = {
  isVisible: false,
  selected: {
    item: 'settings',
    sidebar: DefaultSidebars.HOME,
  },
};
