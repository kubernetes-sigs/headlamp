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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClustersConf } from '../../lib/k8s';
import { createMuiTheme } from '../../lib/themes';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import AuthChooser, { PureAuthChooser } from './index';

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

function CurrentPath() {
  const location = useLocation();

  return <div data-testid="current-route">{location.pathname}</div>;
}

describe('AuthChooser component', () => {
  let queryClient: QueryClient;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useClustersConf).mockImplementation(() => store.getState().config.clusters);
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

  describe('when the login choice is shown (autologin off)', () => {
    const renderChooser = () =>
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

    // tokenLoginDisabled is the mark the backend puts on the clusters it refuses a token for.
    const configureOidcCluster = (
      disableTokenLogin: boolean,
      tokenLoginDisabled = disableTokenLogin
    ) =>
      store.dispatch(
        setConfig({
          clusters: {
            'test-cluster': {
              name: 'test-cluster',
              auth_type: 'oidc',
              meta_data: { auth_type: 'oidc', tokenLoginDisabled },
            } as any,
          },
          oidcAutoLogin: false,
          disableTokenLogin,
        })
      );

    it('hides "Use A Token" for an OIDC cluster when token login is disabled', async () => {
      configureOidcCluster(true);

      renderChooser();

      expect(await screen.findByText('Sign In')).toBeInTheDocument();
      expect(screen.queryByText('Use A Token')).not.toBeInTheDocument();
    });

    it('shows "Use A Token" for an OIDC cluster when token login is not disabled', async () => {
      configureOidcCluster(false);

      renderChooser();

      expect(await screen.findByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Use A Token')).toBeInTheDocument();
    });

    // auth_type is 'oidc' for any auth provider, such as gcp or azure. The backend only
    // refuses the token of the clusters it marks, so the others must keep the option.
    it('keeps "Use A Token" when the backend does not refuse the token of the cluster', async () => {
      configureOidcCluster(true, false);

      renderChooser();

      expect(await screen.findByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Use A Token')).toBeInTheDocument();
    });

    it('shows "Use A Token" for a cluster without OIDC', () => {
      render(
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <MemoryRouter>
              <PureAuthChooser
                title="Authentication"
                testingTitle="Getting auth info"
                testingAuth={false}
                error={null}
                oauthUrl=""
                clusterAuthType=""
                clusterName="token-cluster"
                disableTokenLogin={false}
                handleOidcAuth={() => {}}
                handleTokenAuth={() => {}}
                handleTryAgain={() => {}}
                handleBackButtonPress={() => {}}
              />
            </MemoryRouter>
          </ThemeProvider>
        </Provider>
      );

      expect(screen.getByText('Use A Token')).toBeInTheDocument();
    });

    // useToken survives config refreshes, so it can be left from before the cluster used OIDC.
    it('does not send a cluster that refuses tokens to the token page', async () => {
      store.dispatch(
        setConfig({
          clusters: {
            'test-cluster': {
              name: 'test-cluster',
              auth_type: 'oidc',
              useToken: true,
              meta_data: { auth_type: 'oidc', tokenLoginDisabled: true },
            } as any,
          },
          oidcAutoLogin: false,
          disableTokenLogin: true,
        })
      );

      renderChooser();

      expect(await screen.findByText('Sign In')).toBeInTheDocument();
      expect(screen.queryByText('Use A Token')).not.toBeInTheDocument();
    });

    // The mocked hook is never stale, so only the real one shows this.
    describe('with the real useClustersConf', () => {
      const mockedUseClustersConf = vi.mocked(useClustersConf);
      const mockedImplementation = mockedUseClustersConf.getMockImplementation();

      beforeEach(async () => {
        const actual = await vi.importActual<typeof import('../../lib/k8s')>('../../lib/k8s');
        mockedUseClustersConf.mockImplementation(actual.useClustersConf);
      });

      afterEach(() => {
        // Unmount first: the chooser must not render again with the other hook.
        cleanup();
        store.dispatch(setStatelessConfig({ statelessClusters: null }));
        mockedUseClustersConf.mockImplementation(mockedImplementation!);
      });

      it('hides "Use A Token" when a new config disables it for the same cluster', async () => {
        configureOidcCluster(false);

        renderChooser();

        expect(await screen.findByText('Use A Token')).toBeInTheDocument();

        act(() => {
          configureOidcCluster(true);
        });

        await waitFor(() => {
          expect(screen.queryByText('Use A Token')).not.toBeInTheDocument();
        });
        expect(screen.getByText('Sign In')).toBeInTheDocument();
      });

      it.each([
        ['an OIDC', 'oidc'],
        ['a token', ''],
      ])(
        'offers only "Sign In" when %s stateless cluster has the same name',
        async (_, authType) => {
          vi.mocked(testAuth).mockReturnValue(new Promise(() => {}));
          configureOidcCluster(true);
          store.dispatch(
            setStatelessConfig({
              statelessClusters: {
                'test-cluster': {
                  name: 'test-cluster',
                  auth_type: authType,
                  meta_data: { auth_type: authType },
                } as any,
              },
            })
          );

          renderChooser();

          expect(await screen.findByText('Sign In')).toBeInTheDocument();
          expect(screen.queryByText('Use A Token')).not.toBeInTheDocument();
          expect(testAuth).not.toHaveBeenCalled();
        }
      );
    });
  });
});
