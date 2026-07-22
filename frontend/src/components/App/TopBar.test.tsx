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

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { setWhetherSidebarOpen } from '../Sidebar/sidebarSlice';
import TopBar from './TopBar';
import { handleLogoutPathUpdate } from './TopBar.utils';

describe('handleLogoutPathUpdate', () => {
  let historyPush: Mock;

  beforeEach(() => {
    historyPush = vi.fn();
  });

  it('redirects to / when no cluster is specified (logout from all)', () => {
    handleLogoutPathUpdate(undefined, '/c/cluster1+cluster2/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('redirects to / when clusterToLogout is a single cluster in the path', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('removes cluster from multi-cluster path and keeps remaining', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1+cluster2/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/cluster2/pods');
  });

  it('removes cluster from middle of multi-cluster path', () => {
    handleLogoutPathUpdate('cluster2', '/c/cluster1+cluster2+cluster3/namespaces', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/cluster1+cluster3/namespaces');
  });

  it('removes last cluster from multi-cluster path and redirects to /', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1/workloads', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('redirects to / when current path has no cluster segment', () => {
    handleLogoutPathUpdate('cluster1', '/settings', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('redirects to / when current path is root', () => {
    handleLogoutPathUpdate('cluster1', '/', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('handles cluster name not found in multi-cluster path (no change, keeps all)', () => {
    handleLogoutPathUpdate('nonexistent', '/c/cluster1+cluster2/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/cluster1+cluster2/pods');
  });

  it('handles path ending with /c/clusterName (no trailing slash)', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('handles path ending with /c/clusterName/ (trailing slash)', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1/', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('handles clusters with special characters in names', () => {
    handleLogoutPathUpdate('my-cluster', '/c/my-cluster+other-cluster/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/other-cluster/pods');
  });

  it('handles path with deeply nested routes after cluster segment', () => {
    handleLogoutPathUpdate(
      'cluster2',
      '/c/cluster1+cluster2/namespaces/default/pods/my-pod',
      historyPush
    );
    expect(historyPush).toHaveBeenCalledWith('/c/cluster1/namespaces/default/pods/my-pod');
  });
});

// ---------------------------------------------------------------------------
// Global state injected into mocked useTypedSelector / useMediaQuery
// ---------------------------------------------------------------------------
let testState: Record<string, any> = {};
let testMediaQuery: Record<string, boolean> = {};
const { mockDispatch } = vi.hoisted(() => ({ mockDispatch: vi.fn() }));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('react-redux', async importOriginal => {
  const mod = await importOriginal<typeof import('react-redux')>();
  return {
    ...mod,
    useDispatch: () => mockDispatch,
  };
});

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: (state: any) => any) => selector(testState),
}));

vi.mock('@mui/material/useMediaQuery', () => ({
  __esModule: true,
  default: (query: string) => {
    const entry = Object.entries(testMediaQuery).find(([key]) => query.includes(key));
    return entry ? entry[1] : false;
  },
}));

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => 'test-cluster'),
  useClustersConf: vi.fn(() => ({})),
  useSelectedClusters: vi.fn(() => []),
}));

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  getClusterUserInfo: vi.fn(() => Promise.resolve({})),
}));

vi.mock('react-router-dom', async importOriginal => {
  const mod = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...mod,
    useHistory: () => ({ push: vi.fn(), location: { pathname: '/' } }),
  };
});

vi.mock('@tanstack/react-query', async importOriginal => {
  const mod = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...mod,
    useQueries: vi.fn(() => []),
  };
});

vi.mock('react-i18next', async importOriginal => {
  const mod = await importOriginal<typeof import('react-i18next')>();
  return {
    ...mod,
    useTranslation: () => ({
      t: (str: string) => str,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('./AppLogo', () => ({
  AppLogo: () => null,
}));

vi.mock('../Sidebar/HeadlampButton', () => ({
  default: (props: { onToggleOpen: () => void }) => (
    <button onClick={props.onToggleOpen}>Toggle</button>
  ),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
const testTheme = createTheme({
  palette: {
    navbar: { color: '#fff', background: '#1a1a2e' },
  },
});

function renderTopBar(
  sidebarState: { isSidebarOpen?: boolean; isSidebarOpenUserSelected?: boolean | undefined },
  mediaQuery: Record<string, boolean>
) {
  testMediaQuery = mediaQuery;
  testState = {
    sidebar: {
      isSidebarOpen: sidebarState.isSidebarOpen ?? true,
      isSidebarOpenUserSelected: sidebarState.isSidebarOpenUserSelected ?? undefined,
      isVisible: false,
      selected: { item: null, sidebar: null },
      entries: {},
      filters: [],
    },
    ui: { hideAppBar: false },
    actionButtons: { appBarActions: [], appBarActionsProcessors: [] },
    shortcuts: { shortcuts: {} },
  };

  mockDispatch.mockClear();

  const store = configureStore({
    reducer: (state = testState) => state,
  });

  return render(
    <ThemeProvider theme={testTheme}>
      <Provider store={store}>
        <TopBar />
      </Provider>
    </ThemeProvider>
  );
}

describe('handletoggleOpen', () => {
  it('medium screen, no user selection — toggles from closed to open', async () => {
    const user = userEvent.setup();
    renderTopBar(
      { isSidebarOpen: true, isSidebarOpenUserSelected: undefined },
      { '960': true, '599': true } // isMedium=true, isSmall=true
    );

    const toggleBtn = screen.getByRole('button', { name: 'Toggle' });
    expect(toggleBtn).toBeInTheDocument();

    await user.click(toggleBtn);

    // openSideBar = isMedium(true) && undefined === undefined ? false : true = false
    // dispatch(setWhetherSidebarOpen(!false)) = dispatch(setWhetherSidebarOpen(true))
    expect(mockDispatch).toHaveBeenCalledWith(setWhetherSidebarOpen(true));
  });

  it('large screen — toggles from open to closed', async () => {
    const user = userEvent.setup();
    renderTopBar(
      { isSidebarOpen: true, isSidebarOpenUserSelected: undefined },
      { '960': false, '599': true } // isMedium=false, isSmall=true
    );

    const toggleBtn = screen.getByRole('button', { name: 'Toggle' });
    expect(toggleBtn).toBeInTheDocument();

    await user.click(toggleBtn);

    // openSideBar = isMedium(false) && ... ? ... : true = true
    // dispatch(setWhetherSidebarOpen(!true)) = dispatch(setWhetherSidebarOpen(false))
    expect(mockDispatch).toHaveBeenCalledWith(setWhetherSidebarOpen(false));
  });

  it('medium screen, user previously selected open — toggles closed', async () => {
    const user = userEvent.setup();
    renderTopBar(
      { isSidebarOpen: true, isSidebarOpenUserSelected: true },
      { '960': true, '599': true }
    );

    const toggleBtn = screen.getByRole('button', { name: 'Toggle' });
    expect(toggleBtn).toBeInTheDocument();

    await user.click(toggleBtn);

    expect(mockDispatch).toHaveBeenCalledWith(setWhetherSidebarOpen(false));
  });

  it('medium screen, user previously selected closed — toggles open', async () => {
    const user = userEvent.setup();
    renderTopBar(
      { isSidebarOpen: false, isSidebarOpenUserSelected: false },
      { '960': true, '599': true }
    );

    const toggleBtn = screen.getByRole('button', { name: 'Toggle' });
    expect(toggleBtn).toBeInTheDocument();

    await user.click(toggleBtn);

    expect(mockDispatch).toHaveBeenCalledWith(setWhetherSidebarOpen(true));
  });

  it('large screen — toggles from closed to open', async () => {
    const user = userEvent.setup();
    renderTopBar(
      { isSidebarOpen: false, isSidebarOpenUserSelected: undefined },
      { '960': false, '599': true }
    );

    const toggleBtn = screen.getByRole('button', { name: 'Toggle' });
    expect(toggleBtn).toBeInTheDocument();

    await user.click(toggleBtn);

    expect(mockDispatch).toHaveBeenCalledWith(setWhetherSidebarOpen(true));
  });
});
