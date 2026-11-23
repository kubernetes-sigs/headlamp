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
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type {
  KubeResourcePoolStatusRequest,
  ResourcePoolStatusRequestStatus,
} from './resourcePoolStatusRequest';
import ResourcePoolStatusRequest, {
  isPoolIncomplete,
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

  it('waits for pools while the condition says so', () => {
    const waiting = wrap(
      makeRequest({ conditions: [condition('WaitingForPools', 'Waiting for gpu-pool')] })
    );

    expect(waiting.isWaitingForPools).toBe(true);
    expect(waiting.isPending).toBe(true);
    expect(wrap(complete).isWaitingForPools).toBe(false);
  });

  it('tells an incomplete pool from one with no free devices', () => {
    expect(
      isPoolIncomplete({
        ...pool,
        totalDevices: undefined,
        validationError: 'PoolIncomplete: 1 of 2 slices published',
      })
    ).toBe(true);
    expect(isPoolIncomplete({ ...pool, availableDevices: 0 })).toBe(false);
    expect(isPoolIncomplete({ ...pool, validationError: 'Some other problem' })).toBe(false);
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
    expect(mockRequest).toHaveBeenCalledWith(`${url}/${name}`, {
      cluster,
      timeout: expect.any(Number),
    });
  });

  it('reports each unanswered read while it waits', async () => {
    const waiting = makeRequest({
      conditions: [condition('WaitingForPools', 'Waiting for gpu-pool')],
    });
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockResolvedValueOnce(waiting).mockResolvedValueOnce(complete);
    const onProgress = vi.fn();

    const result = requestPoolStatus(spec, cluster, { onProgress });
    await vi.advanceTimersByTimeAsync(2_000);

    expect((await result).isComplete).toBe(true);
    expect(onProgress.mock.calls.map(([current]) => current.isWaitingForPools)).toEqual([
      false,
      true,
    ]);
  });

  it('asks nothing when cancelled before it starts', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestPoolStatus(spec, cluster, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('removes a request cancelled while it was being created', async () => {
    const controller = new AbortController();
    let answerPost: (created: KubeResourcePoolStatusRequest) => void = () => {};
    mockPost.mockReturnValue(
      new Promise(resolve => {
        answerPost = resolve;
      })
    );
    const onProgress = vi.fn();

    const result = requestPoolStatus(spec, cluster, { onProgress, signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    answerPost(makeRequest());

    await rejection;
    expect(onProgress).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith(`${url}/${name}`, { cluster });
  });

  it('stops polling and removes the request when cancelled between reads', async () => {
    const controller = new AbortController();
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockResolvedValue(makeRequest());

    const result = requestPoolStatus(spec, cluster, { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1_500);
    controller.abort();

    await rejection;
    expect(mockRemove).toHaveBeenCalledWith(`${url}/${name}`, { cluster });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a read that is slow to arrive when cancelled', async () => {
    const controller = new AbortController();
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockReturnValue(new Promise(() => {}));

    const result = requestPoolStatus(spec, cluster, { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    controller.abort();

    await rejection;
    expect(mockRemove).toHaveBeenCalledTimes(1);
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

  it('gives up at the deadline on an answer that is slow to arrive', async () => {
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockImplementation(
      (_url: string, { timeout }: { timeout: number }) =>
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(Object.assign(new Error('Request timed-out'), { status: 408 })),
            timeout
          )
        )
    );

    const result = requestPoolStatus(spec, cluster);
    const rejection = expect(result).rejects.toBeInstanceOf(PoolStatusRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(`${url}/${name}`, { cluster, timeout: 29_000 });
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('gives up at the deadline on an answer whose body stalls', async () => {
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockImplementation(
      (_url: string, { timeout }: { timeout: number }) =>
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            timeout
          )
        )
    );

    const result = requestPoolStatus(spec, cluster);
    const rejection = expect(result).rejects.toBeInstanceOf(PoolStatusRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the removal to answer', async () => {
    mockPost.mockResolvedValue(complete);
    mockRemove.mockReturnValue(new Promise(() => {}));

    await expect(requestPoolStatus(spec, cluster)).resolves.toBeInstanceOf(
      ResourcePoolStatusRequest
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('does not delay giving up on the removal answering', async () => {
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockResolvedValue(makeRequest());
    mockRemove.mockReturnValue(new Promise(() => {}));

    const result = requestPoolStatus(spec, cluster);
    const rejection = expect(result).rejects.toBeInstanceOf(PoolStatusRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
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
  const makeWrapper = () => {
    const client = new QueryClient();
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

  const waiting = (driver: string, requestName: string): KubeResourcePoolStatusRequest => {
    const json = makeRequest({ conditions: [condition('WaitingForPools', 'Waiting')] });
    return { ...json, metadata: { ...json.metadata, name: requestName }, spec: { driver } };
  };

  beforeEach(() => {
    mockPost.mockReset();
    mockRequest.mockReset();
    mockRemove.mockReset();
    mockRemove.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks nothing without a spec', () => {
    const { result } = renderHook(() => usePoolStatusRequest(cluster), { wrapper: makeWrapper() });

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });

  it('asks once and gives the answer', async () => {
    mockPost.mockResolvedValue(complete);
    const { result, rerender } = renderHook(
      () => usePoolStatusRequest(cluster, { driver: 'gpu.example.com' }),
      { wrapper: makeWrapper() }
    );

    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.answer?.pools).toEqual([pool]));
    expect(result.current.isPending).toBe(false);

    rerender();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('asks again when told to', async () => {
    mockPost.mockResolvedValue(complete);
    const { result } = renderHook(
      () => usePoolStatusRequest(cluster, { driver: 'gpu.example.com' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isPending).toBe(false));

    result.current.refetch();

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
  });

  it('gives the error when the request cannot be created, without trying again', async () => {
    mockPost.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(
      () => usePoolStatusRequest(cluster, { driver: 'gpu.example.com' }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.error?.message).toBe('Forbidden'));
    expect(result.current.isPending).toBe(false);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('cancels the request for another driver and ignores its progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = waiting('a.example.com', 'request-a');
    const second = { ...waiting('b.example.com', 'request-b'), status: undefined };
    mockPost.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    let answerRead: (current: KubeResourcePoolStatusRequest) => void = () => {};
    mockRequest.mockImplementation((requestUrl: string) =>
      requestUrl.endsWith('request-a')
        ? new Promise(resolve => {
            answerRead = resolve;
          })
        : Promise.resolve(second)
    );

    const { result, rerender } = renderHook(
      ({ driver }) => usePoolStatusRequest(cluster, { driver }),
      { wrapper: makeWrapper(), initialProps: { driver: 'a.example.com' } }
    );
    await waitFor(() => expect(result.current.isWaitingForPools).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    rerender({ driver: 'b.example.com' });
    expect(result.current.isWaitingForPools).toBe(false);
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(`${url}/request-a`, { cluster }));

    await act(async () => {
      answerRead(first);
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isWaitingForPools).toBe(false);
    const readsOfFirst = mockRequest.mock.calls.filter(([requestUrl]) =>
      requestUrl.endsWith('request-a')
    );
    expect(readsOfFirst).toHaveLength(1);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('starts over when asked about the first driver again', async () => {
    mockPost
      .mockResolvedValueOnce(waiting('a.example.com', 'request-0'))
      .mockResolvedValueOnce(waiting('b.example.com', 'request-1'))
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ driver }) => usePoolStatusRequest(cluster, { driver }),
      { wrapper: makeWrapper(), initialProps: { driver: 'a.example.com' } }
    );
    await waitFor(() => expect(result.current.isWaitingForPools).toBe(true));

    rerender({ driver: 'b.example.com' });
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    rerender({ driver: 'a.example.com' });

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(3));
    expect(result.current.isPending).toBe(true);
    expect(result.current.isWaitingForPools).toBe(false);
  });

  it('removes the request when unmounted, and stops reading it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPost.mockResolvedValue(makeRequest());
    mockRequest.mockResolvedValue(makeRequest());
    const { unmount } = renderHook(
      () => usePoolStatusRequest(cluster, { driver: 'gpu.example.com' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(mockPost).toHaveBeenCalled());

    unmount();

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(`${url}/${name}`, { cluster }));
    const reads = mockRequest.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockRequest).toHaveBeenCalledTimes(reads);
  });
});
