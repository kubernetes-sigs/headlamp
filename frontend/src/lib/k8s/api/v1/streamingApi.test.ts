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

import { afterEach, describe, expect, it, Mock, vi } from 'vitest';
import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { ApiError } from '../v2/ApiError';
import { clusterRequest } from './clusterRequests';
import {
  connectStreamWithParams,
  isTransientError,
  streamResult,
  streamResultsForCluster,
  toApiError,
} from './streamingApi';

vi.mock('./clusterRequests', () => ({
  clusterRequest: vi.fn(),
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(),
}));

vi.mock('../../../../helpers/debugVerbose', () => ({
  isDebugVerbose: vi.fn(() => false),
}));

describe('connectStreamWithParams protocols', () => {
  afterEach(() => {
    setBackendToken(null);
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'with a backend token',
      token: 'desktop-token',
      backendProtocol: 'base64url.headlamp.backend.authorization.k8s.io.ZGVza3RvcC10b2tlbg',
    },
    { name: 'without a backend token', token: null, backendProtocol: null },
  ])('preserves Kubernetes, caller, and stateless protocols $name', async testCase => {
    const socket = {
      addEventListener: vi.fn(),
      binaryType: '',
    };
    const WebSocketMock = vi.fn(function () {
      return socket;
    });
    vi.stubGlobal('WebSocket', WebSocketMock);
    (findKubeconfigByClusterName as Mock).mockResolvedValue({});
    (getUserIdFromLocalStorage as Mock).mockReturnValue('stateless-user');
    setBackendToken(testCase.token);

    await connectStreamWithParams('/api/v1/pods', vi.fn(), vi.fn(), {
      cluster: 'test-cluster',
      additionalProtocols: ['caller.protocol'],
    });

    expect(WebSocketMock).toHaveBeenCalledWith(
      expect.stringContaining('/clusters/test-cluster/api/v1/pods'),
      [
        'base64.binary.k8s.io',
        'caller.protocol',
        ...(testCase.backendProtocol ? [testCase.backendProtocol] : []),
        'base64url.headlamp.authorization.k8s.io.stateless-user',
      ]
    );
  });

  it('uses default protocols and parses JSON messages', async () => {
    const listeners: Record<string, EventListener> = {};
    const socket = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners[type] = listener;
      }),
      binaryType: '',
      close: vi.fn(),
    };
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        return socket;
      })
    );
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
    const onMessage = vi.fn();

    await connectStreamWithParams('/api/v1/pods', onMessage, vi.fn(), {
      cluster: 'test-cluster',
      isJson: true,
    });
    listeners.message(new MessageEvent('message', { data: JSON.stringify({ kind: 'Pod' }) }));

    expect(onMessage).toHaveBeenCalledWith({ kind: 'Pod' });
  });

  it('returns a closable connection when socket construction fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        throw new Error('socket construction failed');
      })
    );
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);

    const connection = await connectStreamWithParams('/api/v1/pods', vi.fn(), vi.fn(), {
      cluster: 'test-cluster',
    });

    expect(connection.socket).toBeNull();
    expect(connection.close).not.toThrow();
  });

  it('delivers binary messages through the default parser', async () => {
    const listeners: Record<string, EventListener> = {};
    vi.mocked(isDebugVerbose).mockReturnValue(true);
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        return {
          addEventListener: vi.fn((type: string, listener: EventListener) => {
            listeners[type] = listener;
          }),
          binaryType: '',
        };
      })
    );
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
    const onMessage = vi.fn();

    await connectStreamWithParams('/api/v1/pods', onMessage, vi.fn(), {
      cluster: 'test-cluster',
    });
    listeners.message(new MessageEvent('message', { data: 'binary-data' }));

    expect(onMessage).toHaveBeenCalledWith('binary-data');
  });

  describe('streamResultsForCluster ERROR handling', () => {
    afterEach(() => {
      setBackendToken(null);
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function stubWebSocketCollector() {
      const sockets: {
        url: string;
        listeners: Record<string, ((ev: any) => void)[]>;
        close: ReturnType<typeof vi.fn>;
        emit: (type: string, event: any) => void;
        addEventListener: (type: string, listener: (ev: any) => void) => void;
        removeEventListener: (type: string, listener: (ev: any) => void) => void;
      }[] = [];
      const WebSocketMock = vi.fn(function (url: string) {
        const instance = {
          url,
          binaryType: '',
          listeners: {} as Record<string, ((ev: any) => void)[]>,
          close: vi.fn(),
          addEventListener: (type: string, listener: (ev: any) => void) => {
            instance.listeners[type] = instance.listeners[type] ?? [];
            instance.listeners[type].push(listener);
          },
          removeEventListener: (type: string, listener: (ev: any) => void) => {
            instance.listeners[type] = (instance.listeners[type] ?? []).filter(
              it => it !== listener
            );
          },
          emit: (type: string, event: any) => {
            (instance.listeners[type] ?? []).forEach(listener => listener(event));
          },
        };
        sockets.push(instance);

        return instance;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      return { sockets };
    }

    it('relists and restarts the watch on 410 Gone', async () => {
      const { sockets } = stubWebSocketCollector();
      const listResponse = (resourceVersion: string) => ({
        kind: 'PodList',
        items: [],
        metadata: { resourceVersion },
      });
      vi.mocked(clusterRequest)
        .mockResolvedValueOnce(listResponse('1') as any)
        .mockResolvedValueOnce(listResponse('2') as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      streamResultsForCluster('/api/v1/pods', {
        cb: vi.fn(),
        errCb: vi.fn(),
        cluster: 'test-cluster',
      });

      // Initial LIST pins resourceVersion=1 into the watch URL.
      await vi.waitFor(() => expect(sockets.length).toBe(1));
      expect(sockets[0].url).toContain('resourceVersion=1');

      // Server reports 410 Gone for the pinned resourceVersion.
      sockets[0].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'too old' } }),
        })
      );

      // The client relists and starts a new watch from a fresh
      // resourceVersion instead of reconnecting to the expired one.
      await vi.waitFor(() => expect(sockets.length).toBe(2));
      expect(clusterRequest).toHaveBeenCalledTimes(2);
      expect(sockets[1].url).toContain('resourceVersion=2');
      expect(sockets[1].url).not.toContain('resourceVersion=1');
    });

    it('refetches a single object and restarts its watch on 410 Gone', async () => {
      const { sockets } = stubWebSocketCollector();
      const pod = (resourceVersion: string) => ({
        kind: 'Pod',
        metadata: { name: 'pod-1', uid: 'pod-1-uid', resourceVersion },
      });
      vi.mocked(clusterRequest)
        .mockResolvedValueOnce(pod('1') as any)
        .mockResolvedValueOnce(pod('2') as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const cb = vi.fn();
      const errCb = vi.fn();

      streamResult('/api/v1/pods', 'pod-1', cb, errCb, {}, 'test-cluster');

      await vi.waitFor(() => expect(sockets.length).toBe(1));
      expect(cb).toHaveBeenCalledTimes(1);

      sockets[0].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'too old' } }),
        })
      );

      // The Status object must not be delivered as the watched resource; the
      // object is re-fetched and a new watch replaces the dead one.
      await vi.waitFor(() => expect(sockets.length).toBe(2));
      expect(clusterRequest).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenLastCalledWith(pod('2'));
      expect(errCb).not.toHaveBeenCalled();
    });

    it('retries transient recovery LIST failure after 410 Gone with backoff and restarts watch on success', async () => {
      vi.useFakeTimers();
      try {
        const { sockets } = stubWebSocketCollector();
        const list = (resourceVersion: string) => ({
          kind: 'PodList',
          items: [],
          metadata: { resourceVersion },
        });
        vi.mocked(clusterRequest)
          .mockResolvedValueOnce(list('1') as any)
          .mockRejectedValueOnce(new Error('503 Service Unavailable'))
          .mockResolvedValueOnce(list('2') as any);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const cb = vi.fn();
        const errCb = vi.fn();

        streamResultsForCluster('/api/v1/pods', {
          cb,
          errCb,
          cluster: 'test-cluster',
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(sockets.length).toBe(1);
        expect(sockets[0].url).toContain('resourceVersion=1');

        sockets[0].emit(
          'message',
          new MessageEvent('message', {
            data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'too old' } }),
          })
        );

        await vi.advanceTimersByTimeAsync(0);
        expect(clusterRequest).toHaveBeenCalledTimes(2);
        expect(errCb).toHaveBeenCalledTimes(1);
        expect(sockets.length).toBe(1);

        await vi.advanceTimersByTimeAsync(1000);

        expect(clusterRequest).toHaveBeenCalledTimes(3);
        expect(sockets.length).toBe(2);
        expect(sockets[1].url).toContain('resourceVersion=2');
      } finally {
        vi.useRealTimers();
      }
    });

    it('retries transient recovery GET failure after 410 Gone for single object with backoff and restarts watch on success', async () => {
      vi.useFakeTimers();
      try {
        const { sockets } = stubWebSocketCollector();
        const pod = (resourceVersion: string) => ({
          kind: 'Pod',
          metadata: { name: 'pod-1', uid: 'pod-1-uid', resourceVersion },
        });
        vi.mocked(clusterRequest)
          .mockResolvedValueOnce(pod('1') as any)
          .mockRejectedValueOnce(new Error('503 Service Unavailable'))
          .mockResolvedValueOnce(pod('2') as any);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const cb = vi.fn();
        const errCb = vi.fn();

        streamResult('/api/v1/pods', 'pod-1', cb, errCb, {}, 'test-cluster');

        await vi.advanceTimersByTimeAsync(0);
        expect(sockets.length).toBe(1);
        expect(cb).toHaveBeenCalledTimes(1);

        sockets[0].emit(
          'message',
          new MessageEvent('message', {
            data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'too old' } }),
          })
        );

        await vi.advanceTimersByTimeAsync(0);
        expect(clusterRequest).toHaveBeenCalledTimes(2);
        expect(errCb).toHaveBeenCalledTimes(1);
        expect(sockets.length).toBe(1);

        await vi.advanceTimersByTimeAsync(1000);

        expect(clusterRequest).toHaveBeenCalledTimes(3);
        expect(cb).toHaveBeenCalledTimes(2);
        expect(cb).toHaveBeenLastCalledWith(pod('2'));
        expect(sockets.length).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry terminal recovery GET failure after 410 Gone for single object', async () => {
      vi.useFakeTimers();
      try {
        const { sockets } = stubWebSocketCollector();
        const pod = (resourceVersion: string) => ({
          kind: 'Pod',
          metadata: { name: 'pod-1', uid: 'pod-1-uid', resourceVersion },
        });
        const notFoundErr = new ApiError('Not Found', { status: 404 });
        vi.mocked(clusterRequest)
          .mockResolvedValueOnce(pod('1') as any)
          .mockRejectedValueOnce(notFoundErr);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const cb = vi.fn();
        const errCb = vi.fn();

        streamResult('/api/v1/pods', 'pod-1', cb, errCb, {}, 'test-cluster');

        await vi.advanceTimersByTimeAsync(0);
        expect(sockets.length).toBe(1);

        sockets[0].emit(
          'message',
          new MessageEvent('message', {
            data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'too old' } }),
          })
        );

        await vi.advanceTimersByTimeAsync(0);
        expect(clusterRequest).toHaveBeenCalledTimes(2);
        expect(errCb).toHaveBeenCalledWith(notFoundErr, expect.any(Function));

        // Advance well beyond backoff delays; verify no further GET retry is attempted.
        await vi.advanceTimersByTimeAsync(60000);
        expect(clusterRequest).toHaveBeenCalledTimes(2);
        expect(sockets.length).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry terminal recovery LIST failure after 410 Gone for cluster list', async () => {
      vi.useFakeTimers();
      try {
        const { sockets } = stubWebSocketCollector();
        const list = (resourceVersion: string) => ({
          kind: 'PodList',
          items: [],
          metadata: { resourceVersion },
        });
        const forbiddenErr = new ApiError('Forbidden', { status: 403 });
        vi.mocked(clusterRequest)
          .mockResolvedValueOnce(list('1') as any)
          .mockRejectedValueOnce(forbiddenErr);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const cb = vi.fn();
        const errCb = vi.fn();

        streamResultsForCluster('/api/v1/pods', {
          cb,
          errCb,
          cluster: 'test-cluster',
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(sockets.length).toBe(1);

        sockets[0].emit(
          'message',
          new MessageEvent('message', {
            data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'too old' } }),
          })
        );

        await vi.advanceTimersByTimeAsync(0);
        expect(clusterRequest).toHaveBeenCalledTimes(2);
        expect(errCb).toHaveBeenCalledWith(forbiddenErr, expect.any(Function));

        // Advance well beyond backoff delays; verify no further LIST retry is attempted.
        await vi.advanceTimersByTimeAsync(60000);
        expect(clusterRequest).toHaveBeenCalledTimes(2);
        expect(sockets.length).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('correctly distinguishes transient from terminal errors with isTransientError', () => {
      expect(isTransientError(new ApiError('Timeout', { status: 408 }))).toBe(true);
      expect(isTransientError(new ApiError('Rate limited', { status: 429 }))).toBe(true);
      expect(isTransientError(new ApiError('Internal Error', { status: 500 }))).toBe(true);
      expect(isTransientError(new ApiError('Bad Gateway', { status: 502 }))).toBe(true);
      expect(isTransientError(new ApiError('Service Unavailable', { status: 503 }))).toBe(true);
      expect(isTransientError(new ApiError('Gateway Timeout', { status: 504 }))).toBe(true);
      expect(isTransientError(new Error('Network error without status'))).toBe(true);
      expect(isTransientError(null)).toBe(true);

      expect(isTransientError(new ApiError('Bad Request', { status: 400 }))).toBe(false);
      expect(isTransientError(new ApiError('Unauthorized', { status: 401 }))).toBe(false);
      expect(isTransientError(new ApiError('Forbidden', { status: 403 }))).toBe(false);
      expect(isTransientError(new ApiError('Not Found', { status: 404 }))).toBe(false);
      expect(isTransientError(new ApiError('Conflict', { status: 409 }))).toBe(false);
    });

    it('reports a non-410 single-object watch error through errCb with mapped numeric status and Error instance', async () => {
      const { sockets } = stubWebSocketCollector();
      vi.mocked(clusterRequest).mockResolvedValueOnce({
        kind: 'Pod',
        metadata: { name: 'pod-1', uid: 'pod-1-uid', resourceVersion: '1' },
      } as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const cb = vi.fn();
      const errCb = vi.fn();

      streamResult('/api/v1/pods', 'pod-1', cb, errCb, {}, 'test-cluster');

      await vi.waitFor(() => expect(sockets.length).toBe(1));

      sockets[0].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'ERROR',
            object: {
              kind: 'Status',
              apiVersion: 'v1',
              status: 'Failure',
              code: 500,
              reason: 'InternalError',
              message: 'boom',
            },
          }),
        })
      );

      await vi.waitFor(() => expect(errCb).toHaveBeenCalled());
      expect(errCb).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 500,
          reason: 'InternalError',
          message: 'boom',
        }),
        expect.any(Function)
      );
      const [error] = errCb.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.status).toBe(500);
      // Only the initial GET reached cb; the Status object did not.
      expect(cb).toHaveBeenCalledTimes(1);
      expect(clusterRequest).toHaveBeenCalledTimes(1);
    });

    it('reports a non-410 list watch error through errCb with mapped numeric status and Error instance', async () => {
      const { sockets } = stubWebSocketCollector();
      vi.mocked(clusterRequest).mockResolvedValueOnce({
        kind: 'PodList',
        items: [],
        metadata: { resourceVersion: '1' },
      } as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const cb = vi.fn();
      const errCb = vi.fn();

      streamResultsForCluster('/api/v1/pods', {
        cb,
        errCb,
        cluster: 'test-cluster',
      });

      await vi.waitFor(() => expect(sockets.length).toBe(1));

      sockets[0].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'ERROR',
            object: {
              kind: 'Status',
              apiVersion: 'v1',
              status: 'Failure',
              code: 404,
              reason: 'NotFound',
              message: 'the server could not find the requested resource',
            },
          }),
        })
      );

      await vi.waitFor(() => expect(errCb).toHaveBeenCalled());
      expect(errCb).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          reason: 'NotFound',
          message: 'the server could not find the requested resource',
        }),
        expect.any(Function)
      );
      const [error] = errCb.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.status).toBe(404);
      // Only the initial LIST reached cb; the Status error did not trigger a push.
      expect(cb).toHaveBeenCalledTimes(1);
      expect(clusterRequest).toHaveBeenCalledTimes(1);
    });

    it('removes explicit caller-supplied resourceVersion on recovery in streamResultsForCluster', async () => {
      const { sockets } = stubWebSocketCollector();
      const listResponse = (resourceVersion: string) => ({
        kind: 'PodList',
        items: [],
        metadata: { resourceVersion },
      });
      vi.mocked(clusterRequest)
        .mockResolvedValueOnce(listResponse('1') as any)
        .mockResolvedValueOnce(listResponse('2') as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const callerParams = {
        resourceVersion: 'old-100',
        resourceVersionMatch: 'Exact',
        labelSelector: 'app=test',
      };

      streamResultsForCluster(
        '/api/v1/pods',
        {
          cb: vi.fn(),
          errCb: vi.fn(),
          cluster: 'test-cluster',
        },
        callerParams
      );

      await vi.waitFor(() => expect(sockets.length).toBe(1));
      expect(vi.mocked(clusterRequest)).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('resourceVersion=old-100'),
        expect.objectContaining({ cluster: 'test-cluster' })
      );

      // Trigger 410 error
      sockets[0].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'Expired' } }),
        })
      );

      await vi.waitFor(() => expect(sockets.length).toBe(2));

      // Relist must NOT have resourceVersion=old-100 or resourceVersionMatch,
      // but MUST retain labelSelector.
      expect(vi.mocked(clusterRequest)).toHaveBeenNthCalledWith(
        2,
        expect.not.stringContaining('resourceVersion='),
        expect.objectContaining({
          cluster: 'test-cluster',
        })
      );
      const secondCallUrl = vi.mocked(clusterRequest).mock.calls[1][0];
      expect(secondCallUrl).toContain('labelSelector=app%3Dtest');
      expect(secondCallUrl).not.toContain('resourceVersionMatch');

      // Caller params object must not be mutated
      expect(callerParams.resourceVersion).toBe('old-100');
      expect(callerParams.resourceVersionMatch).toBe('Exact');

      // Replacement watch must use fresh version 2
      expect(sockets[1].url).toContain('resourceVersion=2');
      expect(sockets[1].url).not.toContain('resourceVersion=old-100');
    });

    it('removes explicit caller-supplied resourceVersion on recovery in streamResult', async () => {
      const { sockets } = stubWebSocketCollector();
      const pod = (resourceVersion: string) => ({
        kind: 'Pod',
        metadata: { name: 'pod-1', uid: 'pod-1-uid', resourceVersion },
      });
      vi.mocked(clusterRequest)
        .mockResolvedValueOnce(pod('1') as any)
        .mockResolvedValueOnce(pod('2') as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const callerParams = {
        resourceVersion: 'old-100',
        resourceVersionMatch: 'Exact',
      };

      streamResult('/api/v1/pods', 'pod-1', vi.fn(), vi.fn(), callerParams, 'test-cluster');

      await vi.waitFor(() => expect(sockets.length).toBe(1));
      expect(vi.mocked(clusterRequest)).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('resourceVersion=old-100'),
        expect.objectContaining({ cluster: 'test-cluster' })
      );

      // Trigger 410 error
      sockets[0].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'Expired' } }),
        })
      );

      await vi.waitFor(() => expect(sockets.length).toBe(2));

      // Recovery get must not have resourceVersion=old-100
      expect(vi.mocked(clusterRequest)).toHaveBeenNthCalledWith(
        2,
        expect.not.stringContaining('resourceVersion='),
        expect.objectContaining({
          cluster: 'test-cluster',
        })
      );

      // Caller params must remain intact
      expect(callerParams.resourceVersion).toBe('old-100');

      // Single-object replacement watch does not derive cursor from object version to prevent 410 loops
      expect(sockets[1].url).toContain('fieldSelector=metadata.name%3Dpod-1');
      expect(sockets[1].url).not.toContain('resourceVersion=');
    });
  });

  describe('toApiError', () => {
    it('normalizes a Kubernetes Status object mapping code to numeric status and creating an Error', () => {
      const statusObj = {
        kind: 'Status',
        apiVersion: 'v1',
        status: 'Failure',
        code: 404,
        reason: 'NotFound',
        message: 'pods "foo" not found',
      };
      const error = toApiError(statusObj);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(404);
      expect(error.message).toBe('pods "foo" not found');
      expect((error as any).reason).toBe('NotFound');
    });

    it('handles already constructed ApiError and Error instances', () => {
      const apiErr = new ApiError('Existing error', { status: 403 });
      expect(toApiError(apiErr)).toBe(apiErr);

      const standardErr = new Error('Standard error');
      const normalized = toApiError(standardErr);
      expect(normalized).toBeInstanceOf(Error);
      expect(normalized.message).toBe('Standard error');
    });
  });
});
