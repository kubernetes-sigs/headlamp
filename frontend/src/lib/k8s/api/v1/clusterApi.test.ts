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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clusterName = 'oidc-cluster';

// Mock cluster getter so testAuth resolves without window state.
vi.mock('../../../cluster', () => ({
  getCluster: () => clusterName,
  getSelectedClusters: () => [clusterName],
}));

// Mock the redux store. The shape mirrors what testAuth reads:
// state.config.clusters[name].auth_type.
const fakeState: { config: { clusters: Record<string, { auth_type?: string }> } } = {
  config: { clusters: {} },
};

vi.mock('../../../../redux/stores/store', () => ({
  default: {
    getState: () => fakeState,
  },
}));

// Spy hooks for clusterRequest / post used by testAuth.
const clusterRequestMock = vi.fn();
const postMock = vi.fn();

vi.mock('./clusterRequests', () => ({
  clusterRequest: (...args: any[]) => clusterRequestMock(...args),
  post: (...args: any[]) => postMock(...args),
  request: vi.fn(),
}));

// Other modules clusterApi.ts imports — keep them inert.
vi.mock('../../../../helpers/addBackstageAuthHeaders', () => ({
  addBackstageAuthHeaders: (h: Record<string, string>) => h,
}));
vi.mock('../../../../helpers/clusterSettings', () => ({
  loadClusterSettings: () => ({}),
}));
vi.mock('../../../../helpers/debugVerbose', () => ({ isDebugVerbose: () => false }));
vi.mock('../../../../helpers/getHeadlampAPIHeaders', () => ({
  getHeadlampAPIHeaders: () => ({}),
}));
vi.mock('../../../../stateless', () => ({ storeStatelessClusterKubeconfig: vi.fn() }));
vi.mock('../../../../stateless/deleteClusterKubeconfig', () => ({
  deleteClusterKubeconfig: vi.fn(),
}));
vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn().mockResolvedValue(null),
}));

import { testAuth } from './clusterApi';

describe('testAuth', () => {
  beforeEach(() => {
    clusterRequestMock.mockReset();
    postMock.mockReset();
    fakeState.config.clusters = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OIDC cluster: /me returning a real identity is authenticated', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    clusterRequestMock.mockResolvedValueOnce({ username: 'alice@example.com' });

    await expect(testAuth(clusterName)).resolves.toMatchObject({ username: 'alice@example.com' });

    expect(clusterRequestMock).toHaveBeenCalledWith(
      '/me',
      expect.objectContaining({ cluster: clusterName })
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it('OIDC cluster: system:anonymous identity is treated as not-authenticated', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    clusterRequestMock.mockResolvedValueOnce({ username: 'system:anonymous' });

    await expect(testAuth(clusterName)).rejects.toMatchObject({ status: 401 });
    expect(postMock).not.toHaveBeenCalled();
  });

  it('OIDC cluster: empty username is treated as not-authenticated', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: 'oidc' };

    clusterRequestMock.mockResolvedValueOnce({});

    await expect(testAuth(clusterName)).rejects.toMatchObject({ status: 401 });
  });

  it('non-OIDC cluster: testAuth still uses SSRR (unchanged)', async () => {
    fakeState.config.clusters[clusterName] = { auth_type: '' };

    postMock.mockResolvedValueOnce({ status: { resourceRules: [] } });

    await expect(testAuth(clusterName)).resolves.toBeDefined();

    expect(postMock).toHaveBeenCalledWith(
      '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
      expect.any(Object),
      false,
      expect.objectContaining({ cluster: clusterName })
    );
    expect(clusterRequestMock).not.toHaveBeenCalled();
  });
});
