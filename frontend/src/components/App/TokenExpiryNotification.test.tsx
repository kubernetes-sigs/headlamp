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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClusterMeResult } from '../../lib/auth';
import { TestContext } from '../../test';
import { PureTokenExpiryNotification } from './TokenExpiryNotification';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

const { mockLogout, mockGetCluster } = vi.hoisted(() => ({
  mockLogout: vi.fn().mockResolvedValue(undefined),
  mockGetCluster: vi.fn().mockReturnValue('test-cluster'),
}));

vi.mock('../../lib/auth', async () => ({
  ...(await vi.importActual<typeof import('../../lib/auth')>('../../lib/auth')),
  logout: (...args: any[]) => mockLogout(...args),
}));

vi.mock('../../lib/cluster', () => ({
  getCluster: () => mockGetCluster(),
}));

vi.mock('../../lib/router/getRoute', () => ({
  getRoute: (name: string) => {
    const routes: Record<string, { path: string }> = {
      login: { path: '/login' },
      token: { path: '/token' },
      settingsCluster: { path: '/settings' },
    };
    return routes[name] ?? null;
  },
}));

vi.mock('../../lib/router/getRoutePath', () => ({
  getRoutePath: (route: { path: string }) => route.path,
}));

function makeFetch(result: ClusterMeResult) {
  return vi.fn().mockResolvedValue(result);
}

describe('PureTokenExpiryNotification', () => {
  beforeEach(() => {
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockGetCluster.mockReturnValue('test-cluster');
  });

  it('shows warning banner when token expiry is within 2 minutes', async () => {
    const expiry = Math.floor(Date.now() / 1000) + 90;
    render(
      <TestContext>
        <PureTokenExpiryNotification
          fetchClusterMeFn={makeFetch({ tokenExpired: false, data: { tokenExpiry: expiry } })}
        />
      </TestContext>
    );

    await waitFor(() => {
      expect(screen.getByText(/Session expires in/)).toBeInTheDocument();
    });
  });

  it('shows no warning when token expiry is more than 2 minutes away', async () => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchFn = makeFetch({ tokenExpired: false, data: { tokenExpiry: expiry } });
    render(
      <TestContext>
        <PureTokenExpiryNotification fetchClusterMeFn={fetchFn} />
      </TestContext>
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(screen.queryByText(/Session expires in/)).not.toBeInTheDocument();
  });

  it('calls logout when the backend reports the token as expired', async () => {
    render(
      <TestContext>
        <PureTokenExpiryNotification
          fetchClusterMeFn={makeFetch({ tokenExpired: true, data: null })}
        />
      </TestContext>
    );

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledWith('test-cluster');
    });
  });

  it('suppresses the banner on excluded routes', async () => {
    const expiry = Math.floor(Date.now() / 1000) + 90;
    const fetchFn = makeFetch({ tokenExpired: false, data: { tokenExpiry: expiry } });
    render(
      <TestContext urlPrefix="/login">
        <PureTokenExpiryNotification fetchClusterMeFn={fetchFn} />
      </TestContext>
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(screen.queryByText(/Session expires in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session expired/)).not.toBeInTheDocument();
  });
});
