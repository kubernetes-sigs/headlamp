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
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import SidebarItem, { SidebarItemProps } from './SidebarItem';

vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: () => [],
}));

const theme = createMuiTheme({ name: 'light', base: 'light' });

function renderSidebarItem(props: SidebarItemProps) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <List>
          <SidebarItem {...props} />
        </List>
      </MemoryRouter>
    </ThemeProvider>
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
});
