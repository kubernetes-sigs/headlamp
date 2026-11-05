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
import type {
  KubeResourcePoolStatusRequest,
  ResourcePoolStatusRequestStatus,
} from './resourcePoolStatusRequest';
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
const name = 'headlamp-pool-status-bt8kb';

const makeRequest = (status?: ResourcePoolStatusRequestStatus) =>
  ({
    apiVersion: 'resource.k8s.io/v1alpha3',
    kind: 'ResourcePoolStatusRequest',
    metadata: {
      name,
      generateName: 'headlamp-pool-status-',
      uid: '2371ee62-c1d9-4fe1-b8c7-6c0e532fc69e',
      creationTimestamp: '2026-11-04T21:53:58Z',
    },
    spec: { driver: 'gpu.example.com', limit: 100 },
    status,
  } as KubeResourcePoolStatusRequest);

const condition = (type: string, message: string) => ({
  type,
  status: 'True',
  reason: type,
  message,
  lastTransitionTime: '2026-11-04T21:53:58Z',
});

const pool = {
  driver: 'gpu.example.com',
  poolName: 'gpu-pool',
  generation: 1,
  resourceSliceCount: 1,
  totalDevices: 2,
  allocatedDevices: 1,
  availableDevices: 1,
  unavailableDevices: 0,
};

const complete = makeRequest({
  poolCount: 1,
  pools: [pool],
  conditions: [condition('Complete', 'Calculated status for 1 pools')],
});

const wrap = (json: KubeResourcePoolStatusRequest) => new ResourcePoolStatusRequest(json, cluster);

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

  it('is pending until the controller writes a status', () => {
    const pending = wrap(makeRequest());

    expect(pending.isPending).toBe(true);
    expect(pending.isComplete).toBe(false);
    expect(pending.isFailed).toBe(false);
  });

  it('reads the pools of a complete request', () => {
    const request = wrap(complete);

    expect(request.isComplete).toBe(true);
    expect(request.isPending).toBe(false);
    expect(request.pools).toEqual([pool]);
    expect(request.isTruncated).toBe(false);
  });

  it('has no pools when the driver has none, as the status then leaves them out', () => {
    const request = wrap(
      makeRequest({
        poolCount: 0,
        conditions: [condition('Complete', 'Calculated status for 0 pools')],
      })
    );

    expect(request.isComplete).toBe(true);
    expect(request.pools).toEqual([]);
    expect(request.isTruncated).toBe(false);
  });

  it('is truncated when more pools match than the limit returned', () => {
    const request = wrap(
      makeRequest({
        poolCount: 3,
        pools: [pool],
        conditions: [condition('Complete', 'Calculated status for 3 pools')],
      })
    );

    expect(request.poolCount).toBe(3);
    expect(request.isTruncated).toBe(true);
  });

  it('gives the reason a request failed', () => {
    const request = wrap(makeRequest({ conditions: [condition('Failed', 'Listing failed')] }));

    expect(request.isFailed).toBe(true);
    expect(request.isPending).toBe(false);
    expect(request.failureMessage).toBe('Listing failed');
  });

  it('ignores a condition that is not true', () => {
    const request = wrap(
      makeRequest({ conditions: [{ ...condition('Complete', ''), status: 'False' }] })
    );

    expect(request.isComplete).toBe(false);
    expect(request.isPending).toBe(true);
  });
});
