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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClustersConf } from '../../lib/k8s';
import { createMuiTheme } from '../../lib/themes';
import { setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import AuthChooser, { PureAuthChooser } from './index';

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  testAuth: vi.fn(),
  getClusterUserInfo: vi.fn().mockResolvedValue({ username: 'unknown' }),
}));

vi.mock('../../lib/cluster', () => ({
  getCluster: vi.fn(() => 'test-cluster'),
  getClusterPrefixedPath: vi.fn((path?: string | null) => {
    const base = '/c/test-cluster';
    if (!path) {
      return base;
    }
    return base + (path[0] === '/' ? '' : '/') + path;
  }),
  getClusterGroup: vi.fn(() => ''),
}));

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => null),
  useClustersConf: vi.fn(() => {
    const clusters = store.getState().config.clusters;
    if (!clusters) return clusters;
    return Object.fromEntries(Object.entries(clusters).map(([k, v]) => [k, { ...v }]));
  }),
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

function CurrentPath() {
  const location = useLocation();

  return <div data-testid="current-route">{location.pathname}</div>;
}

describe('AuthChooser component', () => {
  let queryClient: QueryClient;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useClustersConf).mockImplementation(() => {
      const clusters = store.getState().config.clusters;
      if (!clusters) return clusters;
      return Object.fromEntries(Object.entries(clusters).map(([k, v]) => [k, { ...v }]));
    });
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

  it.each([false, true])(
    'shows the service-account error instead of OIDC login when auto-login is %s',
    async oidcAutoLogin => {
      store.dispatch(
        setConfig({
          clusters: {
            'test-cluster': {
              name: 'test-cluster',
              auth_type: 'oidc',
              uses_service_account_token: true,
            } as any,
          },
          oidcAutoLogin,
        })
      );
      const error: any = new Error('Service account token is unauthorized');
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
                    state: { from: { pathname: '/c/test-cluster/workloads' } },
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

      await waitFor(() => {
        expect(screen.getByText(/Failed to get authentication information:/i)).toBeInTheDocument();
      });
      expect(window.location.href).toBe('');
      expect(sessionStorage.getItem('oidc_return_url')).toBeNull();
    }
  );

  it('redirects from the login route to the cluster root after successful authentication', async () => {
    vi.mocked(testAuth).mockResolvedValueOnce({} as any);
    vi.mocked(useClustersConf).mockReturnValue({
      'test-cluster': {
        name: 'test-cluster',
        auth_type: '',
      } as any,
    });

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter
              initialEntries={[
                {
                  pathname: '/c/test-cluster/login',
                  state: { from: { pathname: '/c/test-cluster/' } },
                },
              ]}
            >
              <CurrentPath />
              <Route path="/c/test-cluster/login">
                <AuthChooser />
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    expect(screen.getByTestId('current-route')).toHaveTextContent('/c/test-cluster/login');

    await waitFor(() => {
      expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/c\/test-cluster\/$/);
    });
  });

  it.each([false, true])(
    'shows the service-account auth error when useToken is cached as %s',
    async useToken => {
      vi.mocked(useClustersConf).mockReturnValue({
        'test-cluster': {
          name: 'test-cluster',
          auth_type: '',
          useToken,
          uses_service_account_token: true,
        } as any,
      });
      const error: any = new Error('Service account token is unauthorized');
      error.status = 403;
      vi.mocked(testAuth).mockRejectedValue(error);

      render(
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <QueryClientProvider client={queryClient}>
              <MemoryRouter
                initialEntries={[
                  {
                    pathname: '/c/test-cluster/login',
                    state: { from: { pathname: '/c/test-cluster/' } },
                  },
                ]}
              >
                <CurrentPath />
                <Route path="/c/test-cluster/login">
                  <AuthChooser />
                </Route>
              </MemoryRouter>
            </QueryClientProvider>
          </ThemeProvider>
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Failed to get authentication information:/i)).toBeInTheDocument();
      });
      expect(screen.getByTestId('current-route')).toHaveTextContent('/c/test-cluster/login');
    }
  );

  it('does NOT redirect to IdP when testAuth fails with 502 Bad Gateway and shows error UI', async () => {
    const error: any = new Error('Bad Gateway');
    error.status = 502;
    vi.mocked(testAuth).mockRejectedValue(error);

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
    vi.mocked(testAuth).mockRejectedValue(error);

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

  it('shows OIDC rejected notice when oidc-login-attempted is set and does not auto-redirect', async () => {
    sessionStorage.setItem('oidc-login-attempted.test-cluster', 'true');

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/auth']}>
              <Route path="/auth">
                <AuthChooser />
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/The cluster did not accept your sign-in/)).toBeInTheDocument();
    });
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Use A Token')).toBeInTheDocument();
    expect(window.location.href).toBe('');
  });

  it('does not auto-redirect when logout=true in search params', async () => {
    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/auth?logout=true']}>
              <Route path="/auth">
                <AuthChooser />
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
    expect(vi.mocked(testAuth)).not.toHaveBeenCalled();
  });

  it('handles non-OIDC cluster: redirects to from on testAuth success, or token on 401, or error on 504', async () => {
    store.dispatch(
      setConfig({
        clusters: {
          'test-cluster': { name: 'test-cluster' } as any,
          'other-cluster': { name: 'other-cluster' } as any,
        },
        oidcAutoLogin: false,
      })
    );

    // 1) testAuth succeeds -> useToken = false and redirects to from
    vi.mocked(testAuth).mockResolvedValueOnce(undefined as any);
    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter
              initialEntries={[{ pathname: '/auth', state: { from: { pathname: '/target' } } }]}
            >
              <Route path="/auth">
                <AuthChooser />
              </Route>
              <Route path="/target">
                <div>Target Page</div>
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Target Page')).toBeInTheDocument();
    });

    // 2) testAuth fails with 401 -> redirects to token page
    store.dispatch(
      setConfig({
        clusters: {
          'test-cluster': { name: 'test-cluster' } as any,
        },
        oidcAutoLogin: false,
      })
    );
    const err401: any = new Error('Unauthorized');
    err401.status = 401;
    vi.mocked(testAuth).mockRejectedValueOnce(err401);

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/auth']}>
              <Route path="/auth">
                <AuthChooser />
              </Route>
              <Route exact path="/c/test-cluster/token">
                <div>Token Page</div>
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Token Page')).toBeInTheDocument();
    });

    // 3) testAuth fails with 504 -> shows error and Try Again button works
    store.dispatch(
      setConfig({
        clusters: {
          'test-cluster': { name: 'test-cluster' } as any,
        },
        oidcAutoLogin: false,
      })
    );
    const err504: any = new Error('Gateway Timeout');
    err504.status = 504;
    vi.mocked(testAuth).mockRejectedValueOnce(err504);

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/auth']}>
              <Route path="/auth">
                <AuthChooser />
              </Route>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'translation|Try Again' })).toBeInTheDocument();
    });

    vi.mocked(testAuth).mockClear();
    vi.mocked(testAuth).mockResolvedValueOnce(undefined as any);
    fireEvent.click(screen.getByRole('button', { name: 'translation|Try Again' }));
    await waitFor(() => {
      expect(vi.mocked(testAuth)).toHaveBeenCalledTimes(1);
    });
  });

  it('handles PureAuthChooser token button and Back button click/keyboard events', () => {
    const handleOidcAuth = vi.fn();
    const handleTokenAuth = vi.fn();
    const handleTryAgain = vi.fn();
    const handleBackButtonPress = vi.fn();

    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/auth']}>
              <PureAuthChooser
                title="Authentication"
                testingTitle="Getting auth info"
                testingAuth={false}
                error={null}
                oauthUrl="http://localhost/oidc"
                clusterAuthType="oidc"
                handleOidcAuth={handleOidcAuth}
                handleTokenAuth={handleTokenAuth}
                handleTryAgain={handleTryAgain}
                handleBackButtonPress={handleBackButtonPress}
                clusterName="test-cluster"
              />
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use A Token' }));
    expect(handleTokenAuth).toHaveBeenCalledTimes(1);

    const backBtn = screen.getByText('translation|Back').closest('[role="button"]')!;
    fireEvent.click(backBtn);
    fireEvent.keyDown(backBtn, { key: 'Enter' });
    fireEvent.keyDown(backBtn, { key: ' ' });
    fireEvent.keyDown(backBtn, { key: 'Enter', repeat: true });
    expect(handleBackButtonPress).toHaveBeenCalledTimes(3);
  });
});
