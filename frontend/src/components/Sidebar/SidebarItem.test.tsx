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

import List from '@mui/material/List';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Provider } from 'react-redux';
import { MemoryRouter, Router } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import reducers from '../../redux/reducers/reducers';
import SidebarItem, { SidebarItemProps } from './SidebarItem';

vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: () => [],
}));

const theme = createMuiTheme({ name: 'light', base: 'light' });

function createTestStore() {
  return configureStore({
    reducer: reducers,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });
}

let testStore = createTestStore();

beforeEach(() => {
  testStore = createTestStore();
});

function renderWithProviders(ui: React.ReactElement, storeInstance = testStore) {
  return render(
    <Provider store={storeInstance}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>{ui}</MemoryRouter>
      </ThemeProvider>
    </Provider>
  );
}

function renderSidebarItem(props: SidebarItemProps) {
  return renderWithProviders(
    <List>
      <SidebarItem {...props} />
    </List>
  );
}

describe('SidebarItem', () => {
  it('renders subheader entries as non-clickable section headers', () => {
    renderSidebarItem({
      name: 'plugin-section',
      label: 'Plugin Section',
      entryType: 'subheader',
      url: '/ignored',
      icon: 'mdi:comment-quote',
    });

    const subheader = screen.getByText('Plugin Section');

    expect(subheader).toHaveClass('MuiListSubheader-root');
    expect(screen.queryByRole('link', { name: /plugin section/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /plugin section/i })).not.toBeInTheDocument();
  });

  it('renders subheader entries as dividers when the sidebar is collapsed', () => {
    const { container } = renderSidebarItem({
      name: 'plugin-section',
      label: 'Plugin Section',
      entryType: 'subheader',
      fullWidth: false,
    });

    expect(screen.queryByText('Plugin Section')).not.toBeInTheDocument();
    expect(container.querySelector('.MuiDivider-root')).toBeInTheDocument();
  });

  it('wraps subheader child lists in list items', () => {
    const { container } = renderSidebarItem({
      name: 'plugin-section',
      label: 'Plugin Section',
      entryType: 'subheader',
      subList: [
        {
          name: 'plugin-child',
          label: 'Plugin Child',
          url: '/plugin-child',
        },
      ],
    });
    const rootList = container.querySelector('ul');

    expect(screen.getByRole('button', { name: /plugin child/i })).toBeInTheDocument();
    expect(Array.from(rootList?.children ?? []).map(child => child.tagName)).toEqual(['LI', 'LI']);
  });

  it('does not render hidden subheader entries', () => {
    const { container } = renderSidebarItem({
      name: 'plugin-section',
      label: 'Plugin Section',
      entryType: 'subheader',
      hide: true,
    });

    expect(screen.queryByText('Plugin Section')).not.toBeInTheDocument();
    expect(container.querySelector('.MuiDivider-root')).not.toBeInTheDocument();
  });

  it('applies custom sx after the default subheader styles', () => {
    renderSidebarItem({
      name: 'plugin-section',
      label: 'Plugin Section',
      entryType: 'subheader',
      sx: {
        fontSize: '1.1rem',
        fontWeight: 800,
        textTransform: 'none',
      },
    });

    const subheader = screen.getByText('Plugin Section');

    expect(subheader).toHaveStyle({
      fontSize: '1.1rem',
      fontWeight: '800',
      textTransform: 'none',
    });
  });

  it('toggles expandable submenus on click', async () => {
    renderSidebarItem({
      name: 'workloads',
      label: 'Workloads',
      subList: [
        {
          name: 'pods',
          label: 'Pods',
          url: '/pods',
        },
      ],
    });

    const parentButton = screen.getByRole('button', { name: /workloads/i });
    expect(parentButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /pods/i })).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(parentButton);
    expect(await screen.findByRole('button', { name: /pods/i })).toBeInTheDocument();
    expect(parentButton).toHaveAttribute('aria-expanded', 'true');

    // Click again to collapse
    fireEvent.click(parentButton);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /pods/i })).not.toBeInTheDocument();
    });
    expect(parentButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles an initially selected submenu closed and open on click', async () => {
    renderSidebarItem({
      name: 'workloads-selected',
      label: 'Workloads Selected',
      isSelected: true,
      subList: [
        {
          name: 'pods-selected',
          label: 'Pods Selected',
          url: '/pods',
        },
      ],
    });

    const parentButton = screen.getByRole('button', { name: /workloads selected/i });
    expect(parentButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /pods selected/i })).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(parentButton);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /pods selected/i })).not.toBeInTheDocument();
    });
    expect(parentButton).toHaveAttribute('aria-expanded', 'false');

    // Click again to expand
    fireEvent.click(parentButton);
    expect(await screen.findByRole('button', { name: /pods selected/i })).toBeInTheDocument();
    expect(parentButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('sets aria-expanded to false when sidebar is collapsed even if expanded or selected', () => {
    renderSidebarItem({
      name: 'workloads-collapsed',
      label: 'Workloads Collapsed',
      isSelected: true,
      fullWidth: false,
      subList: [
        {
          name: 'pods-collapsed',
          label: 'Pods Collapsed',
          url: '/pods',
        },
      ],
    });

    const parentButton = screen.getByRole('button', { name: /workloads collapsed/i });
    expect(parentButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /pods collapsed/i })).not.toBeInTheDocument();
  });

  it('toggles expandable submenus on click for external URLs', async () => {
    renderSidebarItem({
      name: 'external-parent',
      label: 'External Parent',
      url: 'https://headlamp.dev',
      subList: [
        {
          name: 'external-child',
          label: 'External Child',
          url: '/external-child',
        },
      ],
    });

    const parentLink = screen.getByRole('button', { name: /external parent/i });
    expect(parentLink).toHaveAttribute('href', 'https://headlamp.dev');
    expect(parentLink).toHaveAttribute('target', '_blank');
    expect(parentLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(parentLink).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /external child/i })).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(parentLink);
    expect(await screen.findByRole('button', { name: /external child/i })).toBeInTheDocument();
    expect(parentLink).toHaveAttribute('aria-expanded', 'true');

    // Click again to collapse
    fireEvent.click(parentLink);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /external child/i })).not.toBeInTheDocument();
    });
    expect(parentLink).toHaveAttribute('aria-expanded', 'false');
  });

  it('preserves href and target destination on external links', () => {
    renderSidebarItem({
      name: 'external-link',
      label: 'External Link',
      url: 'https://headlamp.dev',
    });

    const link = screen.getByRole('button', { name: /external link/i });
    expect(link).toHaveAttribute('href', 'https://headlamp.dev');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('persists selected parent expansion when selection moves away while honoring explicit collapse', async () => {
    function TwoGroupSidebar({ selectedGroup }: { selectedGroup: 'groupA' | 'groupB' }) {
      return (
        <List>
          <SidebarItem
            name="groupA"
            label="Group A"
            isSelected={selectedGroup === 'groupA'}
            subList={[{ name: 'childA', label: 'Child A', url: '/childA' }]}
          />
          <SidebarItem
            name="groupB"
            label="Group B"
            isSelected={selectedGroup === 'groupB'}
            subList={[{ name: 'childB', label: 'Child B', url: '/childB' }]}
          />
        </List>
      );
    }

    const { rerender } = renderWithProviders(<TwoGroupSidebar selectedGroup="groupA" />);

    // Initially Group A is selected (expanded) and Group B is not
    expect(screen.getByRole('button', { name: /group a/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: /child a/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /group b/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('button', { name: /child b/i })).not.toBeInTheDocument();

    // Click Group B header to expand it
    fireEvent.click(screen.getByRole('button', { name: /group b/i }));
    expect(await screen.findByRole('button', { name: /child b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /group b/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    // Group A should still be expanded
    expect(screen.getByRole('button', { name: /child a/i })).toBeInTheDocument();

    // Now navigation moves selection away from Group A to Group B
    rerender(
      <Provider store={testStore}>
        <ThemeProvider theme={theme}>
          <MemoryRouter>
            <TwoGroupSidebar selectedGroup="groupB" />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );

    // Group A should persist its expansion even though selection moved away
    expect(screen.getByRole('button', { name: /group a/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: /child a/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /child b/i })).toBeInTheDocument();

    // Explicitly collapse Group A
    fireEvent.click(screen.getByRole('button', { name: /group a/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /child a/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /group a/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );

    // Re-navigating to group A honors the explicit collapse
    rerender(
      <Provider store={testStore}>
        <ThemeProvider theme={theme}>
          <MemoryRouter>
            <TwoGroupSidebar selectedGroup="groupA" />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );
    expect(screen.queryByRole('button', { name: /child a/i })).not.toBeInTheDocument();
  });

  it('stops event propagation for group headers in temporary drawer but allows leaf clicks to bubble', async () => {
    const handleDrawerClose = vi.fn();

    renderWithProviders(
      <List onClick={handleDrawerClose} onKeyDown={handleDrawerClose}>
        <SidebarItem
          name="workloads"
          label="Workloads"
          fullWidth
          subList={[
            {
              name: 'pods',
              label: 'Pods',
              url: '/pods',
            },
          ]}
        />
      </List>
    );

    const groupHeader = screen.getByRole('button', { name: /workloads/i });
    fireEvent.click(groupHeader);

    // Group header should expand without triggering drawer close
    expect(await screen.findByRole('button', { name: /pods/i })).toBeInTheDocument();
    expect(handleDrawerClose).not.toHaveBeenCalled();

    // Group header Enter keydown should not bubble to drawer close
    fireEvent.keyDown(groupHeader, { key: 'Enter' });
    expect(handleDrawerClose).not.toHaveBeenCalled();

    // Clicking leaf child should bubble and trigger drawer close
    const childButton = screen.getByRole('button', { name: /pods/i });
    fireEvent.click(childButton);
    expect(handleDrawerClose).toHaveBeenCalledTimes(1);

    // Leaf child Enter keydown should bubble and trigger drawer close
    fireEvent.keyDown(childButton, { key: 'Enter' });
    expect(handleDrawerClose).toHaveBeenCalledTimes(2);
  });

  it('preserves expansion state when clicking group icon in collapsed sidebar', () => {
    function ToggleableSidebar({ fullWidth }: { fullWidth: boolean }) {
      return (
        <List>
          <SidebarItem
            name="workloads"
            label="Workloads"
            fullWidth={fullWidth}
            subList={[
              {
                name: 'pods',
                label: 'Pods',
                url: '/pods',
              },
            ]}
          />
        </List>
      );
    }

    const { rerender } = renderWithProviders(<ToggleableSidebar fullWidth />);

    // Expand workloads in wide sidebar
    const wideHeader = screen.getByRole('button', { name: /workloads/i });
    fireEvent.click(wideHeader);
    expect(screen.getByRole('button', { name: /pods/i })).toBeInTheDocument();
    expect(testStore.getState().sidebar.expandedItems?.['workloads']).toBe(true);

    // Collapse the sidebar to compact mode
    rerender(
      <Provider store={testStore}>
        <ThemeProvider theme={theme}>
          <MemoryRouter>
            <ToggleableSidebar fullWidth={false} />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );

    // Click the collapsed icon button
    const collapsedButton = screen.getByRole('button', { name: /workloads/i });
    fireEvent.click(collapsedButton);

    // Expansion state in Redux should still be true, NOT toggled to false
    expect(testStore.getState().sidebar.expandedItems?.['workloads']).toBe(true);

    // Expand the sidebar back to wide mode
    rerender(
      <Provider store={testStore}>
        <ThemeProvider theme={theme}>
          <MemoryRouter>
            <ToggleableSidebar fullWidth />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );

    // Submenu items should still be visible because expansion was preserved
    expect(screen.getByRole('button', { name: /pods/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /workloads/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('prevents group header disclosure clicks from navigating in wide mode while preserving leaf and compact mode navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/current-page'] });

    function TestSidebar({ fullWidth }: { fullWidth: boolean }) {
      return (
        <List>
          <SidebarItem
            name="workloads"
            label="Workloads"
            url="/workloads"
            fullWidth={fullWidth}
            subList={[
              {
                name: 'pods',
                label: 'Pods',
                url: '/pods',
              },
            ]}
          />
        </List>
      );
    }

    const { rerender } = render(
      <Provider store={testStore}>
        <ThemeProvider theme={theme}>
          <Router history={history}>
            <TestSidebar fullWidth />
          </Router>
        </ThemeProvider>
      </Provider>
    );

    const groupHeader = screen.getByRole('button', { name: /workloads/i });

    // Click group header to expand
    fireEvent.click(groupHeader);
    expect(await screen.findByRole('button', { name: /pods/i })).toBeInTheDocument();
    // Route must not change
    expect(history.location.pathname).toBe('/current-page');

    // Click group header to collapse
    fireEvent.click(groupHeader);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /pods/i })).not.toBeInTheDocument();
    });
    // Route must still remain unchanged
    expect(history.location.pathname).toBe('/current-page');

    // Re-expand group header
    fireEvent.click(groupHeader);
    const childButton = await screen.findByRole('button', { name: /pods/i });

    // Leaf click MUST navigate
    fireEvent.click(childButton);
    expect(history.location.pathname).toBe('/pods');

    // Now switch to compact mode
    rerender(
      <Provider store={testStore}>
        <ThemeProvider theme={theme}>
          <Router history={history}>
            <TestSidebar fullWidth={false} />
          </Router>
        </ThemeProvider>
      </Provider>
    );

    // In compact mode, clicking group icon MUST navigate to group URL
    const compactIcon = screen.getByRole('button', { name: /workloads/i });
    fireEvent.click(compactIcon);
    expect(history.location.pathname).toBe('/workloads');
  });

  it('cancels navigation on external disclosure clicks while allowing external leaf links', () => {
    renderSidebarItem({
      name: 'external-parent',
      label: 'External Parent',
      url: 'https://headlamp.dev',
      fullWidth: true,
      subList: [
        {
          name: 'external-child',
          label: 'External Child',
          url: '/external-child',
        },
      ],
    });

    const parentLink = screen.getByRole('button', { name: /external parent/i });
    const disclosureClickEvent = createEvent.click(parentLink);
    fireEvent(parentLink, disclosureClickEvent);

    // Disclosure click on external parent cancels navigation
    expect(disclosureClickEvent.defaultPrevented).toBe(true);
  });
});
