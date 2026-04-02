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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { initialState as CONFIG_INITIAL_STATE } from '../../redux/configSlice';
import { SidebarEntry } from '../Sidebar/sidebarSlice';
import { DefaultSidebars } from '../Sidebar/sidebarSlice';
import { useNavigationTree } from './useNavigationTree';

// --- Mocks ---

vi.mock('../../helpers/isElectron', () => ({
  isElectron: () => false,
}));

vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: () => ['test-cluster'],
}));

vi.mock('../../lib/k8s/api/v2/apiDiscovery', () => ({
  apiDiscovery: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/k8s/crd', () => ({
  default: {
    useList: () => [[], null],
  },
}));

vi.mock('../../lib/k8s/ResourceCategory', () => ({
  groupByCategory: () => new Map(),
  customResourcesCategory: {
    label: 'Custom Resources',
    icon: 'mdi:puzzle-outline',
    description: 'Custom resource definitions',
  },
}));

vi.mock('../../lib/router/createRouteURL', () => ({
  createRouteURL: (routeName: string, params?: Record<string, string>) => {
    if (params?.crd) return `/customresources/${params.crd}`;
    return `/${routeName}`;
  },
}));

vi.mock('../../lib/cluster', () => ({
  formatClusterPathParam: (clusters: string[]) => clusters.join('+'),
  getClusterPrefixedPath: (path: string) => `/c/:cluster${path}`,
}));

vi.mock('../../helpers/clusterAppearance', () => ({
  getClusterAppearanceFromMeta: () => ({}),
}));

vi.mock('../Sidebar/ClusterBadge', () => ({
  default: () => null,
}));

// --- Helpers ---

// i18n is not initialized in tests, so t('translation|Home') returns 'translation|Home'.
// The labels below match the raw keys used in useNavigationTree's buildHomeItems
// and buildInClusterStaticItems.
const LABEL = {
  HOME: 'translation|Home',
  CLUSTER: 'glossary|Cluster',
  MAP: 'glossary|Map',
  NAMESPACES: 'glossary|Namespaces',
  NODES: 'glossary|Nodes',
  ADVANCED_SEARCH: 'Advanced Search (Beta)',
  NOTIFICATIONS: 'translation|Notifications',
  SETTINGS: 'translation|Settings',
  GENERAL: 'translation|General',
  PLUGINS: 'translation|Plugins',
};

function createStore(
  entries: Record<string, SidebarEntry> = {},
  filters: ((entry: SidebarEntry) => SidebarEntry | null)[] = [],
  sidebarName: string = DefaultSidebars.IN_CLUSTER
) {
  return configureStore({
    reducer: (state = {}) => state,
    preloadedState: {
      config: {
        ...CONFIG_INITIAL_STATE,
        clusters: {
          'test-cluster': { name: 'test-cluster' },
          'other-cluster': { name: 'other-cluster' },
        },
      },
      sidebar: {
        entries,
        filters,
        selected: { item: null, sidebar: sidebarName },
        isVisible: true,
        isSidebarOpen: true,
        isSidebarOpenUserSelected: true,
      },
      filter: { namespaces: new Set() },
      ui: { functionsToOverride: {} },
      projects: { projects: {} },
    },
  });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function createWrapper(store: ReturnType<typeof createStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    </Provider>
  );
}

// --- Tests ---

describe('useNavigationTree', () => {
  afterEach(() => {
    queryClient.clear();
  });

  it('returns default in-cluster static items', () => {
    const store = createStore();
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const labels = result.current.nodes.map(n => n.label);
    expect(labels).toContain(LABEL.HOME);
    expect(labels).toContain(LABEL.CLUSTER);
    expect(labels).toContain(LABEL.MAP);
  });

  it('returns home sidebar items', () => {
    const store = createStore({}, [], DefaultSidebars.HOME);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.HOME), {
      wrapper: createWrapper(store),
    });

    const labels = result.current.nodes.map(n => n.label);
    expect(labels).toContain(LABEL.HOME);
    expect(labels).toContain(LABEL.NOTIFICATIONS);
    expect(labels).toContain(LABEL.SETTINGS);
  });

  it('includes Cluster children (Namespaces, Nodes, Advanced Search)', () => {
    const store = createStore();
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const clusterNode = result.current.nodes.find(n => n.label === LABEL.CLUSTER);
    expect(clusterNode).toBeDefined();
    const childLabels = clusterNode!.children!.map(c => c.label);
    expect(childLabels).toContain(LABEL.NAMESPACES);
    expect(childLabels).toContain(LABEL.NODES);
    expect(childLabels).toContain(LABEL.ADVANCED_SEARCH);
  });

  it('adds a top-level plugin entry', () => {
    const entries: Record<string, SidebarEntry> = {
      myPlugin: {
        name: 'myPlugin',
        label: 'My Plugin',
        url: '/my-plugin',
        icon: 'mdi:puzzle',
        sidebar: DefaultSidebars.IN_CLUSTER,
      },
    };

    const store = createStore(entries);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const pluginNode = result.current.nodes.find(n => n.label === 'My Plugin');
    expect(pluginNode).toBeDefined();
    expect(pluginNode!.url).toBe('/my-plugin');
    expect(pluginNode!.icon).toBe('mdi:puzzle');
  });

  it('adds a plugin entry as a child of an existing static item (Cluster)', () => {
    const entries: Record<string, SidebarEntry> = {
      pluginClusterChild: {
        name: 'pluginClusterChild',
        label: 'Plugin Cluster View',
        url: '/plugin-cluster-view',
        parent: 'cluster',
        sidebar: DefaultSidebars.IN_CLUSTER,
      },
    };

    const store = createStore(entries);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const clusterNode = result.current.nodes.find(n => n.label === LABEL.CLUSTER);
    expect(clusterNode).toBeDefined();
    const childLabels = clusterNode!.children!.map(c => c.label);
    expect(childLabels).toContain(LABEL.NAMESPACES);
    expect(childLabels).toContain(LABEL.NODES);
    expect(childLabels).toContain('Plugin Cluster View');
  });

  it('adds a plugin entry as a child of a top-level plugin item', () => {
    const entries: Record<string, SidebarEntry> = {
      mySection: {
        name: 'mySection',
        label: 'My Section',
        url: '/my-section',
        icon: 'mdi:view-dashboard',
        sidebar: DefaultSidebars.IN_CLUSTER,
      },
      myChild: {
        name: 'myChild',
        label: 'My Child',
        url: '/my-section/child',
        parent: 'mySection',
        sidebar: DefaultSidebars.IN_CLUSTER,
      },
    };

    const store = createStore(entries);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const sectionNode = result.current.nodes.find(n => n.label === 'My Section');
    expect(sectionNode).toBeDefined();
    expect(sectionNode!.children).toHaveLength(1);
    expect(sectionNode!.children![0].label).toBe('My Child');
    expect(sectionNode!.children![0].url).toBe('/my-section/child');
  });

  it('ignores plugin entries with a non-existent parent', () => {
    const entries: Record<string, SidebarEntry> = {
      orphan: {
        name: 'orphan',
        label: 'Orphan Entry',
        url: '/orphan',
        parent: 'nonExistentParent',
        sidebar: DefaultSidebars.IN_CLUSTER,
      },
    };

    const store = createStore(entries);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const allLabels = result.current.nodes.map(n => n.label);
    expect(allLabels).not.toContain('Orphan Entry');
    const allChildren = result.current.nodes.flatMap(n => n.children ?? []);
    expect(allChildren.map(c => c.label)).not.toContain('Orphan Entry');
  });

  it('does not include plugin entries targeting a different sidebar', () => {
    const entries: Record<string, SidebarEntry> = {
      homePlugin: {
        name: 'homePlugin',
        label: 'Home Plugin',
        url: '/home-plugin',
        sidebar: DefaultSidebars.HOME,
      },
    };

    const store = createStore(entries);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const allLabels = result.current.nodes.map(n => n.label);
    expect(allLabels).not.toContain('Home Plugin');
  });

  it('applies sidebar filters to static items', () => {
    const filters = [(entry: SidebarEntry) => (entry.name === 'map' ? null : entry)];
    const store = createStore({}, filters);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const labels = result.current.nodes.map(n => n.label);
    expect(labels).not.toContain(LABEL.MAP);
    expect(labels).toContain(LABEL.CLUSTER);
  });

  it('applies sidebar filters to plugin items', () => {
    const entries: Record<string, SidebarEntry> = {
      keepMe: {
        name: 'keepMe',
        label: 'Keep Me',
        url: '/keep',
        sidebar: DefaultSidebars.IN_CLUSTER,
      },
      removeMe: {
        name: 'removeMe',
        label: 'Remove Me',
        url: '/remove',
        sidebar: DefaultSidebars.IN_CLUSTER,
      },
    };
    const filters = [(entry: SidebarEntry) => (entry.name === 'removeMe' ? null : entry)];

    const store = createStore(entries, filters);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.IN_CLUSTER), {
      wrapper: createWrapper(store),
    });

    const labels = result.current.nodes.map(n => n.label);
    expect(labels).toContain('Keep Me');
    expect(labels).not.toContain('Remove Me');
  });

  it('Settings node has General, Plugins, and Cluster children on the home sidebar', () => {
    const store = createStore({}, [], DefaultSidebars.HOME);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.HOME), {
      wrapper: createWrapper(store),
    });

    const settingsNode = result.current.nodes.find(n => n.label === LABEL.SETTINGS);
    expect(settingsNode).toBeDefined();
    const childLabels = settingsNode!.children!.map(c => c.label);
    expect(childLabels).toContain(LABEL.GENERAL);
    expect(childLabels).toContain(LABEL.PLUGINS);
    expect(childLabels).toContain(LABEL.CLUSTER);
  });

  it('adds a plugin entry to the home sidebar Settings node', () => {
    const entries: Record<string, SidebarEntry> = {
      customSetting: {
        name: 'customSetting',
        label: 'Custom Setting',
        url: '/settings/custom',
        parent: 'settings',
        sidebar: DefaultSidebars.HOME,
      },
    };

    const store = createStore(entries, [], DefaultSidebars.HOME);
    const { result } = renderHook(() => useNavigationTree(DefaultSidebars.HOME), {
      wrapper: createWrapper(store),
    });

    const settingsNode = result.current.nodes.find(n => n.label === LABEL.SETTINGS);
    expect(settingsNode).toBeDefined();
    const childLabels = settingsNode!.children!.map(c => c.label);
    expect(childLabels).toContain(LABEL.GENERAL);
    expect(childLabels).toContain(LABEL.PLUGINS);
    expect(childLabels).toContain('Custom Setting');
  });
});
