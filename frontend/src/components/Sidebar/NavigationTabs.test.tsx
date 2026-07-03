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
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
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

describe('NavigationTabs', () => {
  const mockStore = (selectedItem: string | null) => {
    return configureStore({
      reducer: reducers,
      preloadedState: {
        sidebar: {
          entries: {},
          filters: [],
          homeFilters: [],
          selected: { item: selectedItem, sidebar: DefaultSidebars.IN_CLUSTER },
          isVisible: true,
          isSidebarOpen: false,
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
});
