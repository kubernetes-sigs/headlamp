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
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { getCluster } from '../../lib/cluster';
import { getRoute } from '../../lib/router/getRoute';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import NavigationTabs from './NavigationTabs';
import { DefaultSidebars } from './sidebarSlice';
import { useSidebarItems } from './useSidebarItems';

vi.mock('./useSidebarItems', () => ({
  useSidebarItems: vi.fn(),
}));

vi.mock('../../lib/router', () => ({
  getRoute: vi.fn().mockReturnValue(undefined),
  createRouteURL: vi.fn().mockReturnValue('/mock-path'),
}));

const mockPush = vi.fn();
vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useHistory: () => ({ push: mockPush }) };
});

vi.mock('../../lib/router/getRoute', () => ({
  getRoute: vi.fn(),
}));

vi.mock('../../lib/router/createRouteURL', () => ({
  createRouteURL: vi.fn((name: string, params?: Record<string, string>) =>
    params ? `/route/${name}/${Object.values(params).join('/')}` : `/route/${name}`
  ),
}));

vi.mock('../../lib/cluster', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/cluster')>();
  return { ...actual, getCluster: vi.fn(() => null) };
});

describe('NavigationTabs', () => {
  beforeEach(() => {
    mockPush.mockClear();
    vi.mocked(getRoute).mockReturnValue(undefined);
    vi.mocked(getCluster).mockReturnValue(null);
  });

  const mockStore = (selectedItem: string | null, isSidebarOpen = false) => {
    return configureStore({
      reducer: reducers,
      preloadedState: {
        sidebar: {
          entries: {},
          filters: [],
          homeFilters: [],
          selected: { item: selectedItem, sidebar: DefaultSidebars.IN_CLUSTER },
          isVisible: true,
          isSidebarOpen,
        },
      },
    });
  };

  it('renders level 1 tabs correctly and highlights the correct active tab when some tabs are hidden', () => {
    const mockItems = [
      {
        name: 'network',
        label: 'Network',
        subList: [
          {
            name: 'services',
            label: 'Services',
            hide: false,
          },
          {
            name: 'endpoints',
            label: 'Endpoints',
            hide: true,
          },
          {
            name: 'NetworkPolicies',
            label: 'Network Policies',
            hide: false,
          },
        ],
      },
    ];

    vi.mocked(useSidebarItems).mockReturnValue(mockItems);

    const store = mockStore('NetworkPolicies');

    render(
      <TestContext store={store}>
        <NavigationTabs />
      </TestContext>
    );

    // Services should be rendered as a tab
    const servicesTab = screen.getByRole('tab', { name: 'Services' });
    expect(servicesTab).toBeInTheDocument();
    expect(servicesTab).toHaveAttribute('aria-selected', 'false');

    // Endpoints should not be rendered as a tab since it is hidden
    expect(screen.queryByRole('tab', { name: 'Endpoints' })).not.toBeInTheDocument();

    // Network Policies should be rendered as a tab and should be selected
    const netPoliciesTab = screen.getByRole('tab', { name: 'Network Policies' });
    expect(netPoliciesTab).toBeInTheDocument();
    expect(netPoliciesTab).toHaveAttribute('aria-selected', 'true');
  });

  const renderTabs = (selectedItem: string | null, isSidebarOpen = false) =>
    render(
      <TestContext store={mockStore(selectedItem, isSidebarOpen)}>
        <NavigationTabs />
      </TestContext>
    );

  it('renders nothing when the sidebar is open on a regular screen', () => {
    vi.mocked(useSidebarItems).mockReturnValue([
      { name: 'network', label: 'Network', subList: [{ name: 'services', label: 'Services' }] },
    ]);

    renderTabs('services', true);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('renders nothing when the selected item is not in any sidebar entry', () => {
    vi.mocked(useSidebarItems).mockReturnValue([
      { name: 'network', label: 'Network', subList: [{ name: 'services', label: 'Services' }] },
    ]);

    renderTabs('unknown-item');

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('adds the root entry as the first tab when it has its own route', () => {
    vi.mocked(getRoute).mockReturnValue({ path: '/network' } as ReturnType<typeof getRoute>);
    vi.mocked(useSidebarItems).mockReturnValue([
      { name: 'network', label: 'Network', subList: [{ name: 'services', label: 'Services' }] },
    ]);

    renderTabs('services');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual(['Network', 'Services']);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('does not add the root entry as a tab when it has no route', () => {
    vi.mocked(useSidebarItems).mockReturnValue([
      { name: 'network', label: 'Network', subList: [{ name: 'services', label: 'Services' }] },
    ]);

    renderTabs('services');

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Services']);
  });

  it('finds the root entry when the selected item is nested two levels deep', () => {
    vi.mocked(useSidebarItems).mockReturnValue([
      {
        name: 'cluster',
        label: 'Cluster',
        subList: [
          {
            name: 'crds',
            label: 'Custom Resources',
            subList: [{ name: 'my-crd', label: 'MyKind' }],
          },
          { name: 'nodes', label: 'Nodes' },
        ],
      },
    ]);

    renderTabs('my-crd');

    expect(screen.getByRole('tab', { name: 'Custom Resources' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Nodes' })).toHaveAttribute('aria-selected', 'false');
    // The nested entries show up as second level tabs.
    expect(screen.getByRole('tab', { name: 'MyKind' })).toHaveAttribute('aria-selected', 'true');
  });

  describe('level 1 tab navigation', () => {
    it('pushes the item url when a tab with a url is clicked', () => {
      vi.mocked(useSidebarItems).mockReturnValue([
        {
          name: 'settings',
          label: 'Settings',
          subList: [
            { name: 'settingsGeneral', label: 'General', url: '/settings/general' },
            { name: 'plugins', label: 'Plugins', url: '/settings/plugins' },
          ],
        },
      ]);

      renderTabs('settingsGeneral');
      fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));

      expect(mockPush).toHaveBeenCalledWith('/settings/plugins');
    });

    it('pushes the cluster prefixed url when the item uses the cluster url', () => {
      vi.mocked(getCluster).mockReturnValue('my-cluster');
      vi.mocked(useSidebarItems).mockReturnValue([
        {
          name: 'settings',
          label: 'Settings',
          subList: [
            { name: 'settingsGeneral', label: 'General', url: '/settings/general' },
            {
              name: 'settingsCluster',
              label: 'Cluster',
              url: '/settings/cluster',
              useClusterURL: true,
            },
          ],
        },
      ]);

      renderTabs('settingsGeneral');
      fireEvent.click(screen.getByRole('tab', { name: 'Cluster' }));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush.mock.calls[0][0].pathname).toContain('my-cluster');
      expect(mockPush.mock.calls[0][0].pathname).toContain('/settings/cluster');
    });

    it('only counts visible tabs when working out which tab was clicked', () => {
      vi.mocked(useSidebarItems).mockReturnValue([
        {
          name: 'settings',
          label: 'Settings',
          subList: [
            { name: 'settingsGeneral', label: 'General', url: '/settings/general' },
            { name: 'hidden', label: 'Hidden', url: '/settings/hidden', hide: true },
            { name: 'plugins', label: 'Plugins', url: '/settings/plugins' },
          ],
        },
      ]);

      renderTabs('settingsGeneral');
      fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));

      expect(mockPush).toHaveBeenCalledWith('/settings/plugins');
    });
  });

  describe('level 2 tabs', () => {
    const items = [
      {
        name: 'cluster',
        label: 'Cluster',
        subList: [
          {
            name: 'crds',
            label: 'Custom Resources',
            subList: [
              { name: 'plain', label: 'Plain' },
              { name: 'gone', label: 'Gone', hide: true },
              { name: 'with-url', label: 'WithUrl', url: '/some/url' },
              { name: 'my-crd', label: 'MyKind', isCR: true },
            ],
          },
        ],
      },
    ];

    it('renders only the visible second level tabs and marks the active one', () => {
      vi.mocked(useSidebarItems).mockReturnValue(items);

      renderTabs('with-url');

      expect(screen.queryByRole('tab', { name: 'Gone' })).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'WithUrl' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Plain' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.getAllByRole('separator')).toHaveLength(2);
    });

    it('pushes the route of a regular item', () => {
      vi.mocked(useSidebarItems).mockReturnValue(items);

      renderTabs('with-url');
      fireEvent.click(screen.getByRole('tab', { name: 'Plain' }));

      expect(mockPush).toHaveBeenCalledWith({ pathname: '/route/plain' });
    });

    it('pushes the custom resource route for a CR item', () => {
      vi.mocked(useSidebarItems).mockReturnValue(items);

      renderTabs('with-url');
      fireEvent.click(screen.getByRole('tab', { name: 'MyKind' }));

      expect(mockPush).toHaveBeenCalledWith({ pathname: '/route/customresources/my-crd' });
    });

    it('pushes the item url when the item has one', () => {
      vi.mocked(useSidebarItems).mockReturnValue(items);

      renderTabs('plain');
      fireEvent.click(screen.getByRole('tab', { name: 'WithUrl' }));

      expect(mockPush).toHaveBeenCalledWith('/some/url');
    });

    it('pushes the cluster prefixed url when the item uses the cluster url', () => {
      vi.mocked(getCluster).mockReturnValue('my-cluster');
      vi.mocked(useSidebarItems).mockReturnValue([
        {
          name: 'cluster',
          label: 'Cluster',
          subList: [
            {
              name: 'crds',
              label: 'Custom Resources',
              subList: [
                { name: 'plain', label: 'Plain' },
                { name: 'scoped', label: 'Scoped', url: '/scoped', useClusterURL: true },
              ],
            },
          ],
        },
      ]);

      renderTabs('plain');
      fireEvent.click(screen.getByRole('tab', { name: 'Scoped' }));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush.mock.calls[0][0].pathname).toContain('my-cluster');
      expect(mockPush.mock.calls[0][0].pathname).toContain('/scoped');
    });
  });
});
