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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import store from '../../redux/stores/store';
import SidebarItem, { SidebarItemProps } from './SidebarItem';

vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: () => [],
}));

const theme = createMuiTheme({ name: 'light', base: 'light' });

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
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
      <Provider store={store}>
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
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <MemoryRouter>
            <TwoGroupSidebar selectedGroup="groupA" />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );
    expect(screen.queryByRole('button', { name: /child a/i })).not.toBeInTheDocument();
  });
});
