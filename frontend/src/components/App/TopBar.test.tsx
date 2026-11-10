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

import { Icon } from '@iconify/react';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logout } from '../../lib/auth';
import { useSelectedClusters } from '../../lib/k8s';
import { canLogoutFromProvider } from '../../lib/k8s/clusterAuthType';
import { redirectToOIDCLogout } from '../../lib/oidcLogout';
import TopBar, { AppBarActionsMenu } from './TopBar';

// ── Mocks needed to prevent circular-dependency crashes when TopBar.tsx is ──
// imported (it transitively loads k8s resource classes through lib/k8s and
// several child components).

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(),
  useClustersConf: vi.fn(),
  useSelectedClusters: vi.fn(() => []),
}));
vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  getClusterUserInfo: vi.fn(),
}));
vi.mock('../../lib/k8s/clusterAuthType', () => ({
  canLogoutFromProvider: vi.fn(),
}));
vi.mock('../../lib/auth', () => ({ logout: vi.fn() }));
vi.mock('../../lib/oidcLogout', () => ({ redirectToOIDCLogout: vi.fn() }));
vi.mock('../../helpers/getProductInfo', () => ({
  getDisplayVersion: vi.fn(() => '0.0.0'),
  getProductName: vi.fn(() => 'Headlamp'),
}));
vi.mock('../../lib/router/createRouteURL', () => ({ createRouteURL: vi.fn(() => '/') }));
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      actionButtons: {
        appBarActions: [],
        appBarActionsProcessors: [],
      },
      sidebar: {
        isSidebarOpen: false,
        isSidebarOpenUserSelected: false,
      },
      ui: {
        hideAppBar: false,
      },
    })
  ),
}));
vi.mock('../../redux/uiSlice', () => ({ uiSlice: { actions: { setVersionDialogOpen: vi.fn() } } }));
vi.mock('../cluster/Chooser', () => ({
  ClusterTitle: () => null,
  useClusterTitleVisible: vi.fn(() => false),
}));
vi.mock('../globalSearch/GlobalSearch', () => ({ GlobalSearch: () => null }));
vi.mock('../Sidebar/HeadlampButton', () => ({ default: () => null }));
vi.mock('../Sidebar/sidebarSlice', () => ({ setWhetherSidebarOpen: vi.fn() }));
vi.mock('./AppLogo', () => ({ AppLogo: () => null }));
vi.mock('../App/Settings', () => ({
  navigateToClusterSettings: vi.fn(),
  SettingsButton: () => null,
}));
vi.mock('@tanstack/react-query', () => ({ useQueries: vi.fn(() => []) }));
vi.mock('react-redux', () => ({
  useDispatch: vi.fn(() => vi.fn()),
  useSelector: vi.fn(),
}));
vi.mock('react-router-dom', () => ({
  useHistory: vi.fn(() => ({ push: vi.fn(), location: { pathname: '/' } })),
}));
vi.mock('react-i18next', () => ({ useTranslation: vi.fn(() => ({ t: (k: string) => k })) }));
vi.mock('@mui/material/useMediaQuery', () => ({ default: vi.fn(() => false) }));

// ErrorBoundary uses a React class component — render it as a pass-through in tests.
vi.mock('../common/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseSelectedClusters = vi.mocked(useSelectedClusters);
const mockProviderLogout = vi.mocked(canLogoutFromProvider);
const mockLogout = vi.mocked(logout);
const mockRedirectToOIDCLogout = vi.mocked(redirectToOIDCLogout);
const theme = createTheme({
  palette: {
    navbar: {
      background: '#fff',
      color: '#000',
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSelectedClusters.mockReturnValue([]);
});

describe('AppBarActionsMenu', () => {
  it('passes a MenuItem element action through without double-wrapping', () => {
    const action = {
      id: 'test-action',
      action: <MenuItem>direct item</MenuItem>,
    };
    render(<AppBarActionsMenu appBarActions={[action]} />);

    // Exactly one menuitem, not two nested ones.
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);

    // The menuitem must not contain another menuitem or button inside it.
    expect(items[0].querySelector('[role="menuitem"], [role="button"], button')).toBeNull();
  });

  it('wraps a non-MenuItem element action in a MenuItem', () => {
    const action = {
      id: 'test-action',
      action: <span>element action</span>,
    };
    render(<AppBarActionsMenu appBarActions={[action]} />);

    const item = screen.getByRole('menuitem');
    expect(item).toHaveTextContent('element action');
  });

  it('wraps a function action in a MenuItem', () => {
    const action = {
      id: 'test-action',
      action: () => <span>inner content</span>,
    };
    render(<AppBarActionsMenu appBarActions={[action]} />);

    const item = screen.getByRole('menuitem');
    expect(item).toHaveTextContent('inner content');
  });

  it('renders nothing for a null action', () => {
    const action = { id: 'test-action', action: null };
    const { container } = render(<AppBarActionsMenu appBarActions={[action]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a false action', () => {
    const action = { id: 'test-action', action: false as unknown as null };
    const { container } = render(<AppBarActionsMenu appBarActions={[action]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('USER mobile action: single menuitem with no nested interactive element', () => {
    // This mirrors the USER action in PureTopBar's allAppBarActionsMobile.
    // The old code used a Box role="button" inside the MenuItem — this test
    // would have caught that regression.
    const handleMenuClose = vi.fn();
    const handleProfileMenuOpen = vi.fn();

    const action = {
      id: 'user-action',
      action: (
        <MenuItem
          aria-controls="user-menu"
          aria-haspopup="true"
          onClick={event => {
            handleMenuClose();
            handleProfileMenuOpen(event);
          }}
        >
          <ListItemIcon>
            <Icon icon="mdi:account" />
          </ListItemIcon>
          <ListItemText>Account of current user</ListItemText>
        </MenuItem>
      ),
    };

    render(<AppBarActionsMenu appBarActions={[action]} />);

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('[role="button"], [role="menuitem"], button')).toBeNull();
  });
});

describe('TopBar logout', () => {
  it('clears every selected cluster before redirecting through the first OIDC cluster', async () => {
    mockUseSelectedClusters.mockReturnValue([
      'token-cluster',
      'first-oidc-cluster',
      'second-oidc-cluster',
    ]);
    mockProviderLogout.mockImplementation(cluster => cluster !== 'token-cluster');
    mockLogout.mockResolvedValue(undefined);
    mockRedirectToOIDCLogout.mockResolvedValue(undefined);

    render(
      <ThemeProvider theme={theme}>
        <TopBar />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Account of current user' }));
    fireEvent.click(await screen.findByText('Log out from all'));

    await waitFor(() => {
      expect(mockRedirectToOIDCLogout).toHaveBeenCalledWith('first-oidc-cluster');
    });
    expect(mockLogout.mock.calls).toEqual([
      ['token-cluster', true],
      ['first-oidc-cluster', true],
      ['second-oidc-cluster', true],
    ]);
    expect(mockRedirectToOIDCLogout).toHaveBeenCalledTimes(1);
  });

  it('redirects through OIDC even when its preliminary token clear fails', async () => {
    mockUseSelectedClusters.mockReturnValue(['oidc-cluster', 'token-cluster']);
    mockProviderLogout.mockImplementation(cluster => cluster === 'oidc-cluster');
    mockLogout.mockImplementation(cluster =>
      cluster === 'oidc-cluster'
        ? Promise.reject(new Error('clear failed'))
        : Promise.resolve(undefined)
    );
    mockRedirectToOIDCLogout.mockResolvedValue(undefined);

    render(
      <ThemeProvider theme={theme}>
        <TopBar />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Account of current user' }));
    fireEvent.click(await screen.findByText('Log out from all'));

    await waitFor(() => {
      expect(mockRedirectToOIDCLogout).toHaveBeenCalledWith('oidc-cluster');
    });
    expect(mockRedirectToOIDCLogout.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...mockLogout.mock.invocationCallOrder)
    );
  });
});
