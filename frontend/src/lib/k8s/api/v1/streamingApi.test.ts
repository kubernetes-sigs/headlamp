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
import { clusterRequest } from './clusterRequests';
import { connectStreamWithParams, streamResult, streamResultsForCluster } from './streamingApi';

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

    it('reports a non-410 single-object watch error through errCb', async () => {
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
            object: { code: 500, reason: 'InternalError', message: 'boom' },
          }),
        })
      );

      await vi.waitFor(() => expect(errCb).toHaveBeenCalled());
      expect(errCb).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'InternalError' }),
        expect.any(Function)
      );
      // Only the initial GET reached cb; the Status object did not.
      expect(cb).toHaveBeenCalledTimes(1);
      expect(clusterRequest).toHaveBeenCalledTimes(1);
    });
  });
});
