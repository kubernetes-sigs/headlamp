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

import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import ResourcePoolStatusRequest from './resourcePoolStatusRequest';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const cluster = 'gpu-cluster';

describe('ResourcePoolStatusRequest', () => {
  it('is a cluster scoped resource.k8s.io alpha resource', () => {
    expect(ResourcePoolStatusRequest.apiVersion).toBe('resource.k8s.io/v1alpha3');
    expect(ResourcePoolStatusRequest.apiName).toBe('resourcepoolstatusrequests');
    expect(ResourcePoolStatusRequest.isNamespaced).toBe(false);
  });

  it('is served only when its alpha version lists it', async () => {
    mockRequest.mockResolvedValueOnce({ resources: [{ name: 'resourcepoolstatusrequests' }] });
    await expect(ResourcePoolStatusRequest.isEnabled(cluster)).resolves.toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('/apis/resource.k8s.io/v1alpha3', { cluster });

    mockRequest.mockRejectedValueOnce(new Error('Not found'));
    await expect(ResourcePoolStatusRequest.isEnabled(cluster)).resolves.toBe(false);
  });
});
