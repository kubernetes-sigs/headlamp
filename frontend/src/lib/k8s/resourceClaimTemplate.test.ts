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
import App from '../../App';
import type { KubeResourceClaimTemplate } from './resourceClaimTemplate';
import ResourceClaimTemplate from './resourceClaimTemplate';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeTemplate = (spec: KubeResourceClaimTemplate['spec']) =>
  new ResourceClaimTemplate({
    kind: 'ResourceClaimTemplate',
    apiVersion: 'resource.k8s.io/v1',
    metadata: {
      name: 'single-gpu',
      namespace: 'gpu-demo',
      uid: 'template-uid',
      creationTimestamp: '2026-09-20T15:00:00Z',
    },
    spec,
  } as KubeResourceClaimTemplate);

const exactRequest = (name: string, deviceClassName = 'gpu.example.com') => ({
  name,
  exactly: { deviceClassName, allocationMode: 'ExactCount' as const, count: 1 },
});

describe('ResourceClaimTemplate', () => {
  it('is a namespaced resource.k8s.io resource', () => {
    expect(ResourceClaimTemplate.apiVersion).toBe('resource.k8s.io/v1');
    expect(ResourceClaimTemplate.apiName).toBe('resourceclaimtemplates');
    expect(ResourceClaimTemplate.isNamespaced).toBe(true);
    expect(ResourceClaimTemplate.apiGroupName).toBe('resource.k8s.io');
  });

  it('reads the requests out of the claim spec it wraps', () => {
    const template = makeTemplate({
      spec: { devices: { requests: [exactRequest('gpu-1'), exactRequest('gpu-2')] } },
    });

    expect(template.requests.map(request => request.name)).toEqual(['gpu-1', 'gpu-2']);
  });

  it('reports no requests for a template that asks for no devices', () => {
    expect(makeTemplate({ spec: {} }).requests).toEqual([]);
  });

  it('collects the requested classes without duplicates', () => {
    const template = makeTemplate({
      spec: {
        devices: {
          requests: [
            exactRequest('gpu-1'),
            exactRequest('gpu-2'),
            {
              name: 'fallback',
              firstAvailable: [
                { name: 'big', deviceClassName: 'a100.example.com' },
                { name: 'small', deviceClassName: 'gpu.example.com' },
              ],
            },
          ],
        },
      },
    });

    expect(template.requestedClasses).toEqual(['gpu.example.com', 'a100.example.com']);
  });

  describe('isEnabled', () => {
    beforeEach(() => mockRequest.mockReset());

    it('is true when the cluster serves resource claim templates', async () => {
      mockRequest.mockResolvedValue({ resources: [{ name: 'resourceclaimtemplates' }] });

      await expect(ResourceClaimTemplate.isEnabled('dra')).resolves.toBe(true);
      expect(mockRequest).toHaveBeenCalledWith('/apis/resource.k8s.io/v1', { cluster: 'dra' });
    });

    it('is false when the cluster does not serve the DRA API', async () => {
      mockRequest.mockRejectedValueOnce(new Error('404'));

      expect(await ResourceClaimTemplate.isEnabled('legacy')).toBe(false);
    });
  });
});
