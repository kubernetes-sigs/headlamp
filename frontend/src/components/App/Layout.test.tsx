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
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBackstageToken,
  setRuntimeBackstageOrigins,
} from '../../helpers/backstageMessageReceiver';
import { pluginsLoaded } from '../../plugin/pluginsSlice';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import reducers from '../../redux/reducers/reducers';
import store from '../../redux/stores/store';
import { uiSlice } from '../../redux/uiSlice';
import { TestContext } from '../../test';
import { applyAdminTheme, applyBackendThemeConfig } from './themeSlice';

vi.mock('../../lib/k8s/api/v1/clusterRequests', () => ({
  request: vi.fn(),
}));

vi.mock('../../helpers/isBackstage', () => ({
  isBackstage: vi.fn(() => true),
}));

vi.mock('../../lib/cluster', () => ({
  getCluster: vi.fn(() => null),
  getSelectedClusters: vi.fn(() => []),
}));

vi.mock('../../lib/storage', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    getSavedNamespaces: vi.fn(() => []),
  };
});

vi.mock('../../lib/themes', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    getUserSelectedThemeName: vi.fn(() => null),
  };
});

vi.mock('../../stateless/', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    fetchStatelessClusterKubeConfigs: vi.fn(),
  };
});

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => null),
  useClustersConf: vi.fn(() => ({})),
  useSelectedClusters: vi.fn(() => []),
}));

vi.mock('../../settings/fetchClusterSettings', () => ({
  useClusterDefinedSettings: vi.fn(),
}));

vi.mock('../../settings/useAdminSettings', () => ({
  useSetting: vi.fn(() => ({ value: '', disabled: false, hidden: false })),
}));

vi.mock('../Sidebar', () => ({
  default: () => null,
  NavigationTabs: () => null,
}));

vi.mock('./TopBar', () => ({ default: () => <div data-testid="topbar" /> }));
vi.mock('./RouteSwitcher', () => ({
  default: ({ requiresToken }: { requiresToken: () => boolean }) => (
    <div data-testid="route-switcher" data-requires-token={String(requiresToken())} />
  ),
}));
vi.mock('./VersionDialog', () => ({ default: () => null }));
vi.mock('./AllowedNamespacesSelectorGate', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="allowed-namespaces-gate">{children}</div>
  ),
  AllowedNamespacesSelectorProvider: ({
    clusters,
    children,
  }: {
    clusters: string[];
    children: React.ReactNode;
  }) => (
    <div data-testid="allowed-namespaces-provider" data-clusters={clusters.join(',')}>
      {children}
    </div>
  ),
}));
vi.mock('./ResourceShortcuts', () => ({ default: () => null }));
vi.mock('./Settings/ShortcutsSettings', () => ({ default: () => null }));
vi.mock('../activity/Activity', () => ({ ActivitiesRenderer: () => null }));
vi.mock('../common/ActionsNotifier', () => ({ default: () => null }));
vi.mock('../common/AlertNotification', () => ({ default: () => null }));
vi.mock('../common/Resource/DetailsDrawer', () => ({ default: () => null }));
vi.mock('../common', () => ({
  ErrorPage: () => <div data-testid="error-page" />,
  Loader: ({ title }: { title: string }) => <div data-testid="loader">{title}</div>,
}));

import { isBackstage } from '../../helpers/isBackstage';
import { getCluster, getSelectedClusters } from '../../lib/cluster';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { request } from '../../lib/k8s/api/v1/clusterRequests';
import { getSavedNamespaces } from '../../lib/storage';
import { getUserSelectedThemeName } from '../../lib/themes';
import { useSetting } from '../../settings/useAdminSettings';
import { fetchStatelessClusterKubeConfigs } from '../../stateless/';
import Layout from './Layout';

function renderLayout(urlPrefix?: string, customStore?: ReturnType<typeof configureStore>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext urlPrefix={urlPrefix} store={customStore}>
        <Layout />
      </TestContext>
    </QueryClientProvider>
  );
}

describe('Layout Backstage readiness and message receiver', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setRuntimeBackstageOrigins(undefined);
    store.dispatch(setConfig({ clusters: null, backstageOrigin: '' }));
    vi.clearAllMocks();
    vi.mocked(isBackstage).mockReturnValue(true);
    vi.mocked(request).mockResolvedValue({ clusters: [] });
    vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  });

  afterEach(() => {
    setRuntimeBackstageOrigins(undefined);
    store.dispatch(setConfig({ clusters: null, backstageOrigin: '' }));
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('notifies the single configured origin once', async () => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', 'https://backstage.example.com');

    await act(async () => {
      renderLayout();
    });

    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'HEADLAMP_READY' },
      'https://backstage.example.com'
    );
  });

  it('notifies every configured origin once each', async () => {
    vi.stubEnv(
      'REACT_APP_BACKSTAGE_ORIGIN',
      'https://backstage.example.com,https://other-backstage.example.com'
    );

    await act(async () => {
      renderLayout();
    });

    expect(window.parent.postMessage).toHaveBeenCalledTimes(2);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'HEADLAMP_READY' },
      'https://backstage.example.com'
    );
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'HEADLAMP_READY' },
      'https://other-backstage.example.com'
    );
  });

  it('sends nothing when no origin is configured', async () => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', '');

    await act(async () => {
      renderLayout();
    });

    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('announces readiness and receives credentials for asynchronous single-cluster /config', async () => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', '');

    let resolveConfig!: (value: unknown) => void;
    vi.mocked(request).mockReturnValue(
      new Promise(resolve => {
        resolveConfig = resolve;
      })
    );

    renderLayout();
    expect(window.parent.postMessage).not.toHaveBeenCalled();

    await act(async () => {
      resolveConfig({
        clusters: [{ name: 'single-cluster', server: 'https://cluster.example.com' }],
        backstageOrigin: 'https://runtime-backstage.example.com/',
      });
    });

    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'HEADLAMP_READY' },
      'https://runtime-backstage.example.com'
    );

    vi.useFakeTimers();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'BACKSTAGE_AUTH_TOKEN', payload: { token: 'runtime-token' } },
        origin: 'https://runtime-backstage.example.com',
      })
    );
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBe('runtime-token');
  });
});

describe('Layout rendering, config merging, and theme handling', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setRuntimeBackstageOrigins(undefined);
    vi.mocked(isBackstage).mockReturnValue(false);
    vi.mocked(getSelectedClusters).mockReturnValue([]);
    vi.mocked(getCluster).mockReturnValue(null);
    vi.mocked(getSavedNamespaces).mockReturnValue([]);
    vi.mocked(getUserSelectedThemeName).mockReturnValue(undefined as any);
    vi.mocked(useCluster).mockReturnValue(null);
    vi.mocked(useClustersConf).mockReturnValue({});
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    vi.mocked(useSetting).mockReturnValue({ value: '', disabled: false, hidden: false });
    store.dispatch(pluginsLoaded());
    store.dispatch(applyBackendThemeConfig({}));
    store.dispatch(uiSlice.actions.setIsFullWidth(false));
    store.dispatch(
      setConfig({
        clusters: null,
        clusterSources: [],
        isDynamicClusterEnabled: false,
        defaultLightTheme: undefined,
        defaultDarkTheme: undefined,
        forceTheme: undefined,
        backstageOrigin: '',
      })
    );
    store.dispatch(setStatelessConfig({ statelessClusters: null }));
    vi.clearAllMocks();
    vi.mocked(isBackstage).mockReturnValue(false);
    vi.mocked(request).mockResolvedValue({ clusters: [] });
  });

  afterEach(() => {
    delete (window as { desktopApi?: unknown }).desktopApi;
    store.dispatch(
      setConfig({
        clusters: null,
        clusterSources: [],
        isDynamicClusterEnabled: false,
        defaultLightTheme: undefined,
        defaultDarkTheme: undefined,
        forceTheme: undefined,
        backstageOrigin: '',
      })
    );
    store.dispatch(setStatelessConfig({ statelessClusters: null }));
    vi.restoreAllMocks();
  });

  it('renders Layout when plugins are loaded and theme config is ready', () => {
    const { getByTestId } = renderLayout();
    expect(getByTestId('route-switcher')).toBeTruthy();
  });

  it('dispatches applyBackendThemeConfig on fetchConfig error when theme config is not ready', async () => {
    const customStore = configureStore({
      reducer: reducers,
      preloadedState: {
        ...store.getState(),
        theme: {
          ...store.getState().theme,
          backendConfigReady: false,
        },
      },
    });
    let rejectRequest: (err: Error) => void = () => {};
    vi.mocked(request).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      })
    );

    const { getByTestId } = renderLayout(undefined, customStore);
    expect(getByTestId('loader')).toBeTruthy();

    await act(async () => {
      rejectRequest(new Error('network error'));
    });

    await waitFor(() => {
      expect(getByTestId('route-switcher')).toBeTruthy();
    });
    expect(customStore.getState().theme.backendConfigReady).toBe(true);
    expect(vi.mocked(request)).toHaveBeenCalled();
  });

  it('merges updated cluster configs, preserves useToken, merges stateless clusters, and fetches dynamic clusters', async () => {
    store.dispatch(
      setConfig({
        clusters: {
          existing: {
            name: 'existing',
            server: 'https://old.example.com',
            auth_type: '',
            useToken: false,
          },
        },
        backstageOrigin: '',
        clusterSources: [],
      })
    );
    store.dispatch(
      setStatelessConfig({
        statelessClusters: {
          stateless1: {
            name: 'stateless1',
            server: 'https://stateless.example.com',
            auth_type: '',
          },
        },
      })
    );

    vi.mocked(request).mockResolvedValue({
      clusters: [{ name: 'existing', server: 'https://new.example.com' }],
      clusterSources: [{ source: 'kubeconfig' }],
      adminSettings: { theme: 'dark' },
      isDynamicClusterEnabled: true,
      defaultLightTheme: 'light',
      defaultDarkTheme: 'dark',
      forceTheme: false,
    });

    await act(async () => {
      renderLayout();
    });

    const state = store.getState().config;
    expect(state.clusters?.existing?.server).toBe('https://new.example.com');
    expect(state.clusters?.existing?.useToken).toBe(false);
    expect(state.clusters?.stateless1?.name).toBe('stateless1');
    expect(vi.mocked(fetchStatelessClusterKubeConfigs)).toHaveBeenCalled();
  });

  it('does not overwrite config when fetched config is identical', async () => {
    const cluster = { name: 'same', server: 'https://same.example.com', auth_type: '' };
    store.dispatch(
      setConfig({
        clusters: { same: cluster },
        backstageOrigin: '',
        clusterSources: [],
      })
    );
    const initialClusters = store.getState().config.clusters;

    vi.mocked(request).mockResolvedValue({
      clusters: [cluster],
      clusterSources: [],
    });

    await act(async () => {
      renderLayout();
    });

    expect(vi.mocked(request)).toHaveBeenCalled();
    expect(store.getState().config.clusters).toBe(initialClusters);
  });

  it('applies admin theme when restricted, or falls back to user theme when unrestricted, and skips when forceTheme is set', async () => {
    vi.mocked(request).mockRejectedValue(new Error('skip config fetch'));
    vi.mocked(useSetting).mockReturnValue({ value: 'dark', disabled: true, hidden: false });
    await act(async () => {
      renderLayout();
    });
    expect(store.getState().theme.name).toBe('dark');

    vi.mocked(useSetting).mockReturnValue({ value: 'dark', disabled: false, hidden: false });
    vi.mocked(getUserSelectedThemeName).mockReturnValue('light');
    await act(async () => {
      renderLayout();
    });
    expect(store.getState().theme.name).toBe('light');

    store.dispatch(applyAdminTheme('light'));
    store.dispatch(setConfig({ clusters: null, forceTheme: 'light' }));
    vi.mocked(useSetting).mockReturnValue({ value: 'dark', disabled: true, hidden: false });
    await act(async () => {
      renderLayout();
    });
    expect(store.getState().theme.name).toBe('light');
  });

  it('loads saved namespaces when cluster is active and renders AllowedNamespacesSelectorGate for selected clusters', async () => {
    vi.mocked(request).mockRejectedValue(new Error('skip config fetch'));
    vi.mocked(useCluster).mockReturnValue('my-cluster');
    vi.mocked(getSavedNamespaces).mockReturnValue(['default', 'kube-system']);
    vi.mocked(useClustersConf).mockReturnValue({
      'my-cluster': { name: 'my-cluster', useToken: false } as any,
      'other-cluster': { name: 'other-cluster' } as any,
    });
    vi.mocked(useSelectedClusters).mockReturnValue(['my-cluster']);
    vi.mocked(getCluster).mockReturnValue('my-cluster');

    store.dispatch(
      setConfig({
        clusters: {
          'my-cluster': { name: 'my-cluster', auth_type: '', useToken: false },
        },
      })
    );

    let result!: ReturnType<typeof renderLayout>;
    await act(async () => {
      result = renderLayout('/project/my-proj');
    });

    expect(vi.mocked(getSavedNamespaces)).toHaveBeenCalledWith('my-cluster');
    const provider = result.getByTestId('allowed-namespaces-provider');
    expect(provider.getAttribute('data-clusters')).toContain('my-cluster');
    expect(provider.getAttribute('data-clusters')).toContain('other-cluster');
    expect(result.getByTestId('route-switcher').getAttribute('data-requires-token')).toBe('false');
  });

  it('renders up to 2 ClusterNotFoundPopup alerts for missing URL clusters and handles desktopApi link', async () => {
    vi.mocked(useClustersConf).mockReturnValue({
      valid: { name: 'valid' } as any,
    });
    vi.mocked(getSelectedClusters).mockReturnValue(['missing-1', 'missing-2', 'missing-3']);
    (window as { desktopApi?: unknown }).desktopApi = {};
    store.dispatch(uiSlice.actions.setIsFullWidth(true));

    let result!: ReturnType<typeof renderLayout>;
    await act(async () => {
      result = renderLayout();
    });

    expect(result.getByText(/missing-1/)).toBeTruthy();
    expect(result.getByText(/missing-2/)).toBeTruthy();
    expect(result.queryByText(/missing-3/)).toBeNull();
    const links = result.getAllByText('Choose another cluster');
    expect(links[0].closest('a')?.getAttribute('href')).toBe('#');
  });

  it('renders UI panels on left, top, bottom, and right sides', async () => {
    const customStore = configureStore({
      reducer: reducers,
      preloadedState: store.getState(),
    });
    customStore.dispatch(
      uiSlice.actions.addUIPanel({
        id: 'panel-l',
        side: 'left',
        component: () => <div data-testid="p-left" />,
      })
    );
    customStore.dispatch(
      uiSlice.actions.addUIPanel({
        id: 'panel-t',
        side: 'top',
        component: () => <div data-testid="p-top" />,
      })
    );
    customStore.dispatch(
      uiSlice.actions.addUIPanel({
        id: 'panel-b',
        side: 'bottom',
        component: () => <div data-testid="p-bottom" />,
      })
    );
    customStore.dispatch(
      uiSlice.actions.addUIPanel({
        id: 'panel-r',
        side: 'right',
        component: () => <div data-testid="p-right" />,
      })
    );

    let result!: ReturnType<typeof renderLayout>;
    await act(async () => {
      result = renderLayout(undefined, customStore);
    });

    expect(result.getByTestId('p-left')).toBeTruthy();
    expect(result.getByTestId('p-top')).toBeTruthy();
    expect(result.getByTestId('p-bottom')).toBeTruthy();
    expect(result.getByTestId('p-right')).toBeTruthy();
  });
});
