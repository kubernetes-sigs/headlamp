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

import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import nock from 'nock';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppUrl } from '../../helpers/getAppUrl';
import { createMuiTheme } from '../../lib/themes';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import OIDCAuth, { resetHandledAuthUrls } from '../oidcauth';
import AuthChooser from './index';

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  testAuth: vi.fn(),
  getClusterUserInfo: vi.fn().mockResolvedValue({ username: 'unknown' }),
}));

vi.mock('../../lib/cluster', () => ({
  getCluster: vi.fn(() => 'test-cluster'),
  getClusterPrefixedPath: vi.fn(() => '/c/test-cluster/'),
  getClusterGroup: vi.fn(() => ''),
}));

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => null),
  useClustersConf: vi.fn(() => store.getState().config.clusters),
  useClustersVersion: vi.fn(() => ({})),
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(() => []),
}));

vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: any) => {
        if (params?.errorMessage) {
          return `${key} ${params.errorMessage}`;
        }
        return key;
      },
    }),
  };
});

import { testAuth } from '../../lib/k8s/api/v1/clusterApi';

describe('AuthChooser component', () => {
  let queryClient: QueryClient;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(testAuth).mockReset();
    vi.stubGlobal('indexedDB', new IDBFactory());
    store.dispatch(setStatelessConfig({ statelessClusters: {} }));
    sessionStorage.clear();
    localStorage.clear();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        href: '',
        search: '',
        pathname: '',
        origin: 'http://localhost:3000',
      },
      writable: true,
      configurable: true,
    });

    store.dispatch(
      setConfig({
        clusters: {
          'test-cluster': {
            name: 'test-cluster',
            auth_type: 'oidc',
            meta_data: {
              auth_type: 'oidc',
            },
          } as any,
        },
        oidcAutoLogin: true,
      })
    );
  });

  afterEach(() => {
    cleanup();
    nock.cleanAll();
    queryClient.clear();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  const theme = createMuiTheme({ name: 'light', base: 'light' });

  it('redirects to IdP when testAuth fails with 401 Unauthorized', async () => {
    const error: any = new Error('Unauthorized');
    error.status = 401;
    vi.mocked(testAuth).mockRejectedValueOnce(error);

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter
              initialEntries={[
                {
                  pathname: '/auth',
                  state: { from: { pathname: '/c/test-cluster/workloads' } },
                },
              ]}
            >
              <Route path="/auth">
                <AuthChooser>
                  <div>Children Content</div>
                </AuthChooser>
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(window.location.href).toContain('oidc?dt=');
      expect(window.location.href).toContain('cluster=test-cluster');
    });

    expect(sessionStorage.getItem('oidc_return_url')).toBe('/c/test-cluster/workloads');
  });

  it('redirects to IdP when testAuth fails with 403 Forbidden', async () => {
    const error: any = new Error('Forbidden');
    error.status = 403;
    vi.mocked(testAuth).mockRejectedValueOnce(error);

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter
              initialEntries={[
                {
                  pathname: '/auth',
                  state: { from: { pathname: '/c/test-cluster/pods' } },
                },
              ]}
            >
              <Route path="/auth">
                <AuthChooser>
                  <div>Children Content</div>
                </AuthChooser>
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(window.location.href).toContain('oidc?dt=');
      expect(window.location.href).toContain('cluster=test-cluster');
    });

    expect(sessionStorage.getItem('oidc_return_url')).toBe('/c/test-cluster/pods');
  });

  it('does NOT redirect to IdP when testAuth fails with 502 Bad Gateway and shows error UI', async () => {
    const error: any = new Error('Bad Gateway');
    error.status = 502;
    vi.mocked(testAuth).mockRejectedValueOnce(error);

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter
              initialEntries={[
                {
                  pathname: '/auth',
                  state: { from: { pathname: '/c/test-cluster/workloads' } },
                },
              ]}
            >
              <Route path="/auth">
                <AuthChooser>
                  <div>Children Content</div>
                </AuthChooser>
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to connect. Please make sure the Kubernetes cluster is running/i)
      ).toBeInTheDocument();
    });

    expect(window.location.href).toBe('');
    expect(sessionStorage.getItem('oidc_return_url')).toBeNull();
  });

  it('does NOT redirect to IdP when testAuth fails with network/server error and shows error UI', async () => {
    const error: any = new Error('Network timeout');
    error.status = 504;
    vi.mocked(testAuth).mockRejectedValueOnce(error);

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter
              initialEntries={[
                {
                  pathname: '/auth',
                  state: { from: { pathname: '/c/test-cluster/workloads' } },
                },
              ]}
            >
              <Route path="/auth">
                <AuthChooser>
                  <div>Children Content</div>
                </AuthChooser>
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to get authentication information:/i)).toBeInTheDocument();
    });

    expect(window.location.href).toBe('');
    expect(sessionStorage.getItem('oidc_return_url')).toBeNull();
  });

  describe('restricted OIDC compatibility journey', () => {
    const identityPath = '/clusters/test-cluster/apis/authentication.k8s.io/v1/selfsubjectreviews';
    const identityBody = { apiVersion: 'authentication.k8s.io/v1', kind: 'SelfSubjectReview' };
    const forbidden = { kind: 'Status', status: 'Failure', code: 403, message: 'restricted user' };
    function chooser(search = '') {
      return render(
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <QueryClientProvider client={queryClient}>
              <MemoryRouter
                initialEntries={[
                  {
                    pathname: '/auth',
                    search,
                    state: { from: { pathname: '/c/test-cluster/pods' } },
                  },
                ]}
              >
                <Route path="/auth">
                  <AuthChooser />
                </Route>
              </MemoryRouter>
            </QueryClientProvider>
          </ThemeProvider>
        </Provider>
      );
    }

    it('real restricted 403 gets one IdP attempt; actual callback prevents a repeat or credential clear', async () => {
      const actual = await vi.importActual<typeof import('../../lib/k8s/api/v1/clusterApi')>(
        '../../lib/k8s/api/v1/clusterApi'
      );
      vi.mocked(testAuth).mockImplementation(actual.testAuth);
      nock(getAppUrl()).post(identityPath, identityBody).twice().reply(403, forbidden);
      const unusedRules = nock(getAppUrl())
        .post('/clusters/test-cluster/apis/authorization.k8s.io/v1/selfsubjectrulesreviews')
        .reply(201, { status: { resourceRules: [], nonResourceRules: [], incomplete: false } });
      const clearToken = nock(getAppUrl())
        .post(/\/encoded-clusters\/.*\/clear-token/)
        .reply(200, {});
      const first = chooser();
      await waitFor(() => expect(window.location.href).toContain('oidc?dt='));
      first.unmount();
      resetHandledAuthUrls();
      const callback = render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/oidc-callback?cluster=test-cluster']}>
            <Route path="/oidc-callback">
              <OIDCAuth />
            </Route>
          </MemoryRouter>
        </Provider>
      );
      await waitFor(() =>
        expect(sessionStorage.getItem('oidc-login-attempted.test-cluster')).toBe('true')
      );
      callback.unmount();
      window.location.href = '';
      await expect(testAuth('test-cluster')).rejects.toMatchObject({ status: 403 });
      chooser();
      await screen.findByRole('button', { name: 'Sign In' });
      expect(screen.getByRole('button', { name: 'Use A Token' })).toBeInTheDocument();
      expect(window.location.href).toBe('');
      expect(sessionStorage.getItem('oidc-login-attempted.test-cluster')).toBe('true');
      expect(clearToken.isDone()).toBe(false);
      expect(unusedRules.isDone()).toBe(false);
    });

    it.each(['auto-login off', 'logout'])(
      '%s retains choices without provider redirect or probe',
      async mode => {
        if (mode === 'auto-login off')
          store.dispatch(
            setConfig({ clusters: store.getState().config.clusters, oidcAutoLogin: false })
          );
        chooser(mode === 'logout' ? '?logout=true' : '');
        await screen.findByRole('button', { name: 'Sign In' });
        expect(screen.getByRole('button', { name: 'Use A Token' })).toBeInTheDocument();
        expect(testAuth).not.toHaveBeenCalled();
        expect(window.location.href).toBe('');
      }
    );
  });
});
