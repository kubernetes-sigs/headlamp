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

import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { ApiError } from '../v2/ApiError';
import { clusterRequest } from './clusterRequests';
import {
  connectStreamWithParams,
  isTransientError,
  stream,
  streamResult,
  streamResults,
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

    it('clears stale resources on 410 recovery and applies subsequent watch updates to replacement list', async () => {
      const { sockets } = stubWebSocketCollector();
      const podA = {
        kind: 'Pod',
        metadata: { name: 'pod-a', uid: 'uid-a', resourceVersion: '1' },
      };
      const podB = {
        kind: 'Pod',
        metadata: { name: 'pod-b', uid: 'uid-b', resourceVersion: '1' },
      };
      const podC = {
        kind: 'Pod',
        metadata: { name: 'pod-c', uid: 'uid-c', resourceVersion: '2' },
      };
      const initialList = {
        kind: 'PodList',
        items: [podA, podB],
        metadata: { resourceVersion: '1' },
      };
      const recoveryList = {
        kind: 'PodList',
        items: [podC],
        metadata: { resourceVersion: '2' },
      };

      vi.mocked(clusterRequest)
        .mockResolvedValueOnce(initialList as any)
        .mockResolvedValueOnce(recoveryList as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const cb = vi.fn();
      const errCb = vi.fn();

      streamResultsForCluster('/api/v1/pods', {
        cb,
        errCb,
        cluster: 'test-cluster',
      });

      // Initial LIST delivers podA and podB, then connects watch at resourceVersion 1
      await vi.waitFor(() => expect(sockets.length).toBe(1));
      expect(sockets[0].url).toContain('resourceVersion=1');
      expect(cb).toHaveBeenCalledTimes(1);
      const initialDelivered = cb.mock.calls[0][0];
      expect(initialDelivered).toHaveLength(2);
      expect(initialDelivered.map((p: any) => p.metadata.uid).sort()).toEqual(['uid-a', 'uid-b']);

      // Server reports 410 Gone
      sockets[0].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'ERROR', object: { code: 410, message: 'too old' } }),
        })
      );

      // Recovery LIST must clear stale podA and podB, delivering only fresh podC
      await vi.waitFor(() => expect(sockets.length).toBe(2));
      expect(clusterRequest).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenCalledTimes(2);
      const recoveryDelivered = cb.mock.calls[1][0];
      expect(recoveryDelivered).toHaveLength(1);
      expect(recoveryDelivered[0].metadata.uid).toBe('uid-c');
      expect(sockets[1].url).toContain('resourceVersion=2');

      // Subsequent watch updates on replacement list apply to the new state
      const podD = {
        kind: 'Pod',
        metadata: { name: 'pod-d', uid: 'uid-d', resourceVersion: '3' },
      };
      sockets[1].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'ADDED', object: podD }),
        })
      );

      expect(cb).toHaveBeenCalledTimes(3);
      const addedDelivered = cb.mock.calls[2][0];
      expect(addedDelivered).toHaveLength(2);
      expect(addedDelivered.map((p: any) => p.metadata.uid).sort()).toEqual(['uid-c', 'uid-d']);

      // MODIFIED event on replacement list item
      const podCUpdated = {
        kind: 'Pod',
        metadata: { name: 'pod-c', uid: 'uid-c', resourceVersion: '4' },
      };
      sockets[1].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'MODIFIED', object: podCUpdated }),
        })
      );

      expect(cb).toHaveBeenCalledTimes(4);
      const modifiedDelivered = cb.mock.calls[3][0];
      expect(modifiedDelivered).toHaveLength(2);
      expect(
        modifiedDelivered.find((p: any) => p.metadata.uid === 'uid-c')?.metadata.resourceVersion
      ).toBe('4');

      // DELETED event on replacement list item
      sockets[1].emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'DELETED', object: podCUpdated }),
        })
      );

      expect(cb).toHaveBeenCalledTimes(5);
      const deletedDelivered = cb.mock.calls[4][0];
      expect(deletedDelivered).toHaveLength(1);
      expect(deletedDelivered[0].metadata.uid).toBe('uid-d');
      expect(deletedDelivered.find((p: any) => p.metadata.uid === 'uid-a')).toBeUndefined();
      expect(deletedDelivered.find((p: any) => p.metadata.uid === 'uid-b')).toBeUndefined();
      expect(deletedDelivered.find((p: any) => p.metadata.uid === 'uid-c')).toBeUndefined();
      expect(errCb).not.toHaveBeenCalled();
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

  describe('stream retryOnFail backoff', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('uses exponential backoff (3s, 6s, 12s, ..., capped at 30s) on consecutive failures', async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sockets: { triggerClose: () => void }[] = [];
      const WebSocketMock = vi.fn(function () {
        const listeners: Record<string, (() => void)[]> = {};
        const instance = {
          binaryType: '',
          close: vi.fn(),
          addEventListener: (type: string, listener: () => void) => {
            (listeners[type] = listeners[type] ?? []).push(listener);
          },
          removeEventListener: vi.fn(),
          triggerClose: () => {
            (listeners.close ?? []).forEach(l => l());
          },
        };
        sockets.push(instance);
        return instance;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const conn = stream('/api/v1/pods', vi.fn(), { cluster: '' });
      await vi.advanceTimersByTimeAsync(0);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      // 1st failure -> retry at 3s
      sockets[0].triggerClose();
      await vi.advanceTimersByTimeAsync(2999);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(WebSocketMock).toHaveBeenCalledTimes(2);

      // 2nd failure -> retry at 6s
      sockets[1].triggerClose();
      await vi.advanceTimersByTimeAsync(5999);
      expect(WebSocketMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(WebSocketMock).toHaveBeenCalledTimes(3);

      // 3rd failure -> retry at 12s
      sockets[2].triggerClose();
      await vi.advanceTimersByTimeAsync(11999);
      expect(WebSocketMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(WebSocketMock).toHaveBeenCalledTimes(4);

      conn.cancel();
    });

    it('preserves exponential backoff when watch sends ERROR frames before closing', async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sockets: {
        triggerMessage: (data: unknown) => void;
        triggerClose: () => void;
      }[] = [];
      const WebSocketMock = vi.fn(function () {
        const listeners: Record<string, ((ev: any) => void)[]> = {};
        const instance = {
          binaryType: '',
          close: vi.fn(),
          addEventListener: (type: string, listener: (ev: any) => void) => {
            (listeners[type] = listeners[type] ?? []).push(listener);
          },
          removeEventListener: vi.fn(),
          triggerMessage: (data: unknown) => {
            const event = new MessageEvent('message', { data: JSON.stringify(data) });
            (listeners.message ?? []).forEach(l => l(event));
          },
          triggerClose: () => {
            (listeners.close ?? []).forEach(l => l({}));
          },
        };
        sockets.push(instance);
        return instance;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const conn = stream('/api/v1/pods', vi.fn(), { cluster: '', isJson: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      // 1st ERROR + close -> retry at 3s
      sockets[0].triggerMessage({ type: 'ERROR', object: { code: 429, message: 'rate limited' } });
      sockets[0].triggerClose();
      await vi.advanceTimersByTimeAsync(2999);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(WebSocketMock).toHaveBeenCalledTimes(2);

      // 2nd ERROR + close -> retry at 6s (not reset to 3s)
      sockets[1].triggerMessage({ type: 'ERROR', object: { code: 503, message: 'unavailable' } });
      sockets[1].triggerClose();
      await vi.advanceTimersByTimeAsync(5999);
      expect(WebSocketMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(WebSocketMock).toHaveBeenCalledTimes(3);

      // Normal watch frame resets backoff back to 3s on next close
      sockets[2].triggerMessage({ type: 'ADDED', object: { metadata: { name: 'pod-1' } } });
      sockets[2].triggerClose();
      await vi.advanceTimersByTimeAsync(2999);
      expect(WebSocketMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(WebSocketMock).toHaveBeenCalledTimes(4);

      conn.cancel();
    });
  });
});

describe('cancelling a stream from its first callback', () => {
  beforeEach(() => {
    vi.mocked(isDebugVerbose).mockReturnValue(false);
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Makes the initial request wait until the returned function is called with its response. */
  function deferClusterRequest() {
    let respond: (response: unknown) => void = () => {};
    vi.mocked(clusterRequest).mockReturnValue(
      new Promise(resolve => {
        respond = resolve;
      })
    );
    return (response: unknown) => respond(response);
  }

  function stubWebSocket() {
    const WebSocketMock = vi.fn(function () {
      return { addEventListener: vi.fn(), binaryType: '', close: vi.fn() };
    });
    vi.stubGlobal('WebSocket', WebSocketMock);
    return WebSocketMock;
  }

  /** Lets the stream finish its pending work, such as opening the watch socket. */
  function settle() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  it('does not open a watch when the list callback cancels the stream', async () => {
    const WebSocketMock = stubWebSocket();
    const respond = deferClusterRequest();
    // Like Deployment.getOwnedReplicaSets(): read the list once, then cancel.
    let cancel: (() => void) | undefined;
    const cb = vi.fn(() => cancel?.());

    await streamResultsForCluster('/apis/apps/v1/namespaces/default/replicasets', {
      cb,
      errCb: vi.fn(),
      cluster: 'test-cluster',
    }).then(cancelStream => {
      cancel = cancelStream;
    });
    respond({
      kind: 'ReplicaSetList',
      items: [{ metadata: { uid: 'rs-1', name: 'rs-1', resourceVersion: '1' } }],
      metadata: { resourceVersion: '1' },
    });
    await settle();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(WebSocketMock).not.toHaveBeenCalled();
  });

  it('does not open a watch when the item callback cancels the stream', async () => {
    const WebSocketMock = stubWebSocket();
    const respond = deferClusterRequest();
    let cancel: (() => void) | undefined;
    const cb = vi.fn(() => cancel?.());

    await streamResult(
      '/api/v1/namespaces/default/pods',
      'my-pod',
      cb,
      vi.fn(),
      undefined,
      'test-cluster'
    ).then(cancelStream => {
      cancel = cancelStream;
    });
    respond({ metadata: { uid: 'pod-1', name: 'my-pod', resourceVersion: '1' } });
    await settle();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(WebSocketMock).not.toHaveBeenCalled();
  });

  it('still opens the watch when the stream is not cancelled', async () => {
    const WebSocketMock = stubWebSocket();
    const respond = deferClusterRequest();
    const cb = vi.fn();

    const cancel = await streamResultsForCluster('/apis/apps/v1/namespaces/default/replicasets', {
      cb,
      errCb: vi.fn(),
      cluster: 'test-cluster',
    });
    respond({ kind: 'ReplicaSetList', items: [], metadata: { resourceVersion: '1' } });
    await settle();

    expect(WebSocketMock).toHaveBeenCalledTimes(1);
    cancel();
  });
});

describe('streamResults, watch updates, limits, errors, and reconnection', () => {
  beforeEach(() => {
    vi.mocked(isDebugVerbose).mockReturnValue(false);
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubSocketWithListeners() {
    const listeners: Record<string, EventListener> = {};
    const sockets: Array<{
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      binaryType: string;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        const socket = {
          addEventListener: vi.fn((type: string, listener: EventListener) => {
            listeners[type] = listener;
          }),
          removeEventListener: vi.fn(),
          binaryType: '',
          close: vi.fn(),
        };
        sockets.push(socket);
        return socket;
      })
    );
    return { listeners, sockets };
  }

  it('handles ADDED, MODIFIED, DELETED, ERROR, unknown updates, and limit in streamResults', async () => {
    const { listeners } = stubSocketWithListeners();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(clusterRequest).mockResolvedValueOnce({
      kind: 'PodList',
      items: [
        {
          metadata: {
            uid: 'u1',
            name: 'p1',
            resourceVersion: '2',
            creationTimestamp: '2025-01-01T00:00:00Z',
          },
        },
        {
          metadata: {
            uid: 'u2',
            name: 'p2',
            resourceVersion: '2',
            creationTimestamp: '2025-01-03T00:00:00Z',
          },
        },
      ],
      metadata: { resourceVersion: '2' },
    });

    const cb = vi.fn();
    const cancel = await streamResults('/api/v1/pods', cb, vi.fn(), { limit: '2' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cb).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'Pod', metadata: expect.objectContaining({ uid: 'u1' }) }),
      ])
    );

    const sendUpdate = (payload: unknown) =>
      listeners.message(new MessageEvent('message', { data: JSON.stringify(payload) }));

    // ADDED new item triggers limit=2 truncation (keeps newest 2)
    sendUpdate({
      type: 'ADDED',
      object: {
        metadata: {
          uid: 'u3',
          name: 'p3',
          resourceVersion: '3',
          creationTimestamp: '2025-01-02T00:00:00Z',
        },
      },
    });
    const afterAdd = cb.mock.calls.at(-1)?.[0];
    expect(afterAdd).toHaveLength(2);
    expect(afterAdd.map((x: any) => x.metadata.uid)).toEqual(['u2', 'u3']);

    // MODIFIED with newer resourceVersion updates existing
    sendUpdate({
      type: 'MODIFIED',
      object: { metadata: { uid: 'u2', name: 'p2-updated', resourceVersion: '5' } },
    });
    expect(cb.mock.calls.at(-1)?.[0].find((x: any) => x.metadata.uid === 'u2').metadata.name).toBe(
      'p2-updated'
    );

    // MODIFIED with same resourceVersion is ignored
    sendUpdate({
      type: 'MODIFIED',
      object: { metadata: { uid: 'u2', name: 'p2-same-rv', resourceVersion: '5' } },
    });
    expect(cb.mock.calls.at(-1)?.[0].find((x: any) => x.metadata.uid === 'u2').metadata.name).toBe(
      'p2-updated'
    );

    // MODIFIED missing resourceVersion applies update
    sendUpdate({ type: 'MODIFIED', object: { metadata: { uid: 'u2', name: 'p2-no-rv' } } });
    expect(cb.mock.calls.at(-1)?.[0].find((x: any) => x.metadata.uid === 'u2').metadata.name).toBe(
      'p2-no-rv'
    );

    // MODIFIED for unknown uid inserts it
    sendUpdate({
      type: 'MODIFIED',
      object: {
        metadata: {
          uid: 'u4',
          name: 'p4',
          resourceVersion: '6',
          creationTimestamp: '2025-01-04T00:00:00Z',
        },
      },
    });

    // DELETED removes item
    sendUpdate({ type: 'DELETED', object: { metadata: { uid: 'u4' } } });
    expect(cb.mock.calls.at(-1)?.[0].some((x: any) => x.metadata.uid === 'u4')).toBe(false);

    // ERROR and unknown update types log errors without throwing
    sendUpdate({ type: 'ERROR', object: { message: 'watch error' } });
    sendUpdate({ type: 'BOOKMARK', object: {} });

    cancel();
  });

  it('invokes errCb when initial clusterRequest fails in streamResult and streamResultsForCluster', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    vi.mocked(clusterRequest).mockRejectedValueOnce(err).mockRejectedValueOnce(err);

    const errCb1 = vi.fn();
    await streamResult('/api/v1/pods', 'p1', vi.fn(), errCb1, undefined, 'c1');
    const errCb2 = vi.fn();
    await streamResultsForCluster('/api/v1/pods', { cb: vi.fn(), errCb: errCb2, cluster: 'c1' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errCb1).toHaveBeenCalledWith(err, expect.any(Function));
    expect(errCb2).toHaveBeenCalledWith(err, expect.any(Function));
  });

  it('handles close, error, kubeconfig lookup failure, and reconnect in stream()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    (findKubeconfigByClusterName as Mock).mockRejectedValue(new Error('kubeconfig err'));

    const { listeners, sockets } = stubSocketWithListeners();
    const connectCb = vi.fn();
    const failCb = vi.fn();

    const handle = stream('/api/v1/pods', vi.fn(), {
      cluster: 'c1',
      connectCb,
      failCb,
      reconnectOnFailure: true,
    });
    expect(handle.getSocket()).toBeNull();

    // Let connectStreamWithParams resolve
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(connectCb).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    const initialSocket = sockets[0];
    expect(handle.getSocket()).toBe(initialSocket);

    listeners.error(new Event('error'));
    vi.useFakeTimers();
    listeners.close(new CloseEvent('close'));

    expect(initialSocket.removeEventListener).toHaveBeenCalled();
    expect(failCb).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(connectCb).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(2);
    const replacementSocket = sockets[1];
    expect(replacementSocket).not.toBe(initialSocket);
    expect(handle.getSocket()).toBe(replacementSocket);

    handle.cancel();
    expect(replacementSocket.close).toHaveBeenCalled();
    expect(initialSocket.close).not.toHaveBeenCalled();
  });
});
