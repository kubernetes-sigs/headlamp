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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type {
  KubeResourcePoolStatusRequest,
  ResourcePoolStatusRequestStatus,
} from './resourcePoolStatusRequest';
import ResourcePoolStatusRequest, {
  PoolStatusRequestTimeoutError,
  requestPoolStatus,
  usePoolStatusRequest,
} from './resourcePoolStatusRequest';

const { mockPost, mockRemove, mockRequest } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockRemove: vi.fn(),
  mockRequest: vi.fn(),
}));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  post: mockPost,
  remove: mockRemove,
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const cluster = 'gpu-cluster';
const name = 'headlamp-pool-status-bt8kb';
const url = `/apis/resource.k8s.io/v1alpha3/resourcepoolstatusrequests`;

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

describe('requestPoolStatus', () => {
  const spec = { driver: 'gpu.example.com' };

  beforeEach(() => {
    vi.useFakeTimers();
    mockPost.mockReset();
    mockRequest.mockReset();
    mockRemove.mockReset();
    mockRemove.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a request with a generated name and removes it once answered', async () => {
    mockPost.mockResolvedValue(complete);

    const result = await requestPoolStatus(spec, cluster);

    expect(mockPost).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        apiVersion: 'resource.k8s.io/v1alpha3',
        kind: 'ResourcePoolStatusRequest',
        metadata: { generateName: 'headlamp-pool-status-' },
        spec,
      }),
      true,
      { cluster }
    );
    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.pools).toEqual([pool]);
    expect(result.cluster).toBe(cluster);
    expect(mockRemove).toHaveBeenCalledWith(`${url}/${name}`, { cluster });
  });

  it('keeps asking until the controller answers', async () => {
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockResolvedValueOnce(makeRequest()).mockResolvedValueOnce(complete);

    const result = requestPoolStatus(spec, cluster);
    await vi.advanceTimersByTimeAsync(2_000);

    expect((await result).isComplete).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenCalledWith(`${url}/${name}`, { cluster });
  });

  it('returns a failed request, and removes it', async () => {
    const failed = makeRequest({ conditions: [condition('Failed', 'Listing failed')] });
    mockPost.mockResolvedValue(failed);

    const result = await requestPoolStatus(spec, cluster);

    expect(result.failureMessage).toBe('Listing failed');
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('gives up on a request that is never answered, and removes it', async () => {
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockResolvedValue(makeRequest());

    const result = requestPoolStatus(spec, cluster);
    const rejection = expect(result).rejects.toBeInstanceOf(PoolStatusRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(mockRemove).toHaveBeenCalledWith(`${url}/${name}`, { cluster });
  });

  it('removes the request when asking for it fails', async () => {
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockRejectedValue(new Error('Bad gateway'));

    const result = requestPoolStatus(spec, cluster);
    const rejection = expect(result).rejects.toThrow('Bad gateway');
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('still answers when the user may not delete the request', async () => {
    mockPost.mockResolvedValue(complete);
    mockRemove.mockRejectedValue(new Error('Forbidden'));

    await expect(requestPoolStatus(spec, cluster)).resolves.toBeInstanceOf(
      ResourcePoolStatusRequest
    );
  });

  it('passes on the error when the request cannot be created, with nothing to remove', async () => {
    mockPost.mockRejectedValue(new Error('Forbidden'));

    await expect(requestPoolStatus(spec, cluster)).rejects.toThrow('Forbidden');
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

describe('usePoolStatusRequest', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    mockPost.mockReset();
    mockRemove.mockReset();
    mockRemove.mockResolvedValue({});
  });

  it('asks only when told to, and gives the answer', async () => {
    mockPost.mockResolvedValue(complete);
    const { result } = renderHook(() => usePoolStatusRequest(cluster), { wrapper });

    expect(mockPost).not.toHaveBeenCalled();

    result.current.mutate({ driver: 'gpu.example.com' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pools).toEqual([pool]);
  });

  it('gives the error when the request cannot be created', async () => {
    mockPost.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => usePoolStatusRequest(cluster), { wrapper });

    result.current.mutate({ driver: 'gpu.example.com' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Forbidden');
  });
});
