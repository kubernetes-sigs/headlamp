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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { useEffect, useRef } from 'react';
import { initialState as THEME_INITIAL_STATE } from '../../components/App/themeSlice';
import { initialState as CONFIG_INITIAL_STATE } from '../../redux/configSlice';
import { initialState as FILTER_INITIAL_STATE } from '../../redux/filterSlice';
import { uiSlice } from '../../redux/uiSlice';
import { API_BASE, TestContext } from '../../test';
import Sidebar, { DefaultSidebars, PureSidebar } from './Sidebar';
import { initialState as SIDEBAR_INITIAL_STATE, SidebarState } from './sidebarSlice';

export default {
  title: 'Sidebar/Sidebar',
  component: PureSidebar,
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get(`${API_BASE}/apis/apiextensions.k8s.io/v1/customresourcedefinitions`, () =>
            HttpResponse.json({
              kind: 'List',
              items: [],
              metadata: {},
            })
          ),
          http.get(`${API_BASE}/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions`, () =>
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
    dispatch: { action: 'dispatch' },
  },
} as Meta;

type StoryProps = Partial<SidebarState>;

const Template: StoryFn<StoryProps> = args => {
  const sidebarStore = configureStore({
    reducer: (
      state = {
        ui: { ...uiSlice.getInitialState() },
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
      ui: { ...uiSlice.getInitialState() },
      projects: {
        projects: {},
      },
      sidebar: {
        ...SIDEBAR_INITIAL_STATE,
        isVisible: true,
        ...args,
      },
    },
  });
  const queryClient = new QueryClient();

  return (
    <TestContext store={sidebarStore}>
      <SnackbarProvider>
        <QueryClientProvider client={queryClient}>
          <Sidebar />
        </QueryClientProvider>
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
const TemplateWithCluster: StoryFn<StoryProps> = args => {
  // getCluster()/useCluster() read window.location directly rather than the
  // MemoryRouter context, so TestContext's routerMap alone doesn't give
  // components a real selected cluster in stories/tests. Set it explicitly
  // before the tree below mounts (its initial state is captured synchronously
  // on first render), and restore the original path on unmount so this
  // doesn't leak into other stories/tests sharing the same jsdom window.
  const originalPathnameRef = useRef<string>();
  if (originalPathnameRef.current === undefined) {
    originalPathnameRef.current = window.location.pathname;
    window.history.replaceState(null, '', '/c/test-cluster');
  }
  useEffect(() => {
    return () => {
      window.history.replaceState(null, '', originalPathnameRef.current);
    };
  }, []);

  const sidebarStore = configureStore({
    reducer: (
      state = {
        ui: { ...uiSlice.getInitialState() },
      }
    ) => state,
    preloadedState: {
      plugins: { loaded: true },
      theme: { ...THEME_INITIAL_STATE },
      config: { ...CONFIG_INITIAL_STATE },
      filter: { ...FILTER_INITIAL_STATE },
      ui: { ...uiSlice.getInitialState() },
      projects: { projects: {} },
      sidebar: {
        ...SIDEBAR_INITIAL_STATE,
        isVisible: true,
        ...args,
      },
    },
  });
  const queryClient = new QueryClient();

  return (
    <TestContext store={sidebarStore} urlPrefix="/c" routerMap={{ cluster: 'test-cluster' }}>
      <SnackbarProvider>
        <QueryClientProvider client={queryClient}>
          <Sidebar />
        </QueryClientProvider>
      </SnackbarProvider>
    </TestContext>
  );
};

export const GatewayAPIUnavailable = TemplateWithCluster.bind({});
GatewayAPIUnavailable.args = {
  isSidebarOpen: true,
  selected: {
    item: 'cluster',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
};
GatewayAPIUnavailable.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/clusters/:cluster/apis/apiextensions.k8s.io/v1/customresourcedefinitions`,
          () => HttpResponse.json({ kind: 'List', items: [], metadata: {} })
        ),
        http.get(
          `${API_BASE}/clusters/:cluster/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions`,
          () => HttpResponse.json({ kind: 'List', items: [], metadata: {} })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/gateway.networking.k8s.io/v1`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/gateway.networking.k8s.io/v1beta1`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/gateway.networking.k8s.io/v1alpha2`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/scheduling.k8s.io/v1beta1`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/scheduling.k8s.io/v1alpha3`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/scheduling.k8s.io/v1alpha2`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
      ],
    },
  },
};

export const GatewayAPIAvailable = TemplateWithCluster.bind({});
GatewayAPIAvailable.args = {
  isSidebarOpen: true,
  selected: {
    item: 'cluster',
    sidebar: DefaultSidebars.IN_CLUSTER,
  },
};
GatewayAPIAvailable.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/clusters/:cluster/apis/apiextensions.k8s.io/v1/customresourcedefinitions`,
          () => HttpResponse.json({ kind: 'List', items: [], metadata: {} })
        ),
        http.get(
          `${API_BASE}/clusters/:cluster/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions`,
          () => HttpResponse.json({ kind: 'List', items: [], metadata: {} })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/gateway.networking.k8s.io/v1`, () =>
          HttpResponse.json({ kind: 'APIResourceList', resources: [] })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/gateway.networking.k8s.io/v1beta1`, () =>
          HttpResponse.json({ kind: 'APIResourceList', resources: [] })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/gateway.networking.k8s.io/v1alpha2`, () =>
          HttpResponse.json({ kind: 'APIResourceList', resources: [] })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/scheduling.k8s.io/v1beta1`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/scheduling.k8s.io/v1alpha3`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
        http.get(`${API_BASE}/clusters/:cluster/apis/scheduling.k8s.io/v1alpha2`, () =>
          HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        ),
      ],
    },
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
