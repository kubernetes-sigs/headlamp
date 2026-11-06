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
import { ConfigState, setConfig } from '../../../../redux/configSlice';
import store from '../../../../redux/stores/store';
import { storeStatelessClusterKubeconfig } from '../../../../stateless';
import { setCluster, updateClusterTags } from './clusterApi';
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
    store.dispatch(setConfig({ clusters: null }));
  });

  describe('updateClusterTags', () => {
    it.each(['delete target', 'rename sibling', 'replace same-ID server', 'replace same-ID auth'])(
      'rejects a delayed full snapshot after %s',
      async mutation => {
        const target = {
          name: 'target',
          auth_type: '',
          server: 'https://first.example',
          meta_data: { source: 'kubeconfig', clusterID: 'file+target' },
        };
        const sibling = { name: 'sibling', auth_type: '' };
        store.dispatch(setConfig({ clusters: { target, sibling } }));
        let finish!: (value: unknown) => void;
        vi.mocked(request).mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
        const saving = updateClusterTags('target', { env: 'prod' }, 'file+target');
        const failure = expect(saving).rejects.toThrow(
          'Cluster configuration changed while saving cluster tags'
        );
        const next: NonNullable<ConfigState['clusters']> =
          mutation === 'delete target'
            ? { sibling }
            : mutation === 'rename sibling'
            ? { target, renamed: { ...sibling, name: 'renamed' } }
            : {
                target: {
                  ...target,
                  server:
                    mutation === 'replace same-ID server'
                      ? 'https://replacement.example'
                      : target.server,
                  auth_type: mutation === 'replace same-ID auth' ? 'oidc' : target.auth_type,
                },
                sibling,
              };
        store.dispatch(setConfig({ clusters: next }));
        finish({ clusters: [target, sibling] });
        await failure;
        expect(store.getState().config.clusters).toEqual(next);
      }
    );

    it('preserves latest true and false token choices for every returned display name', async () => {
      store.dispatch(
        setConfig({
          clusters: {
            renamed: { name: 'renamed', auth_type: '', useToken: false },
            sibling: { name: 'sibling', auth_type: '', useToken: true },
          },
        })
      );
      let finish!: (value: unknown) => void;
      vi.mocked(request).mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
      const saving = updateClusterTags('renamed', { env: 'prod' });
      store.dispatch(
        setConfig({
          clusters: {
            renamed: { name: 'renamed', auth_type: '', useToken: true },
            sibling: { name: 'sibling', auth_type: '', useToken: false },
          },
        })
      );
      const response = {
        clusters: [
          {
            name: 'original',
            auth_type: '',
            meta_data: {
              extensions: { headlamp_info: { customName: 'renamed', tags: { env: 'prod' } } },
            },
          },
          { name: 'sibling', auth_type: '' },
          { name: 'new', auth_type: '' },
        ],
      };
      finish(response);
      const config = await saving;
      expect(config.clusters.renamed.useToken).toBe(true);
      expect(config.clusters.sibling.useToken).toBe(false);
      expect(config.clusters.new).not.toHaveProperty('useToken');
      expect(response.clusters.every(cluster => !('useToken' in cluster))).toBe(true);
    });

    it('normalizes the server cluster array into the name-keyed config shape', async () => {
      vi.mocked(request).mockResolvedValue({
        clusters: [
          {
            name: 'original',
            auth_type: '',
            meta_data: {
              extensions: { headlamp_info: { customName: 'renamed', tags: { env: 'prod' } } },
            },
          },
        ],
        allowKubeconfigChanges: true,
        isDynamicClusterEnabled: true,
      });
      const config = await updateClusterTags('renamed', { env: 'prod' }, 'file+original');
      expect(config.clusters.renamed.name).toBe('renamed');
      expect(config.clusters.renamed.meta_data.extensions.headlamp_info.tags).toEqual({
        env: 'prod',
      });
      expect(config.allowKubeconfigChanges).toBe(true);
      expect(request).toHaveBeenLastCalledWith(
        '/cluster/renamed/tags',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ tags: { env: 'prod' }, clusterID: 'file+original' }),
          headers: expect.objectContaining({ 'X-HEADLAMP_BACKEND-TOKEN': 'backend-token' }),
        }),
        false,
        false
      );
    });
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
