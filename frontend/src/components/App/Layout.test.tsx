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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBackstageToken,
  setRuntimeBackstageOrigins,
} from '../../helpers/backstageMessageReceiver';
import { setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';

const mockRequest = vi.fn();

vi.mock('../../lib/k8s/api/v1/clusterRequests', () => ({
  request: (...args: unknown[]) => mockRequest(...args),
}));

vi.mock('../../helpers/isBackstage', () => ({
  isBackstage: () => true,
}));

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

vi.mock('./TopBar', () => ({ default: () => null }));
vi.mock('./RouteSwitcher', () => ({ default: () => null }));
vi.mock('./VersionDialog', () => ({ default: () => null }));
vi.mock('./AllowedNamespacesSelectorGate', () => ({
  default: () => null,
  AllowedNamespacesSelectorProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./ResourceShortcuts', () => ({ default: () => null }));
vi.mock('./Settings/ShortcutsSettings', () => ({ default: () => null }));
vi.mock('../activity/Activity', () => ({ ActivitiesRenderer: () => null }));
vi.mock('../common/ActionsNotifier', () => ({ default: () => null }));
vi.mock('../common/AlertNotification', () => ({ default: () => null }));
vi.mock('../common/Resource/DetailsDrawer', () => ({ default: () => null }));
vi.mock('../common', () => ({
  ErrorPage: () => null,
  Loader: () => null,
}));

import Layout from './Layout';

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>
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
    mockRequest.mockResolvedValue({ clusters: [] });
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
    mockRequest.mockReturnValue(
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
