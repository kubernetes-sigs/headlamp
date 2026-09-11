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
import { TestContext } from '../../test';
import AuthChooser from '.';

const { clustersConf, mockTestAuth } = vi.hoisted(() => ({
  clustersConf: {} as Record<string, any>,
  mockTestAuth: vi.fn(),
}));

vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => clustersConf,
}));

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  testAuth: (...args: any[]) => mockTestAuth(...args),
}));

// AppLogo, rendered by the dialog, reads theme.palette.navbar, which is not set up here.
vi.mock('../../lib/themes', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/themes')>()),
  useNavBarMode: () => 'light',
}));

vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/cluster')>()),
  getCluster: () => 'test-cluster',
  getClusterPrefixedPath: () => '/c/:cluster',
}));

/** Rejects the auth test with an ApiError carrying the given status. */
function failAuthWith(status: number, statusText: string) {
  const error = new Error(statusText) as Error & { status: number };
  error.status = status;
  mockTestAuth.mockRejectedValue(error);
}

function renderAuthChooser() {
  return render(
    <TestContext>
      <AuthChooser />
    </TestContext>
  );
}

describe('AuthChooser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(clustersConf)) {
      delete clustersConf[key];
    }
    clustersConf['test-cluster'] = { name: 'test-cluster', auth_type: '' };
  });

  it('asks for a token when the cluster rejects the request as unauthorized', async () => {
    failAuthWith(401, 'Unauthorized');

    renderAuthChooser();

    await waitFor(() => expect(clustersConf['test-cluster'].useToken).toBe(true));
    expect(screen.queryByText(/Failed to get authentication information/)).not.toBeInTheDocument();
  });

  it('asks for a token when the cluster rejects the request as forbidden', async () => {
    failAuthWith(403, 'Forbidden');

    renderAuthChooser();

    await waitFor(() => expect(clustersConf['test-cluster'].useToken).toBe(true));
  });

  // A failure that is not the cluster asking for credentials -- here the backend not
  // finding the cluster -- has to surface as an error instead of quietly sending the
  // user to the token page. See https://github.com/kubernetes-sigs/headlamp/issues/7154
  it('shows the error instead of asking for a token when the request fails otherwise', async () => {
    failAuthWith(404, 'Not Found');

    renderAuthChooser();

    expect(await screen.findByText(/Failed to get authentication information/)).toBeInTheDocument();
    expect(clustersConf['test-cluster'].useToken).toBeUndefined();
  });

  it('does not cache a token requirement when the cluster is unreachable', async () => {
    failAuthWith(502, 'Bad Gateway');

    renderAuthChooser();

    await waitFor(() => expect(screen.getByText(/Failed to connect/)).toBeInTheDocument());
    expect(clustersConf['test-cluster'].useToken).toBeUndefined();
  });

  it('goes straight through when the auth test succeeds', async () => {
    mockTestAuth.mockResolvedValue({});

    renderAuthChooser();

    await waitFor(() => expect(clustersConf['test-cluster'].useToken).toBe(false));
  });
});
