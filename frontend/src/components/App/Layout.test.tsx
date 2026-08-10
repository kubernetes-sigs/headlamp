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
import { render } from '@testing-library/react';
import { useHistory } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useShortcutMod from '../../lib/useShortcut';
import { TestContext } from '../../test';
import Layout from './Layout';

vi.mock('../../lib/router/createRouteURL', () => ({
  createRouteURL: vi.fn(name => {
    if (name === 'pods') return '/c/minikube/pods';
    return '/';
  }),
}));

vi.mock('../../lib/router/getDefaultRoutes', () => ({
  getDefaultRoutes: vi.fn(() => ({
    pods: { name: 'pods', path: '/pods/:namespace/:name?', exact: true },
    configmaps: { name: 'configmaps', path: '/configmaps/:namespace/:name?', exact: true },
  })),
}));

vi.mock('../../lib/router/getRoute', () => ({
  getRoute: vi.fn(name => {
    if (name === 'pods') return { name: 'pods', path: '/pods/:namespace/:name?', exact: true };
    return null;
  }),
}));

vi.mock('../../lib/router/getRoutePath', () => ({
  getRoutePath: vi.fn(route => {
    return `/c/minikube${route.path}`;
  }),
}));

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => 'minikube'),
  useClustersConf: vi.fn(() => ({ minikube: {} })),
  useClustersVersion: vi.fn(() => ({})),
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(() => ['minikube']),
}));

vi.mock('../../lib/k8s/event', () => ({ default: class Event {} }));
vi.mock('../common/ObjectEventList', () => ({ default: () => null }));
vi.mock('../Sidebar', () => ({
  default: () => null,
  NavigationTabs: () => null,
  DefaultSidebars: { HOME: 'home', CLUSTER: 'cluster' },
}));
vi.mock('./TopBar', () => ({ default: () => null }));
vi.mock('./RouteSwitcher', () => ({ default: () => null }));
vi.mock('./VersionDialog', () => ({ default: () => null }));
vi.mock('../common/AlertNotification', () => ({ default: () => null }));

describe('Layout namespace shortcuts', () => {
  let shortcuts: Record<string, (e: any) => void> = {};

  beforeEach(() => {
    shortcuts = {};
    vi.spyOn(useShortcutMod, 'useShortcut').mockImplementation(((
      id: string,
      cb: (e: any) => void
    ) => {
      shortcuts[id] = cb;
      return () => {};
    }) as any);
  });

  it('navigates to pods with namespace extracted from query params', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let currentHistory: any;

    const ExtractHistory = () => {
      // eslint-disable-next-line
      currentHistory = useHistory();
      return null;
    };

    render(
      <QueryClientProvider client={queryClient}>
        <TestContext urlPrefix="/c/minikube/configmaps" urlSearchParams={{ namespace: 'test-ns' }}>
          <ExtractHistory />
          <Layout />
        </TestContext>
      </QueryClientProvider>
    );

    expect(shortcuts['NAVIGATE_TO_PODS']).toBeDefined();
    shortcuts['NAVIGATE_TO_PODS'](new KeyboardEvent('keydown'));

    expect(currentHistory.location.pathname).toBe('/c/minikube/pods');
    expect(currentHistory.location.search).toBe('?namespace=test-ns');
  });

  it('navigates to pods with namespace extracted from cluster-prefixed path', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let currentHistory: any;

    const ExtractHistory = () => {
      // eslint-disable-next-line
      currentHistory = useHistory();
      return null;
    };

    render(
      <QueryClientProvider client={queryClient}>
        <TestContext urlPrefix="/c/minikube/pods/kube-system/mypod">
          <ExtractHistory />
          <Layout />
        </TestContext>
      </QueryClientProvider>
    );

    expect(shortcuts['NAVIGATE_TO_PODS']).toBeDefined();
    shortcuts['NAVIGATE_TO_PODS'](new KeyboardEvent('keydown'));

    expect(currentHistory.location.pathname).toBe('/c/minikube/pods');
    expect(currentHistory.location.search).toBe('?namespace=kube-system');
  });
});
