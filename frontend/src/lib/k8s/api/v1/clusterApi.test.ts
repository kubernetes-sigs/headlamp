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
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { renameCluster, setCluster } from './clusterApi';
import { request } from './clusterRequests';

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

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(() => 'browser-user'),
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

describe('renameCluster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(request).mockResolvedValue({ clusters: [] });
  });

  it('identifies the browser whose cached IndexedDB connection must be removed', async () => {
    vi.mocked(findKubeconfigByClusterName).mockResolvedValue('base64-kubeconfig');

    await renameCluster('shared-connection', 'my-workload', 'dynamic_cluster');

    expect(request).toHaveBeenCalledWith(
      '/cluster/shared-connection',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-HEADLAMP_BACKEND-TOKEN': 'backend-token',
          'X-HEADLAMP-USER-ID': 'browser-user',
        }),
        body: JSON.stringify({
          newClusterName: 'my-workload',
          source: 'dynamic_cluster',
          stateless: true,
        }),
      }),
      false,
      false
    );
  });

  it('keeps file-backed renames independent of the browser identity', async () => {
    vi.mocked(findKubeconfigByClusterName).mockResolvedValue(null);

    await renameCluster('file-context', 'my-workload', 'kubeconfig');

    const [, options] = vi.mocked(request).mock.calls[0];
    expect(new Headers(options?.headers).has('X-HEADLAMP-USER-ID')).toBe(false);
    expect(JSON.parse(options!.body as string)).toMatchObject({ stateless: false });
    expect(getUserIdFromLocalStorage).not.toHaveBeenCalled();
  });
});
