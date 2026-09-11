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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import store from '../../redux/stores/store';
import AuthChooser from '.';

const { clusters, testAuthMock } = vi.hoisted(() => ({
  clusters: {} as { [name: string]: any },
  testAuthMock: vi.fn(),
}));

vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => clusters,
}));

// getCluster() reads the browser URL rather than the router, which MemoryRouter
// does not touch.
vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/cluster')>()),
  getCluster: () => 'main',
}));

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  testAuth: testAuthMock,
}));

function LocationDisplay() {
  const location = useLocation();
  return (
    <div
      data-testid="location"
      data-pathname={location.pathname}
      data-from-auth-chooser={String(
        !!(location.state as { fromAuthChooser?: boolean } | undefined)?.fromAuthChooser
      )}
    />
  );
}

/**
 * Renders the auth chooser for a cluster whose auth check has just failed, which is
 * the state the dialog is left in when a cluster's connection or token goes away.
 *
 * The location is reported from outside the cluster route, so it survives the
 * navigation the back button triggers.
 */
async function renderFailedAuthChooser() {
  testAuthMock.mockRejectedValue(Object.assign(new Error('Bad Gateway'), { status: 502 }));

  render(
    <ThemeProvider theme={createMuiTheme({ name: 'light', base: 'light' })}>
      <Provider store={store}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={['/c/main']}>
            <Route path="/c/:cluster">
              <AuthChooser />
            </Route>
            <LocationDisplay />
          </MemoryRouter>
        </SnackbarProvider>
      </Provider>
    </ThemeProvider>
  );

  // The back button only appears once the auth check has settled.
  await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeVisible());
}

describe('AuthChooser', () => {
  beforeEach(() => {
    for (const name of Object.keys(clusters)) {
      delete clusters[name];
    }
  });

  it('leaves for the chooser rather than going back into the failing cluster', async () => {
    clusters.main = { name: 'main', auth_type: '' };
    clusters.other = { name: 'other', auth_type: '' };

    await renderFailedAuthChooser();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    // goBack() used to leave us on the cluster page, which re-runs the auth check
    // and lands straight back here.
    expect(screen.getByTestId('location').dataset.pathname).toBe('/');
  });

  it('tells the chooser not to send a lone cluster straight back', async () => {
    clusters.main = { name: 'main', auth_type: '' };

    await renderFailedAuthChooser();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    const location = screen.getByTestId('location');
    expect(location.dataset.pathname).toBe('/');
    expect(location.dataset.fromAuthChooser).toBe('true');
  });
});
