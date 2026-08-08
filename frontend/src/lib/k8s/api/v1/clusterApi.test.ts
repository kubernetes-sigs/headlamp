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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addBackstageAuthHeaders } from '../../../../helpers/addBackstageAuthHeaders';
import { getHeadlampAPIHeaders } from '../../../../helpers/getHeadlampAPIHeaders';
import { storeStatelessClusterKubeconfig } from '../../../../stateless';
import { getCluster } from '../../../cluster';
import { ApiError } from '../v2/ApiError';
import { setCluster, testAuth } from './clusterApi';
import { clusterRequest, post, request } from './clusterRequests';

// Mirrors the slice of redux state testAuth reads:
// state.config.clusters[name].auth_type.
const fakeState: { config: { clusters: Record<string, { auth_type?: string }> } } = {
  config: { clusters: {} },
};

vi.mock('../../../../redux/stores/store', () => ({
  default: {
    getState: () => fakeState,
  },
}));

vi.mock('../../../../helpers/addBackstageAuthHeaders', () => ({
  addBackstageAuthHeaders: vi.fn((headers: Record<string, string>) => headers),
}));

vi.mock('../../../../helpers/getHeadlampAPIHeaders', () => ({
  getHeadlampAPIHeaders: vi.fn(() => ({
    'X-HEADLAMP_BACKEND-TOKEN': 'backend-token',
  })),
}));

vi.mock('../../../../stateless', () => ({
  storeStatelessClusterKubeconfig: vi.fn(),
}));

vi.mock('../../../../stateless/deleteClusterKubeconfig', () => ({
  deleteClusterKubeconfig: vi.fn(),
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(),
  getSelectedClusters: vi.fn(() => []),
}));

vi.mock('./clusterRequests', () => ({
  clusterRequest: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
}));

describe('setCluster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes backend auth headers for stateless parseKubeConfig request', async () => {
    const kubeconfig = 'base64-kubeconfig';
    const requestMock = vi.mocked(request);

    requestMock.mockResolvedValue({ clusters: [] });

    await setCluster({ kubeconfig });

    expect(storeStatelessClusterKubeconfig).toHaveBeenCalledWith(kubeconfig);
    expect(addBackstageAuthHeaders).toHaveBeenCalled();
    expect(getHeadlampAPIHeaders).toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledWith(
      '/parseKubeConfig',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ kubeconfigs: [kubeconfig] }),
        headers: expect.objectContaining({
          'X-HEADLAMP_BACKEND-TOKEN': 'backend-token',
        }),
      }),
      false,
      false
    );
  });
});

describe('testAuth', () => {
  const clusterName = 'oidc-cluster';

  beforeEach(() => {
    vi.clearAllMocks();
    fakeState.config.clusters = {};
  });

  it('OIDC cluster: /me returning a real identity is authenticated', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    vi.mocked(clusterRequest).mockResolvedValueOnce({ username: 'alice@example.com' });

    await expect(testAuth(clusterName)).resolves.toMatchObject({ username: 'alice@example.com' });

    expect(clusterRequest).toHaveBeenCalledWith(
      '/me',
      expect.objectContaining({
        cluster: clusterName,
        timeout: 5000,
        // A probe must not log the user out from under the caller.
        autoLogoutOnAuthError: false,
      })
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('OIDC cluster: a 401 from /me propagates with its status intact', async () => {
    // The real unauthenticated path: HandleMe rejects the missing/invalid
    // cookie before it looks at any claim. This is what fixes #4721.
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    const unauthorized = new ApiError('Unauthorized - unauthorized', { status: 401 });
    vi.mocked(clusterRequest).mockRejectedValueOnce(unauthorized);

    await expect(testAuth(clusterName)).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized - unauthorized',
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('OIDC cluster: system:anonymous identity is treated as not-authenticated', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    vi.mocked(clusterRequest).mockResolvedValueOnce({ username: 'system:anonymous' });

    await expect(testAuth(clusterName)).rejects.toMatchObject({ status: 401 });
    expect(post).not.toHaveBeenCalled();
  });

  it('OIDC cluster: an empty username is still an authenticated session', async () => {
    // HandleMe writes 200 with username "" when the JWT carries none of
    // preferred_username/upn/username/name. The cookie was still verified,
    // so rejecting here would loop the user through login forever.
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    vi.mocked(clusterRequest).mockResolvedValueOnce({ username: '' });

    await expect(testAuth(clusterName)).resolves.toMatchObject({ username: '' });
    expect(post).not.toHaveBeenCalled();
  });

  it('OIDC cluster: a username merely prefixed with system:anonymous is authenticated', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    vi.mocked(clusterRequest).mockResolvedValueOnce({ username: 'system:anonymous-reader' });

    await expect(testAuth(clusterName)).resolves.toMatchObject({
      username: 'system:anonymous-reader',
    });
  });

  it('no cluster argument: resolves the cluster through getCluster()', async () => {
    // This is how Auth.tsx calls it — bare testAuth().
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };
    vi.mocked(getCluster).mockReturnValueOnce(clusterName);

    vi.mocked(clusterRequest).mockResolvedValueOnce({ username: 'alice@example.com' });

    await expect(testAuth()).resolves.toMatchObject({ username: 'alice@example.com' });

    expect(clusterRequest).toHaveBeenCalledWith(
      '/me',
      expect.objectContaining({ cluster: clusterName })
    );
  });

  it('no cluster at all: falls through to SSRR', async () => {
    vi.mocked(getCluster).mockReturnValueOnce(null);

    vi.mocked(post).mockResolvedValueOnce({ status: { resourceRules: [] } });

    await expect(testAuth()).resolves.toBeDefined();
    expect(clusterRequest).not.toHaveBeenCalled();
  });

  it('cluster absent from config: falls through to SSRR', async () => {
    // fakeState.config.clusters has no entry, so the optional-chained
    // lookup yields undefined rather than throwing.
    vi.mocked(post).mockResolvedValueOnce({ status: { resourceRules: [] } });

    await expect(testAuth('unknown-cluster')).resolves.toBeDefined();

    expect(post).toHaveBeenCalledWith(
      '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
      expect.any(Object),
      false,
      expect.objectContaining({ cluster: 'unknown-cluster' })
    );
    expect(clusterRequest).not.toHaveBeenCalled();
  });

  it('non-OIDC cluster: testAuth still uses SSRR (unchanged)', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: '' };

    vi.mocked(post).mockResolvedValueOnce({ status: { resourceRules: [] } });

    await expect(testAuth(clusterName)).resolves.toBeDefined();

    expect(post).toHaveBeenCalledWith(
      '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
      expect.any(Object),
      false,
      expect.objectContaining({ cluster: clusterName })
    );
    expect(clusterRequest).not.toHaveBeenCalled();
  });
});
