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

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import OIDCAuth from './index';

vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

describe('OIDCAuth component', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete (window as any).opener;
    store.dispatch(
      setConfig({
        clusters: {
          'test-cluster': { name: 'test-cluster', auth_type: 'oidc' } as any,
          'my-cluster': { name: 'my-cluster', auth_type: 'oidc' } as any,
        },
      })
    );
  });

  it('renders redirecting message correctly', () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/oidc']}>
          <OIDCAuth />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('Redirecting to main page…')).toBeInTheDocument();
  });

  it('sets auth_status in localStorage when cluster is present in popup mode', async () => {
    (window as any).opener = {};
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/oidc?cluster=test-cluster']}>
          <OIDCAuth />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(localStorage.getItem('auth_status')).toBe('success');
    });
  });

  it('does not set auth_status in localStorage when cluster is absent in popup mode', () => {
    (window as any).opener = {};
    localStorage.setItem('auth_status', 'previous');

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/oidc']}>
          <OIDCAuth />
        </MemoryRouter>
      </Provider>
    );

    expect(localStorage.getItem('auth_status')).toBe('previous');
  });

  it('navigates to return URL from sessionStorage in full-page mode', async () => {
    sessionStorage.setItem('oidc_return_url', '/c/test-cluster/workloads');
    let currentPath = '';

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/auth?cluster=test-cluster']}>
          <OIDCAuth />
          <Route
            path="*"
            render={({ location }) => {
              currentPath = location.pathname;
              return null;
            }}
          />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(currentPath).toBe('/c/test-cluster/workloads');
      expect(sessionStorage.getItem('oidc_return_url')).toBeNull();
    });
  });

  it('navigates to cluster dashboard when no return URL is saved in full-page mode', async () => {
    let currentPath = '';

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/auth?cluster=my-cluster']}>
          <OIDCAuth />
          <Route
            path="*"
            render={({ location }) => {
              currentPath = location.pathname;
              return null;
            }}
          />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(currentPath).toBe('/c/my-cluster/');
    });
  });

  it('does not navigate when rendered inside a popup window', async () => {
    (window as any).opener = {};
    sessionStorage.setItem('oidc_return_url', '/c/test-cluster/workloads');
    let currentPath = '/auth';

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/auth?cluster=test-cluster']}>
          <OIDCAuth />
          <Route
            path="*"
            render={({ location }) => {
              currentPath = location.pathname;
              return null;
            }}
          />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(localStorage.getItem('auth_status')).toBe('success');
    });

    expect(currentPath).toBe('/auth');
    expect(sessionStorage.getItem('oidc_return_url')).toBe('/c/test-cluster/workloads');
  });
});
