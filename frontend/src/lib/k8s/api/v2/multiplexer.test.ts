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

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import WS from 'vitest-websocket-mock';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { getCluster } from '../../../cluster';
import { notifyTokenRefreshed } from '../../../queryClient';
import { MULTIPLEXER_ENDPOINT, resetMultiplexerAuthForTesting } from './multiplexer';
import { useWebSocket } from './multiplexer';
import { WebSocketManager } from './multiplexer';
import { BASE_WS_URL } from './webSocket';

// Mock dependencies
vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(),
}));

vi.mock('./fetch', () => ({
  clusterFetch: (...args: any[]) => mockClusterFetch(...args),
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(),
}));

vi.mock('../../../auth', () => ({
  getToken: vi.fn(),
}));

vi.mock('./makeUrl', () => ({
  makeUrl: vi.fn((paths: string[] | string, query = {}) => {
    const url = Array.isArray(paths) ? paths.filter(Boolean).join('/') : paths;
    const queryString = new URLSearchParams(query).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    return fullUrl.replace(/([^:]\/)\/+/g, '$1');
  }),
}));

const clusterName = 'test-cluster';
const userId = 'test-user';
const mockClusterFetch = vi.fn();

async function receiveAckedWatch(server: WS) {
  const request = JSON.parse((await server.nextMessage) as string);
  if (request.requestId) server.send(JSON.stringify({ ...request, type: 'ACK' }));
  return request;
}

function closeSocket(socket: WebSocket, code = 1013) {
  const onclose = socket.onclose;
  socket.onclose = null;
  socket.close();
  onclose?.call(socket, { code } as CloseEvent);
}

describe('WebSocket Multiplexer', () => {
  let mockServer: WS;
  let onMessage: Mock<(data: any) => void>;
  let onError: Mock<(error: any) => void>;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    vi.clearAllMocks();
    mockClusterFetch.mockResolvedValue({
      headers: new Headers({ 'X-Headlamp-Multiplexer-Auth': 'cookie' }),
    });
    setBackendToken(null);
    onMessage = vi.fn();
    onError = vi.fn();
    (getCluster as ReturnType<typeof vi.fn>).mockReturnValue(clusterName);
    (getUserIdFromLocalStorage as ReturnType<typeof vi.fn>).mockReturnValue(userId);
    (findKubeconfigByClusterName as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Mock console.error for all tests
    originalConsoleError = console.error;
    console.error = vi.fn();

    mockServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`);
  });

  afterEach(async () => {
    WebSocketManager.retryableWatches.clear();
    WebSocketManager.errorListeners.clear();
    WebSocketManager.staleCredentialClusters.clear();
    WebSocketManager.socketCookieClusters.clear();
    resetMultiplexerAuthForTesting();

    // Restore console.error
    console.error = originalConsoleError;

    WS.clean();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    setBackendToken(null);
    WebSocketManager.socketMultiplexer = null;
    WebSocketManager.connecting = false;
    WebSocketManager.connectionPromise = null;
    WebSocketManager.connectionGeneration = 0;
    WebSocketManager.isReconnecting = false;
    WebSocketManager.listeners.clear();
    WebSocketManager.pendingWatchRetries.clear();
    WebSocketManager.connectedRoutes.clear();
    WebSocketManager.pendingWatchRequests.clear();
    if (WebSocketManager.watchRequestTimeout) clearTimeout(WebSocketManager.watchRequestTimeout);
    WebSocketManager.watchRequestTimeout = null;
    WebSocketManager.inFlightWatchRequest = null;
    WebSocketManager.subscriptionSequence = 0;
    WebSocketManager.requestSequence = 0;
    WebSocketManager.overloadRecoveries = 0;
    WebSocketManager.cancelWatchRecovery();
    WebSocketManager.cancelLegacyWatchHealth();
    WebSocketManager.completedPaths.clear();
    WebSocketManager.activeSubscriptions.clear();
    WebSocketManager.pendingUnsubscribes.forEach(clearTimeout);
    WebSocketManager.pendingUnsubscribes.clear();
  });

  describe('WebSocketManager', () => {
    it('bootstraps a pre-upgrade cookie before opening the socket', async () => {
      await WebSocketManager.subscribe(clusterName, '/pods', 'watch=1', onMessage, onError);

      expect(mockClusterFetch).toHaveBeenCalledWith(
        'multiplexer-auth',
        expect.objectContaining({ cluster: clusterName, method: 'POST' })
      );
      await WebSocketManager.subscribe(clusterName, '/services', 'watch=1', onMessage, onError);
      expect(mockClusterFetch).toHaveBeenCalledOnce();
    });

    it('restarts bootstrap if credentials change while it is in flight', async () => {
      let finishBootstrap!: (response: object) => void;
      mockClusterFetch
        .mockReturnValueOnce(new Promise(resolve => (finishBootstrap = resolve)))
        .mockResolvedValueOnce({});

      const subscribing = WebSocketManager.subscribe(
        clusterName,
        '/pods',
        'watch=1',
        onMessage,
        onError
      );
      await waitFor(() => expect(mockClusterFetch).toHaveBeenCalledOnce());
      notifyTokenRefreshed(clusterName);
      finishBootstrap({});
      await subscribing;

      expect(mockClusterFetch).toHaveBeenCalledTimes(2);
    });

    it('reconnects before subscribing a newly bootstrapped cluster', async () => {
      await WebSocketManager.subscribe(clusterName, '/pods', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      await receiveAckedWatch(mockServer);
      const initial = WebSocketManager.socketMultiplexer;

      await WebSocketManager.subscribe('cluster-b', '/pods', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });

      expect(WebSocketManager.socketMultiplexer).not.toBe(initial);
    });

    it.each([
      { name: 'one cluster', detail: { cluster: clusterName } },
      { name: 'all clusters', detail: {} },
    ])('reconnects active v2 watches after $name reset', async ({ detail }) => {
      await WebSocketManager.subscribe(clusterName, '/pods', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      const initial = await receiveAckedWatch(mockServer);
      window.dispatchEvent(new CustomEvent('headlamp-credentials-changed', { detail }));
      const reconnected = await receiveAckedWatch(mockServer);
      expect(reconnected).toMatchObject({
        clusterId: initial.clusterId,
        path: initial.path,
        query: initial.query,
      });
    });

    it('replaces an idle open socket after OIDC refresh', async () => {
      const initial = await WebSocketManager.connect();

      notifyTokenRefreshed(clusterName);

      await WebSocketManager.subscribe(clusterName, '/pods', 'watch=1', onMessage, onError);
      await mockServer.connected;
      expect(WebSocketManager.socketMultiplexer).not.toBe(initial);
      const request = JSON.parse((await mockServer.nextMessage) as string);
      expect(request.clusterId).toBe(clusterName);
    });

    it('does not replace a socket for an unrelated refreshed cluster', async () => {
      await WebSocketManager.subscribe('cluster-b', '/pods', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      await receiveAckedWatch(mockServer);
      const socket = WebSocketManager.socketMultiplexer;

      notifyTokenRefreshed(clusterName);

      expect(WebSocketManager.socketMultiplexer).toBe(socket);
      expect(WebSocketManager.staleCredentialClusters).toEqual(new Set([clusterName]));
    });

    it('ignores stale close/error/message events while replacing a closing socket', async () => {
      await WebSocketManager.subscribe(clusterName, '/first', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      await receiveAckedWatch(mockServer);
      const old = WebSocketManager.socketMultiplexer!;
      const staleClose = old.onclose!;
      const staleError = old.onerror!;
      const staleMessage = old.onmessage!;
      Object.defineProperty(old, 'readyState', { configurable: true, value: WebSocket.CLOSING });
      const recoverWatches = vi.spyOn(WebSocketManager, 'recoverWatches');
      const attempt = WebSocketManager.connect();
      const sharedPromise = WebSocketManager.connectionPromise;
      staleClose.call(old, { code: 1006 } as CloseEvent);
      staleError.call(old, new Event('error'));
      expect(WebSocketManager.connectionPromise).toBe(sharedPromise);
      const replacement = await attempt;
      expect(replacement).not.toBe(old);
      const request = JSON.parse((await mockServer.nextMessage) as string);
      expect(request.path).toBe('/first');
      staleMessage.call(old, { data: JSON.stringify({ ...request, type: 'ACK' }) } as MessageEvent);
      expect(WebSocketManager.inFlightWatchRequest?.requestId).toBe(request.requestId);
      mockServer.send(JSON.stringify({ ...request, type: 'ACK' }));
      staleClose.call(old, { code: 1006 } as CloseEvent);
      expect(WebSocketManager.socketMultiplexer).toBe(replacement);
      expect(await WebSocketManager.connect()).toBe(replacement);
      expect(recoverWatches).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('queues a fresh same-key request when subscribe runs between handshake ERROR and ACK', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const retry = vi.fn(() => {
        void WebSocketManager.subscribe(clusterName, path, query, vi.fn(), onError, {
          retryWatch: true,
        });
      });
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, retry, {
        retryWatch: true,
      });
      const initial = JSON.parse((await mockServer.nextMessage) as string);
      mockServer.send(
        JSON.stringify({
          ...initial,
          type: 'ERROR',
          data: JSON.stringify({ error: 'dial failed' }),
        })
      );
      await waitFor(() => expect(WebSocketManager.pendingWatchRequests.size).toBe(1));
      expect(retry).toHaveBeenCalledOnce();
      expect(WebSocketManager.inFlightWatchRequest?.requestId).toBe(initial.requestId);
      mockServer.send(JSON.stringify({ ...initial, type: 'ACK' }));
      const fresh = await receiveAckedWatch(mockServer);
      expect(fresh.path).toBe(path);
      expect(fresh.requestId).not.toBe(initial.requestId);
    });

    it('keeps connected readiness across COMPLETE version markers before a debounce remount', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=1';
      const stop = await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      const initial = await receiveAckedWatch(mockServer);
      mockServer.send(
        JSON.stringify({ ...initial, type: 'STATUS', data: JSON.stringify({ state: 'connected' }) })
      );
      mockServer.send(JSON.stringify({ ...initial, type: 'COMPLETE' }));
      mockServer.send(
        JSON.stringify({
          ...initial,
          type: 'DATA',
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { resourceVersion: '2' } },
          }),
        })
      );
      const send = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');
      stop();
      await WebSocketManager.subscribe(clusterName, path, query, vi.fn(), onError, {
        retryWatch: true,
      });
      expect(send).not.toHaveBeenCalled();
      expect(
        WebSocketManager.connectedRoutes.has(WebSocketManager.createKey(clusterName, path, query))
      ).toBe(true);
    });

    it('does not pace quiet legacy same-path selectors or wait for nonexistent response credit', async () => {
      mockServer.close();
      mockServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`, {
        selectProtocol: () => 'headlamp.multiplexer.k8s.io',
      });
      const queries = [
        'watch=1&fieldSelector=reason%3DUpgrade',
        'watch=1&fieldSelector=reason%3DSurge',
      ];
      await WebSocketManager.subscribe(clusterName, '/events', queries[0], onMessage, onError, {
        retryWatch: true,
      });
      await mockServer.nextMessage;
      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path: '/events',
          query: '',
          type: 'STATUS',
          data: JSON.stringify({ state: 'connected' }),
        })
      );
      await WebSocketManager.subscribe(clusterName, '/events', queries[1], onMessage, onError, {
        retryWatch: true,
      });
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        query: queries[1],
        type: 'REQUEST',
      });
      await WebSocketManager.subscribe(clusterName, '/pods', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      expect(JSON.parse((await mockServer.nextMessage) as string).path).toBe('/pods');
      expect(WebSocketManager.inFlightWatchRequest).toBeNull();
      expect(WebSocketManager.watchRequestTimeout).toBeNull();
      const send = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');
      await WebSocketManager.subscribe(clusterName, '/events', queries[0], vi.fn(), onError, {
        retryWatch: true,
      });
      expect(send).not.toHaveBeenCalled();
    });

    it.each(['closed', 'error'])('reissues a same-query subscription after %s', async state => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      const initial = await receiveAckedWatch(mockServer);
      mockServer.send(
        JSON.stringify({
          ...initial,
          type: 'STATUS',
          data: JSON.stringify({ state }),
        })
      );
      if (state === 'error') {
        mockServer.send(
          JSON.stringify({
            ...initial,
            type: 'ERROR',
            data: JSON.stringify({ error: 'handshake failed' }),
          })
        );
      }
      await WebSocketManager.subscribe(clusterName, path, query, vi.fn(), onError, {
        retryWatch: true,
      });
      const reopened = await receiveAckedWatch(mockServer);
      expect(reopened).toMatchObject({ clusterId: clusterName, path, query, type: 'REQUEST' });
      expect(reopened.requestId).not.toBe(initial.requestId);
    });

    it('reuses a connected same-query watch across the unsubscribe debounce', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const stop = await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      const initial = await receiveAckedWatch(mockServer);
      mockServer.send(
        JSON.stringify({
          ...initial,
          type: 'STATUS',
          data: JSON.stringify({ state: 'connected' }),
        })
      );
      const send = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');
      vi.useFakeTimers();
      try {
        stop();
        await WebSocketManager.subscribe(clusterName, path, query, vi.fn(), onError, {
          retryWatch: true,
        });
        await vi.advanceTimersByTimeAsync(100);
        expect(send).not.toHaveBeenCalled();
        expect(WebSocketManager.pendingUnsubscribes.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('requests a snapshot when a watch event arrived during the unsubscribe debounce', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=1';
      const stop = await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      const request = await receiveAckedWatch(mockServer);
      mockServer.send(
        JSON.stringify({
          ...request,
          type: 'STATUS',
          data: JSON.stringify({ state: 'connected' }),
        })
      );
      stop();
      mockServer.send(
        JSON.stringify({
          ...request,
          type: 'DATA',
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { resourceVersion: '2' } },
          }),
        })
      );
      const remounted = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, remounted, onError, {
        retryWatch: true,
      });
      expect(onMessage).not.toHaveBeenCalled();
      expect(remounted).toHaveBeenCalledExactlyOnceWith({
        type: 'ERROR',
        object: expect.objectContaining({ code: 410 }),
      });
    });

    it('queues a new same-key generation after CLOSE until the canceled request ACK arrives', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const stop = await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      const initial = JSON.parse((await mockServer.nextMessage) as string);
      stop();
      expect(JSON.parse((await mockServer.nextMessage) as string).type).toBe('CLOSE');
      await WebSocketManager.subscribe(clusterName, path, query, vi.fn(), onError, {
        retryWatch: true,
      });
      expect(WebSocketManager.pendingWatchRequests.size).toBe(1);
      expect(WebSocketManager.inFlightWatchRequest?.requestId).toBe(initial.requestId);
      mockServer.send(JSON.stringify({ ...initial, type: 'ACK' }));
      const reopened = JSON.parse((await mockServer.nextMessage) as string);
      expect(reopened).toMatchObject({ clusterId: clusterName, path, query, type: 'REQUEST' });
      expect(reopened.requestId).not.toBe(initial.requestId);
      mockServer.send(JSON.stringify({ ...reopened, type: 'ACK' }));
    });

    it.each([1000, 1001, 1006])(
      'automatically recovers watches after close %s without replaying generic or exec streams',
      async code => {
        const finiteError = vi.fn();
        await WebSocketManager.subscribe(
          clusterName,
          '/api/v1/pods/p/exec',
          'command=probe',
          onMessage,
          finiteError
        );
        await mockServer.nextMessage;
        await WebSocketManager.subscribe(
          clusterName,
          '/generic',
          'watch=1',
          onMessage,
          finiteError
        );
        await mockServer.nextMessage;
        await WebSocketManager.subscribe(
          clusterName,
          '/safe-watch',
          'watch=1',
          onMessage,
          onError,
          { retryWatch: true }
        );
        await receiveAckedWatch(mockServer);
        closeSocket(WebSocketManager.socketMultiplexer!, code);
        expect(finiteError).toHaveBeenCalledTimes(2);
        expect(finiteError).toHaveBeenLastCalledWith(
          expect.objectContaining({ message: expect.stringContaining('new request') })
        );
        expect(onError).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ message: expect.stringContaining('disconnected') })
        );
        const recovered = await receiveAckedWatch(mockServer);
        expect(recovered.path).toBe('/safe-watch');
        expect(mockServer.messages).toHaveLength(4);
        const update = { type: 'MODIFIED', object: { metadata: { resourceVersion: '2' } } };
        mockServer.send(
          JSON.stringify({ ...recovered, type: 'DATA', data: JSON.stringify(update) })
        );
        await waitFor(() => expect(onMessage).toHaveBeenCalledExactlyOnceWith(update));
      }
    );

    it.each(['STATUS', 'ERROR', 'DATA'])(
      'uses legacy %s credit when the backend does not send ACKs',
      async type => {
        mockServer.close();
        mockServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`, {
          selectProtocol: () => 'headlamp.multiplexer.k8s.io',
        });
        await Promise.all(
          ['/first', '/second', '/third'].map(path =>
            WebSocketManager.subscribe(clusterName, path, 'watch=1', onMessage, onError, {
              retryWatch: true,
            })
          )
        );
        expect(WebSocketManager.socketMultiplexer?.protocol).toBe('headlamp.multiplexer.k8s.io');
        for (const path of ['/first', '/second', '/third']) {
          const request = JSON.parse((await mockServer.nextMessage) as string);
          expect(request.path).toBe(path);
          mockServer.send(
            JSON.stringify({
              clusterId: clusterName,
              path,
              type,
              data: JSON.stringify({ state: 'connected', error: 'legacy handshake error' }),
            })
          );
        }
        expect(WebSocketManager.inFlightWatchRequest).toBeNull();
        expect(WebSocketManager.pendingWatchRequests.size).toBe(0);
      }
    );

    it('waits for the negotiated v2 ACK rather than treating STATUS as processing credit', async () => {
      await WebSocketManager.subscribe(clusterName, '/first', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      const initial = JSON.parse((await mockServer.nextMessage) as string);
      expect(WebSocketManager.socketMultiplexer?.protocol).toBe('headlamp.multiplexer.v2.k8s.io');
      await WebSocketManager.subscribe(clusterName, '/second', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      mockServer.send(
        JSON.stringify({ ...initial, type: 'STATUS', data: JSON.stringify({ state: 'connected' }) })
      );
      expect(WebSocketManager.inFlightWatchRequest?.requestId).toBe(initial.requestId);
      expect(WebSocketManager.pendingWatchRequests.size).toBe(1);
      mockServer.send(JSON.stringify({ ...initial, type: 'ACK' }));
      expect((await receiveAckedWatch(mockServer)).path).toBe('/second');
    });

    it('bounds missing ACKs with watch-only recovery and finite-stream error notification', async () => {
      vi.useFakeTimers();
      try {
        const finiteError = vi.fn();
        const finite = WebSocketManager.subscribe(
          clusterName,
          '/exec',
          'command=probe',
          vi.fn(),
          finiteError
        );
        await vi.advanceTimersByTimeAsync(20);
        await finite;
        const subscription = WebSocketManager.subscribe(
          clusterName,
          '/first',
          'watch=1',
          onMessage,
          onError,
          { retryWatch: true }
        );
        await vi.advanceTimersByTimeAsync(20);
        await subscription;
        const original = WebSocketManager.socketMultiplexer!;
        // Recovery must start even if the browser never reports the close.
        original.onclose = null;
        await vi.advanceTimersByTimeAsync(60_000);
        await vi.advanceTimersByTimeAsync(20);
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('timed out'),
          })
        );
        expect(finiteError).toHaveBeenCalledOnce();
        expect(WebSocketManager.socketMultiplexer).not.toBe(original);
        expect(WebSocketManager.socketMultiplexer?.readyState).toBe(WebSocket.OPEN);
        expect(WebSocketManager.inFlightWatchRequest?.message.path).toBe('/first');
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the missing-ACK budget across snapshot-driven route replacements', async () => {
      vi.useFakeTimers();
      try {
        let query = 'watch=1&resourceVersion=1';
        let stop: () => void;
        const snapshots = vi.fn((update: { type: string }) => {
          if (update.type !== 'ERROR') return;
          stop();
          query = `watch=1&resourceVersion=${
            Number(new URLSearchParams(query).get('resourceVersion')) + 2
          }`;
          void WebSocketManager.subscribe(clusterName, '/api/v1/pods', query, snapshots, onError, {
            retryWatch: true,
          }).then(cleanup => {
            stop = cleanup;
          });
        });
        const initial = WebSocketManager.subscribe(
          clusterName,
          '/api/v1/pods',
          query,
          snapshots,
          onError,
          { retryWatch: true }
        );
        await vi.advanceTimersByTimeAsync(20);
        stop = await initial;
        for (let attempt = 1; attempt <= 4; attempt++) {
          WebSocketManager.handleWebSocketMessage(
            new MessageEvent('message', {
              data: JSON.stringify({
                clusterId: clusterName,
                path: '/api/v1/pods',
                query,
                type: 'DATA',
                data: JSON.stringify({
                  type: 'MODIFIED',
                  object: { metadata: { resourceVersion: String(attempt * 2) } },
                }),
              }),
            })
          );
          await vi.advanceTimersByTimeAsync(60_000);
          await vi.advanceTimersByTimeAsync(20);
          expect(WebSocketManager.overloadRecoveries).toBe(Math.min(attempt, 3));
        }
        expect(WebSocketManager.socketMultiplexer).toBeNull();
        expect(WebSocketManager.inFlightWatchRequest).toBeNull();
        expect(snapshots.mock.calls.filter(([update]) => update.type === 'ERROR')).toHaveLength(3);
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ message: expect.stringContaining('timed out') })
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('forwards error statuses to only their route and clears the warning through readiness', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&fieldSelector=metadata.name%3Dfirst';
      const ready = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
        onReady: ready,
      });
      const request = await receiveAckedWatch(mockServer);
      const otherError = vi.fn();
      await WebSocketManager.subscribe(
        clusterName,
        path,
        'watch=1&fieldSelector=metadata.name%3Dother',
        vi.fn(),
        otherError,
        { retryWatch: true }
      );
      await receiveAckedWatch(mockServer);
      mockServer.send(
        JSON.stringify({
          ...request,
          type: 'STATUS',
          data: JSON.stringify({ state: 'error', error: 'replacement connection failed' }),
        })
      );
      await waitFor(() =>
        expect(onError).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ message: 'replacement connection failed' })
        )
      );
      expect(otherError).not.toHaveBeenCalled();
      expect(ready).not.toHaveBeenCalled();
      mockServer.send(
        JSON.stringify({
          ...request,
          type: 'STATUS',
          data: JSON.stringify({ state: 'connected' }),
        })
      );
      await waitFor(() => expect(ready).toHaveBeenCalledOnce());
    });

    it('forwards two active selector queries on the same path without replacing either', async () => {
      const path = '/api/v1/events';
      const queries = [
        'watch=1&fieldSelector=reason%3DUpgrade',
        'watch=1&fieldSelector=reason%3DSurge',
      ];
      const callbacks = queries.map(() => vi.fn());
      for (let index = 0; index < queries.length; index++) {
        await WebSocketManager.subscribe(
          clusterName,
          path,
          queries[index],
          callbacks[index],
          onError,
          { retryWatch: true }
        );
        const request = await receiveAckedWatch(mockServer);
        expect(request.reopen).toBeUndefined();
        mockServer.send(
          JSON.stringify({
            ...request,
            type: 'STATUS',
            data: JSON.stringify({ state: 'connected' }),
          })
        );
      }
      queries.forEach((query, index) =>
        mockServer.send(
          JSON.stringify({
            clusterId: clusterName,
            path,
            query,
            type: 'DATA',
            data: JSON.stringify({ type: 'ADDED', index }),
          })
        )
      );
      callbacks.forEach((callback, index) => {
        expect(callback).toHaveBeenCalledExactlyOnceWith({ type: 'ADDED', index });
      });
      expect(WebSocketManager.connectedRoutes.size).toBe(2);
    });

    it.each(['error-first', 'connected-first', 'stale-connected', 'completed-first'])(
      'reopens an opted-in watch with its own query after replacement (%s)',
      async order => {
        const path = '/api/v1/pods';
        const query = 'watch=1&resourceVersion=42';
        await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
          retryWatch: true,
        });
        const originalSocket = WebSocketManager.socketMultiplexer!;
        const initial = await receiveAckedWatch(mockServer);
        const send = vi.spyOn(originalSocket, 'send');
        (getUserIdFromLocalStorage as ReturnType<typeof vi.fn>).mockReturnValue('changed-user');
        const connected = {
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({
            state: order === 'completed-first' ? 'closed' : 'connected',
            error: '',
          }),
        };
        const rejected = {
          clusterId: clusterName,
          path,
          query,
          type: 'ERROR',
          data: JSON.stringify({
            code: 'subscription_reconnecting',
            error: 'subscription is already reconnecting; retry after reconnection',
            retryReady: order === 'connected-first' || order === 'completed-first',
          }),
        };
        if (order === 'connected-first' || order === 'completed-first') {
          mockServer.send(JSON.stringify(connected));
          mockServer.send(JSON.stringify(rejected));
        } else {
          if (order === 'stale-connected') {
            mockServer.send(JSON.stringify(connected));
          }
          mockServer.send(JSON.stringify(rejected));
          await waitFor(() => expect(WebSocketManager.pendingWatchRetries.size).toBe(1));
          expect(send).not.toHaveBeenCalled();
          mockServer.send(JSON.stringify(connected));
        }
        expect(JSON.parse((await mockServer.nextMessage) as string)).toEqual({
          ...initial,
          query,
          userId,
          reopen: true,
          requestId: expect.any(String),
        });
        expect(WebSocketManager.socketMultiplexer).toBe(originalSocket);
        expect(WebSocketManager.pendingWatchRetries.size).toBe(0);
        mockServer.send(JSON.stringify(connected));
        const update = { type: 'ADDED', object: { metadata: { name: 'new-query-pod' } } };
        mockServer.send(
          JSON.stringify({
            clusterId: clusterName,
            path,
            query,
            type: 'DATA',
            data: JSON.stringify(update),
          })
        );
        await waitFor(() => expect(onMessage).toHaveBeenCalledWith(update));
        expect(onError).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledTimes(1);
      }
    );

    it.each([
      { path: '/api/v1/pods', query: 'watch=1', options: {} },
      { path: '/api/v1/pods/p/exec', query: 'command=probe', options: { retryWatch: true } },
    ])('does not retry generic/exec requests ($path)', async ({ path, query, options }) => {
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, options);
      await receiveAckedWatch(mockServer);
      const send = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');
      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({ state: 'connected' }),
        })
      );
      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          type: 'ERROR',
          data: JSON.stringify({
            code: 'subscription_reconnecting',
            error: 'retry after reconnection',
          }),
        })
      );
      await waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(send).not.toHaveBeenCalled();
    });

    it('cancels a pending watch retry when its last listener unsubscribes', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=42';
      const unsubscribe = await WebSocketManager.subscribe(
        clusterName,
        path,
        query,
        onMessage,
        onError,
        { retryWatch: true }
      );
      await receiveAckedWatch(mockServer);
      const send = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');
      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          type: 'ERROR',
          data: JSON.stringify({
            code: 'subscription_reconnecting',
            error: 'retry after reconnection',
          }),
        })
      );
      await waitFor(() => expect(WebSocketManager.pendingWatchRetries.size).toBe(1));
      unsubscribe();
      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({ state: 'connected' }),
        })
      );
      expect(WebSocketManager.pendingWatchRetries.size).toBe(0);
      expect(
        send.mock.calls.filter(([message]) => JSON.parse(String(message)).type === 'REQUEST')
      ).toHaveLength(0);
    });

    it('closes distinct queries on the same path independently', async () => {
      const path = '/api/v1/pods';
      const oldQuery = 'watch=1&resourceVersion=10';
      const newQuery = 'watch=1&resourceVersion=42';
      const stopOld = await WebSocketManager.subscribe(
        clusterName,
        path,
        oldQuery,
        onMessage,
        onError,
        {
          retryWatch: true,
        }
      );
      await receiveAckedWatch(mockServer);
      const stopNew = await WebSocketManager.subscribe(
        clusterName,
        path,
        newQuery,
        onMessage,
        onError,
        {
          retryWatch: true,
        }
      );
      await receiveAckedWatch(mockServer);
      const send = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');
      vi.useFakeTimers();
      try {
        stopOld();
        await vi.advanceTimersByTimeAsync(100);
        expect(send).toHaveBeenCalledOnce();
        expect(JSON.parse(String(send.mock.calls[0][0]))).toEqual({
          clusterId: clusterName,
          path,
          query: oldQuery,
          userId,
          type: 'CLOSE',
        });
        stopNew();
        await vi.advanceTimersByTimeAsync(100);
        expect(send).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(send.mock.calls[1][0]))).toEqual({
          clusterId: clusterName,
          path,
          query: newQuery,
          userId,
          type: 'CLOSE',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not automatically reopen a normally completed watch', async () => {
      await WebSocketManager.subscribe(clusterName, '/api/v1/pods', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      await receiveAckedWatch(mockServer);
      const send = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');
      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path: '/api/v1/pods',
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed' }),
        })
      );
      expect(WebSocketManager.pendingWatchRetries.size).toBe(0);
      expect(send).not.toHaveBeenCalled();
    });

    it('paces a burst of 96 distinct list watches without losing an active subscription', async () => {
      const callbacks = Array.from({ length: 96 }, () => vi.fn());
      await Promise.all(
        callbacks.map((callback, index) =>
          WebSocketManager.subscribe(
            clusterName,
            `/api/v1/namespaces/ns-${index}/pods`,
            'watch=1',
            callback,
            onError,
            {
              retryWatch: true,
            }
          )
        )
      );
      expect(WebSocketManager.pendingWatchRequests.size).toBe(95);
      const paths = new Set<string>();
      for (let index = 0; index < callbacks.length; index++) {
        const request = JSON.parse((await mockServer.nextMessage) as string);
        expect(request.userId).toBe(userId);
        expect(request.requestId).toBe(WebSocketManager.inFlightWatchRequest?.requestId);
        paths.add(request.path);
        mockServer.send(
          JSON.stringify({
            ...request,
            type: 'DATA',
            data: JSON.stringify({ type: 'ADDED', object: { index } }),
          })
        );
        mockServer.send(JSON.stringify({ ...request, type: 'ACK' }));
      }
      await waitFor(() =>
        expect(callbacks.every(callback => callback.mock.calls.length === 1)).toBe(true)
      );
      expect(paths.size).toBe(96);
      expect(WebSocketManager.activeSubscriptions.size).toBe(96);
      expect(WebSocketManager.pendingWatchRequests.size).toBe(0);
      expect(WebSocketManager.inFlightWatchRequest).toBeNull();
      expect(onError).not.toHaveBeenCalled();
    });

    it('ignores malformed or unrelated ACKs without releasing another watch request', async () => {
      await WebSocketManager.subscribe(clusterName, '/first', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      const initial = JSON.parse((await mockServer.nextMessage) as string);
      await WebSocketManager.subscribe(clusterName, '/second', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      mockServer.send(JSON.stringify({ type: 'ACK' }));
      mockServer.send(JSON.stringify({ type: 'ACK', requestId: 'unrelated' }));
      expect(WebSocketManager.inFlightWatchRequest?.requestId).toBe(initial.requestId);
      expect(WebSocketManager.pendingWatchRequests.size).toBe(1);
      mockServer.send(JSON.stringify({ ...initial, type: 'ACK' }));
      const next = JSON.parse((await mockServer.nextMessage) as string);
      expect(next.path).toBe('/second');
    });

    it('opens a queued query independently after the preceding watch request is acknowledged', async () => {
      const path = '/api/v1/pods';
      await WebSocketManager.subscribe(
        clusterName,
        path,
        'watch=1&resourceVersion=10',
        onMessage,
        onError,
        {
          retryWatch: true,
        }
      );
      const initial = JSON.parse((await mockServer.nextMessage) as string);
      await WebSocketManager.subscribe(
        clusterName,
        path,
        'watch=1&resourceVersion=42',
        onMessage,
        onError,
        {
          retryWatch: true,
        }
      );
      expect(WebSocketManager.pendingWatchRequests.size).toBe(1);
      mockServer.send(
        JSON.stringify({
          ...initial,
          type: 'STATUS',
          data: JSON.stringify({ state: 'connected' }),
        })
      );
      mockServer.send(JSON.stringify({ ...initial, type: 'ACK' }));
      const next = JSON.parse((await mockServer.nextMessage) as string);
      expect(next.query).toBe('watch=1&resourceVersion=42');
      expect(next.reopen).toBeUndefined();
      expect(next.requestId).not.toBe(initial.requestId);
      expect(next.userId).toBe(userId);
    });

    it('recovers list watches after overload without replaying exec subscriptions', async () => {
      await WebSocketManager.subscribe(clusterName, '/api/v1/pods', 'watch=1', onMessage, onError, {
        retryWatch: true,
      });
      await receiveAckedWatch(mockServer);
      const execError = vi.fn(() => {
        throw new Error('subscriber callback failed');
      });
      await WebSocketManager.subscribe(
        clusterName,
        '/pods/p/exec',
        'command=probe',
        vi.fn(),
        execError
      );
      await mockServer.nextMessage;
      const original = WebSocketManager.socketMultiplexer!;
      closeSocket(original);
      const recovered = JSON.parse((await mockServer.nextMessage) as string);
      expect(recovered.path).toBe('/api/v1/pods');
      expect(recovered.query).toBe('watch=1');
      expect(recovered.requestId).toBeTruthy();
      expect(WebSocketManager.socketMultiplexer).not.toBe(original);
      expect(WebSocketManager.activeSubscriptions.size).toBe(2);
      expect(execError).toHaveBeenCalledOnce();
      mockServer.send(JSON.stringify({ ...recovered, type: 'ACK' }));
      expect(WebSocketManager.inFlightWatchRequest).toBeNull();
      expect(WebSocketManager.overloadRecoveries).toBe(0);
      expect(onError).not.toHaveBeenCalled();
    });

    it('reconciles an updated watch before replaying its pinned route on a new socket', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=1';
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      await receiveAckedWatch(mockServer);
      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          type: 'DATA',
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { resourceVersion: '2' } },
          }),
        })
      );
      await waitFor(() => expect(onMessage).toHaveBeenCalledOnce());
      const original = WebSocketManager.socketMultiplexer!;
      closeSocket(original);
      await waitFor(() =>
        expect(onMessage).toHaveBeenLastCalledWith({
          type: 'ERROR',
          object: expect.objectContaining({ code: 410 }),
        })
      );
      await waitFor(() =>
        expect(WebSocketManager.socketMultiplexer?.readyState).toBe(WebSocket.OPEN)
      );
      expect(WebSocketManager.inFlightWatchRequest).toBeNull();
      const joined = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, joined, onError, {
        retryWatch: true,
      });
      expect(joined).toHaveBeenCalledExactlyOnceWith({
        type: 'ERROR',
        object: expect.objectContaining({ code: 410 }),
      });
      expect(WebSocketManager.inFlightWatchRequest).toBeNull();
      const fresh = vi.fn();
      await WebSocketManager.subscribe(
        clusterName,
        path,
        'watch=1&resourceVersion=3',
        fresh,
        onError,
        {
          retryWatch: true,
        }
      );
      const request = await receiveAckedWatch(mockServer);
      expect(request.query).toBe('watch=1&resourceVersion=3');
      mockServer.send(
        JSON.stringify({
          ...request,
          type: 'DATA',
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { resourceVersion: '4' } },
          }),
        })
      );
      await waitFor(() => expect(fresh).toHaveBeenCalledOnce());
      expect(onError).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'backs off after a failed recovery handshake (unsubscribe=%s)',
      async unsubscribe => {
        const onReady = vi.fn();
        const stop = await WebSocketManager.subscribe(
          clusterName,
          '/api/v1/pods',
          'watch=1',
          onMessage,
          onError,
          {
            retryWatch: true,
            onReady,
          }
        );
        await receiveAckedWatch(mockServer);
        const connect = vi
          .spyOn(WebSocketManager, 'connect')
          .mockRejectedValueOnce(new Error('Recovery handshake failed'));
        closeSocket(WebSocketManager.socketMultiplexer!);
        await waitFor(() => expect(WebSocketManager.watchRecoveryTimer).not.toBeNull());
        if (unsubscribe) {
          stop();
          expect(WebSocketManager.watchRecoveryTimer).toBeNull();
          expect(connect).toHaveBeenCalledOnce();
          return;
        }
        const request = await receiveAckedWatch(mockServer);
        expect(connect).toHaveBeenCalledTimes(2);
        expect(onReady).not.toHaveBeenCalled();
        mockServer.send(
          JSON.stringify({
            ...request,
            type: 'STATUS',
            data: JSON.stringify({ state: 'connected' }),
          })
        );
        expect(onReady).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
      }
    );

    it.each([
      [1013, 'headlamp.multiplexer.v2.k8s.io'],
      [1013, 'headlamp.multiplexer.k8s.io'],
      [1013, ''],
      [1001, 'headlamp.multiplexer.v2.k8s.io'],
      [1006, 'headlamp.multiplexer.v2.k8s.io'],
    ] as const)(
      'bounds close %s recovery without processing progress (protocol=%s)',
      async (code, protocol) => {
        mockServer.close();
        mockServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`, {
          selectProtocol: () => protocol,
        });
        await WebSocketManager.subscribe(
          clusterName,
          '/api/v1/pods',
          'watch=1',
          onMessage,
          onError,
          {
            retryWatch: true,
          }
        );
        await mockServer.nextMessage;
        for (let attempt = 1; attempt <= 3; attempt++) {
          closeSocket(WebSocketManager.socketMultiplexer!, code);
          await mockServer.nextMessage;
          expect(WebSocketManager.overloadRecoveries).toBe(attempt);
        }
        closeSocket(WebSocketManager.socketMultiplexer!, code);
        expect(WebSocketManager.connecting).toBe(false);
        expect(WebSocketManager.connectionPromise).toBeNull();
        expect(onError).toHaveBeenCalledTimes(code === 1013 ? 1 : 4);
        expect(mockServer.messages).toHaveLength(4);
      }
    );

    it.each(['headlamp.multiplexer.k8s.io', ''])(
      'resets the legacy recovery budget after sustained healthy operation (protocol=%s)',
      async protocol => {
        mockServer.close();
        mockServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`, {
          selectProtocol: () => protocol,
        });
        await WebSocketManager.subscribe(
          clusterName,
          '/api/v1/pods',
          'watch=1',
          onMessage,
          onError,
          {
            retryWatch: true,
          }
        );
        await mockServer.nextMessage;
        let request;
        for (let attempt = 1; attempt <= 3; attempt++) {
          closeSocket(WebSocketManager.socketMultiplexer!);
          request = JSON.parse((await mockServer.nextMessage) as string);
          expect(WebSocketManager.overloadRecoveries).toBe(attempt);
        }
        vi.useFakeTimers();
        try {
          mockServer.send(
            JSON.stringify({
              ...request,
              type: 'STATUS',
              data: JSON.stringify({ state: 'connected' }),
            })
          );
          await vi.advanceTimersByTimeAsync(59_999);
          expect(WebSocketManager.overloadRecoveries).toBe(3);
          await vi.advanceTimersByTimeAsync(1);
          expect(WebSocketManager.overloadRecoveries).toBe(0);
        } finally {
          vi.useRealTimers();
        }
        closeSocket(WebSocketManager.socketMultiplexer!);
        await mockServer.nextMessage;
        expect(WebSocketManager.overloadRecoveries).toBe(1);
        expect(onError).not.toHaveBeenCalled();
      }
    );

    it.each([
      {
        name: 'with a backend token',
        token: 'desktop-token',
        protocols: [
          'headlamp.multiplexer.v2.k8s.io',
          'headlamp.multiplexer.k8s.io',
          'base64url.headlamp.backend.authorization.k8s.io.ZGVza3RvcC10b2tlbg',
        ],
      },
      {
        name: 'without a backend token',
        token: null,
        protocols: ['headlamp.multiplexer.v2.k8s.io', 'headlamp.multiplexer.k8s.io'],
      },
    ])('constructs the multiplexer socket $name', async testCase => {
      const socket = {
        readyState: WebSocket.CONNECTING as number,
        onopen: null as (() => void) | null,
        onmessage: null,
        onerror: null,
        onclose: null,
      };
      const WebSocketMock = vi.fn(function () {
        return socket;
      });
      Object.assign(WebSocketMock, {
        CONNECTING: WebSocket.CONNECTING,
        OPEN: WebSocket.OPEN,
      });
      vi.stubGlobal('WebSocket', WebSocketMock);
      setBackendToken(testCase.token);

      const connection = WebSocketManager.connect();

      if (testCase.protocols) {
        expect(WebSocketMock).toHaveBeenCalledWith(
          `${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`,
          testCase.protocols
        );
      } else {
        expect(WebSocketMock).toHaveBeenCalledWith(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`);
      }

      socket.readyState = WebSocket.OPEN;
      socket.onopen?.();
      await connection;
    });

    it('clears the connecting state when socket construction fails', async () => {
      const error = new Error('socket construction failed');
      const WebSocketMock = vi.fn(function () {
        throw error;
      });
      Object.assign(WebSocketMock, {
        CONNECTING: WebSocket.CONNECTING,
        OPEN: WebSocket.OPEN,
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      await expect(WebSocketManager.connect()).rejects.toThrow(error);
      expect(WebSocketManager.connecting).toBe(false);
    });

    it('should establish connection and handle messages', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      // Subscribe to pod updates
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      await mockServer.connected;

      // Get the subscription message
      const subscribeMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(subscribeMsg).toEqual({
        clusterId: clusterName,
        path,
        query,
        userId,
        type: 'REQUEST',
        requestId: expect.any(String),
      });

      // Send a message from server
      const podData = { kind: 'Pod', metadata: { name: 'test-pod' } };
      const serverMessage = {
        clusterId: clusterName,
        path,
        query,
        data: JSON.stringify(podData), // Important: data needs to be stringified
        type: 'DATA',
      };

      await mockServer.send(JSON.stringify(serverMessage));

      // Wait for message processing
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith(podData);
      });
    });

    it('should handle multiple subscriptions', async () => {
      const subs = [
        { path: '/api/v1/pods', query: 'watch=true' },
        { path: '/api/v1/services', query: 'watch=true' },
      ];

      // Subscribe to multiple resources
      await Promise.all(
        subs.map(sub => WebSocketManager.subscribe(clusterName, sub.path, sub.query, onMessage))
      );

      await mockServer.connected;

      // Verify subscription messages
      for (const sub of subs) {
        const msg = JSON.parse((await mockServer.nextMessage) as string);
        expect(msg).toEqual({
          clusterId: clusterName,
          path: sub.path,
          query: sub.query,
          userId,
          type: 'REQUEST',
        });

        // Send data for this subscription
        const resourceData = {
          kind: sub.path.includes('pods') ? 'Pod' : 'Service',
          metadata: { name: `test-${sub.path}` },
        };

        const serverMessage = {
          clusterId: clusterName,
          path: sub.path,
          query: sub.query,
          data: JSON.stringify(resourceData),
          type: 'DATA',
        };

        await mockServer.send(JSON.stringify(serverMessage));
      }

      // Verify all messages were received
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle COMPLETE messages', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;

      // Skip subscription message
      await mockServer.nextMessage;

      // Send COMPLETE message
      const completeMessage = {
        clusterId: clusterName,
        path,
        query,
        type: 'COMPLETE',
      };

      await mockServer.send(JSON.stringify(completeMessage));

      // Verify the path is marked as completed
      const key = WebSocketManager.createKey(clusterName, path, query);
      expect(WebSocketManager.completedPaths.has(key)).toBe(true);
    });

    it('should handle unsubscribe', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      const cleanup = await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;

      // Skip subscription message
      await mockServer.nextMessage;

      // Unsubscribe
      cleanup();

      // Wait for unsubscribe message (after debounce)
      await vi.waitFor(async () => {
        const msg = JSON.parse((await mockServer.nextMessage) as string);
        expect(msg).toEqual({
          clusterId: clusterName,
          path,
          query,
          userId,
          type: 'CLOSE',
        });
      });

      // Verify subscription is removed
      const key = WebSocketManager.createKey(clusterName, path, query);
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
    });

    it('should handle connection errors', async () => {
      // Close the server to simulate connection failure
      await mockServer.close();

      // Attempt to subscribe should fail
      await expect(
        WebSocketManager.subscribe(clusterName, '/api/v1/pods', 'watch=true', onMessage)
      ).rejects.toThrow('WebSocket connection failed');

      // Verify error was handled
      expect(WebSocketManager.socketMultiplexer).toBeNull();
      expect(WebSocketManager.connecting).toBe(false);
    });

    it('should handle duplicate subscriptions', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      // Create two subscriptions with the same parameters
      const onMessage2 = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await WebSocketManager.subscribe(clusterName, path, query, onMessage2);

      await mockServer.connected;

      // Should only receive one subscription message
      const subMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(subMsg.type).toBe('REQUEST');

      // Send a message
      const podData = { kind: 'Pod', metadata: { name: 'test-pod' } };
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify(podData),
          type: 'DATA',
        })
      );

      // Both handlers should receive the message
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith(podData);
        expect(onMessage2).toHaveBeenCalledWith(podData);
      });
    });

    it('should debounce unsubscribe operations', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      const cleanup = await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;

      // Skip subscription message
      await mockServer.nextMessage;

      // Unsubscribe
      cleanup();

      // Subscribe again immediately
      await WebSocketManager.subscribe(clusterName, path, query, onMessage);

      // Wait for potential unsubscribe message
      await vi.waitFor(() => {
        const key = WebSocketManager.createKey(clusterName, path, query);
        expect(WebSocketManager.activeSubscriptions.has(key)).toBe(true);
      });

      // Verify no CLOSE message was sent
      try {
        const msg = JSON.parse((await mockServer.nextMessage) as string);
        expect(msg.type).not.toBe('CLOSE');
      } catch (e) {
        // No message is also acceptable
      }
    });
  });

  describe('useWebSocket hook', () => {
    it('reconnects scoped object watches after an all-cluster identity reset', async () => {
      const OriginalWebSocket = globalThis.WebSocket;
      const sockets: WebSocket[] = [];
      vi.stubGlobal(
        'WebSocket',
        class extends OriginalWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            sockets.push(this);
          }
        }
      );
      const hook = renderHook(() =>
        useWebSocket({
          cluster: clusterName,
          url: () => '/api/v1/pods/observed?watch=1',
          recoveryOwner: {},
          retryWatch: true,
          onMessage,
          onError,
        })
      );
      await receiveAckedWatch(mockServer);
      expect(sockets).toHaveLength(1);

      act(() =>
        window.dispatchEvent(new CustomEvent('headlamp-credentials-changed', { detail: {} }))
      );
      await receiveAckedWatch(mockServer);
      expect(sockets).toHaveLength(2);
      hook.unmount();
    });

    it('isolates renewed sessions by owner and generation while retaining shared observers and siblings', async () => {
      const OriginalWebSocket = globalThis.WebSocket;
      const sockets: WebSocket[] = [];
      vi.stubGlobal(
        'WebSocket',
        class extends OriginalWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            sockets.push(this);
          }
        }
      );
      const owner = {};
      const url = () => '/api/v1/pods?watch=1&resourceVersion=';
      const firstMessage = vi.fn();
      const siblingMessage = vi.fn();
      const joinedMessage = vi.fn();
      const otherMessage = vi.fn();
      const ready = vi.fn();
      const first = renderHook(
        ({ generation }) =>
          useWebSocket({
            cluster: clusterName,
            url,
            recoveryOwner: generation > 1 ? owner : undefined,
            generation,
            retryWatch: true,
            onMessage: firstMessage,
            onReady: ready,
          }),
        { initialProps: { generation: 1 } }
      );
      const sibling = renderHook(() =>
        useWebSocket({
          cluster: clusterName,
          url,
          retryWatch: true,
          onMessage: siblingMessage,
        })
      );
      await receiveAckedWatch(mockServer);
      expect(sockets).toHaveLength(1);
      first.rerender({ generation: 2 });
      const fresh = await receiveAckedWatch(mockServer);
      await waitFor(() => expect(sockets).toHaveLength(2));
      const deliver = (socket: WebSocket, type: string, data: unknown) =>
        act(() =>
          socket.onmessage?.call(socket, {
            data: JSON.stringify({ ...fresh, type, data: JSON.stringify(data) }),
          } as MessageEvent)
        );
      deliver(sockets[1], 'STATUS', { state: 'connected' });
      const joined = renderHook(() =>
        useWebSocket({
          cluster: clusterName,
          url,
          recoveryOwner: owner,
          generation: 2,
          retryWatch: true,
          onMessage: joinedMessage,
        })
      );
      const other = renderHook(() =>
        useWebSocket({
          cluster: clusterName,
          url,
          recoveryOwner: {},
          generation: 2,
          retryWatch: true,
          onMessage: otherMessage,
        })
      );
      await receiveAckedWatch(mockServer);
      expect(sockets).toHaveLength(3);
      deliver(sockets[0], 'DATA', { version: 'queued-old' });
      expect(firstMessage).not.toHaveBeenCalled();
      expect(joinedMessage).not.toHaveBeenCalled();
      expect(otherMessage).not.toHaveBeenCalled();
      expect(siblingMessage).toHaveBeenCalledWith({ version: 'queued-old' });
      first.unmount();
      deliver(sockets[1], 'DATA', { version: 'recreated' });
      expect(joinedMessage).toHaveBeenCalledExactlyOnceWith({ version: 'recreated' });
      expect(otherMessage).not.toHaveBeenCalled();
      expect(sockets[0].readyState).toBe(WebSocket.OPEN);
      expect(sockets[1].readyState).toBe(WebSocket.OPEN);
      joined.unmount();
      other.unmount();
      sibling.unmount();
      await waitFor(() => {
        expect(sockets[1].readyState).toBe(WebSocket.CLOSED);
        expect(sockets[2].readyState).toBe(WebSocket.CLOSED);
      });
    });

    it('keeps renewed-session recovery bounded across generation changes without an acknowledged watch', async () => {
      const OriginalWebSocket = globalThis.WebSocket;
      const sockets: WebSocket[] = [];
      vi.stubGlobal(
        'WebSocket',
        class extends OriginalWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            sockets.push(this);
          }
        }
      );
      const owner = {};
      const url = () => '/api/v1/pods?watch=1&resourceVersion=';
      const hook = renderHook(
        ({ generation }) =>
          useWebSocket({
            cluster: clusterName,
            url,
            recoveryOwner: owner,
            generation,
            retryWatch: true,
            onMessage,
            onError,
          }),
        { initialProps: { generation: 2 } }
      );
      try {
        let acknowledgeRetired = () => {};
        for (let generation = 2; generation <= 5; generation++) {
          if (generation !== 2) hook.rerender({ generation });
          await mockServer.nextMessage;
          acknowledgeRetired();
          const current = sockets.at(-1)!;
          closeSocket(current);
          if (generation < 5) {
            const request = JSON.parse((await mockServer.nextMessage) as string);
            const retired = sockets.at(-1)!;
            acknowledgeRetired = () =>
              retired.onmessage?.call(retired, {
                data: JSON.stringify({ ...request, type: 'ACK' }),
              } as MessageEvent);
          }
        }
        expect(sockets).toHaveLength(7);
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(sockets).toHaveLength(7);
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('overloaded'),
          })
        );
      } finally {
        hook.unmount();
        await waitFor(() =>
          expect(sockets.every(socket => socket.readyState === WebSocket.CLOSED)).toBe(true)
        );
      }
    });

    it('should not connect when disabled', () => {
      renderHook(() =>
        useWebSocket({
          url: () => '/api/v1/pods',
          enabled: false,
          cluster: clusterName,
          onMessage,
          onError,
        })
      );

      expect(WebSocketManager.socketMultiplexer).toBeNull();
    });

    it('should handle successful connection and messages', async () => {
      const fullUrl = `${BASE_WS_URL}api/v1/pods`;

      renderHook(() =>
        useWebSocket({
          url: () => fullUrl,
          enabled: true,
          cluster: clusterName,
          onMessage,
          onError,
        })
      );

      await mockServer.connected;

      // Skip subscription message
      await mockServer.nextMessage;

      // Send test message
      const podData = { kind: 'Pod', metadata: { name: 'test-pod' } };
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path: '/api/v1/pods',
          data: JSON.stringify(podData),
          type: 'DATA',
        })
      );

      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith(podData);
      });
    }, 10000);

    it('should handle connection errors', async () => {
      const fullUrl = `${BASE_WS_URL}api/v1/pods`;

      // Close the server to simulate connection failure
      await mockServer.close();

      renderHook(() =>
        useWebSocket({
          url: () => fullUrl,
          enabled: true,
          cluster: clusterName,
          onMessage,
          onError,
        })
      );

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });

    it('should cleanup on unmount', async () => {
      const fullUrl = `${BASE_WS_URL}api/v1/pods`;

      const { unmount } = renderHook(() =>
        useWebSocket({
          url: () => fullUrl,
          enabled: true,
          cluster: clusterName,
          onMessage,
          onError,
        })
      );

      await mockServer.connected;
      await mockServer.nextMessage; // Skip subscription

      // Unmount and wait for cleanup
      unmount();

      await vi.waitFor(
        async () => {
          const msg = JSON.parse((await mockServer.nextMessage) as string);
          expect(msg.type).toBe('CLOSE');
        },
        { timeout: 10000 }
      );
    });

    it('should cleanup when unmounted before subscription resolves', async () => {
      const fullUrl = `${BASE_WS_URL}api/v1/pods`;
      const cleanup = vi.fn();
      let resolveSubscribe: (cleanup: () => void) => void = () => {};
      const subscribeSpy = vi.spyOn(WebSocketManager, 'subscribe').mockReturnValue(
        new Promise<() => void>(resolve => {
          resolveSubscribe = resolve;
        })
      );

      const { unmount } = renderHook(() =>
        useWebSocket({
          url: () => fullUrl,
          enabled: true,
          cluster: clusterName,
          onMessage,
          onError,
        })
      );

      await vi.waitFor(() => {
        expect(subscribeSpy).toHaveBeenCalledWith(
          clusterName,
          '/api/v1/pods',
          '',
          expect.any(Function),
          expect.any(Function),
          { retryWatch: false }
        );
      });

      unmount();
      resolveSubscribe(cleanup);

      await vi.waitFor(() => {
        expect(cleanup).toHaveBeenCalledTimes(1);
      });
    });

    it('should remove subscription state when unmounted before subscription rejects', async () => {
      const fullUrl = `${BASE_WS_URL}api/v1/pods`;
      const key = WebSocketManager.createKey(clusterName, '/api/v1/pods', '');
      let rejectConnect: (error: Error) => void = () => {};
      vi.spyOn(WebSocketManager, 'connect').mockReturnValue(
        new Promise<WebSocket>((_, reject) => {
          rejectConnect = reject;
        })
      );

      const { unmount } = renderHook(() =>
        useWebSocket({
          url: () => fullUrl,
          enabled: true,
          cluster: clusterName,
          onMessage,
          onError,
        })
      );

      await vi.waitFor(() => {
        expect(WebSocketManager.activeSubscriptions.has(key)).toBe(true);
        expect(WebSocketManager.listeners.get(key)?.size).toBe(1);
      });

      unmount();
      rejectConnect(new Error('WebSocket connection failed'));

      await vi.waitFor(() => {
        expect(WebSocketManager.listeners.has(key)).toBe(false);
        expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
        expect(onError).not.toHaveBeenCalled();
      });
    });
  });

  describe('WebSocket error handling', () => {
    it('should reject concurrent callers when in-progress connection fails', async () => {
      const socket = {
        readyState: WebSocket.CONNECTING,
        onopen: null,
        onerror: null as ((event: Event) => void) | null,
        onclose: null,
        onmessage: null,
      };
      const constructor = vi.fn(function () {
        return socket;
      });
      Object.assign(constructor, { OPEN: WebSocket.OPEN, CONNECTING: WebSocket.CONNECTING });
      vi.stubGlobal('WebSocket', constructor);
      const first = WebSocketManager.connect();
      const concurrent = WebSocketManager.connect();
      const rejected = Promise.all([
        expect(first).rejects.toThrow('WebSocket connection failed'),
        expect(concurrent).rejects.toThrow('WebSocket connection failed'),
      ]);
      expect(constructor).toHaveBeenCalledOnce();
      socket.onerror?.(new Event('error'));
      await rejected;
      expect(WebSocketManager.connecting).toBe(false);
      expect(WebSocketManager.connectionPromise).toBeNull();
    });

    it('should handle polling timeout', async () => {
      const OriginalWebSocket = window.WebSocket;

      // Mock WebSocket that triggers an error immediately after construction
      vi.stubGlobal('WebSocket', function (this: any) {
        const ws = {
          readyState: WebSocket.CONNECTING,
          onopen: null as any,
          onclose: null as any,
          onerror: null as any,
          onmessage: null as any,
          send: vi.fn(),
          close: vi.fn(),
        };
        setTimeout(() => ws.onerror?.(new Event('error')), 0);
        return ws;
      });

      const path = '/api/v1/pods';
      const query = 'watch=true';

      await expect(WebSocketManager.subscribe(clusterName, path, query, onMessage)).rejects.toThrow(
        `Cannot read properties of null (reading 'send')`
      );

      vi.stubGlobal('WebSocket', OriginalWebSocket);
    });

    it('automatically reconnects and resubscribes a mounted watch', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      // First connection
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, onError, {
        retryWatch: true,
      });
      await mockServer.connected;
      await mockServer.nextMessage; // Skip initial subscription

      closeSocket(WebSocketManager.socketMultiplexer!, 1001);

      // Verify WebSocketManager state after close
      expect(WebSocketManager.socketMultiplexer).toBeNull();
      expect(WebSocketManager.isReconnecting).toBe(true);
      expect(WebSocketManager.connecting).toBe(true);

      // Should get resubscription message
      const resubMsg = await receiveAckedWatch(mockServer);
      expect(resubMsg).toEqual({
        clusterId: clusterName,
        path,
        query,
        userId,
        type: 'REQUEST',
        requestId: expect.any(String),
      });

      // Verify reconnection state is reset
      expect(WebSocketManager.isReconnecting).toBe(false);
    });

    it('should handle WebSocket close event', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;

      // Close the connection
      mockServer.close();

      // Verify WebSocket state after close
      expect(WebSocketManager.socketMultiplexer).toBeNull();
      expect(WebSocketManager.connecting).toBe(false);
      expect(WebSocketManager.completedPaths.size).toBe(0);
      expect(WebSocketManager.isReconnecting).toBe(true); // Should be true since we have active subscriptions
    });

    it('should handle error in message callback', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';
      const error = new Error('Message processing failed');
      const errorCallback = vi.fn().mockImplementation(() => {
        throw error;
      });

      await WebSocketManager.subscribe(clusterName, path, query, errorCallback);
      await mockServer.connected;
      await mockServer.nextMessage; // Skip subscription message

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Send message that will trigger error in callback
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({ kind: 'Pod' }),
          type: 'DATA',
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith('Failed to process WebSocket message:', error);
      consoleSpy.mockRestore();
    });

    it('should handle parse errors in message data', async () => {
      await WebSocketManager.subscribe(clusterName, '/api/v1/pods', 'watch=true', onMessage);
      await mockServer.connected;

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path: '/api/v1/pods',
          data: 'invalid json',
        })
      );

      expect(onMessage).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Failed to parse update data:', expect.any(Error));
    });

    it('should handle JSON error messages from backend', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      await mockServer.nextMessage;

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({ error: 'cluster connection failed' }),
          type: 'ERROR',
        })
      );

      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith({
          type: 'ERROR',
          object: {
            kind: 'Status',
            status: 'Failure',
            message: 'cluster connection failed',
            metadata: {
              uid: `${WebSocketManager.createKey(
                clusterName,
                path,
                query
              )}:ERROR:cluster connection failed`,
              resourceVersion: '0',
            },
          },
        });
      });
    });

    it('should handle non-JSON error messages from backend', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      await mockServer.nextMessage;

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: 'plain backend error',
          type: 'ERROR',
        })
      );

      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith({
          type: 'ERROR',
          object: {
            kind: 'Status',
            status: 'Failure',
            message: 'plain backend error',
            metadata: {
              uid: `${WebSocketManager.createKey(
                clusterName,
                path,
                query
              )}:ERROR:plain backend error`,
              resourceVersion: '0',
            },
          },
        });
      });
    });

    it('should route backend error to dedicated error callback when provided', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      const errorCallback = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, errorCallback);
      await mockServer.connected;
      await mockServer.nextMessage;

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({ error: 'dedicated error message' }),
          type: 'ERROR',
        })
      );

      await vi.waitFor(() => {
        expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
        expect(errorCallback.mock.calls[0][0].message).toBe('dedicated error message');
        expect(onMessage).not.toHaveBeenCalled();
      });
    });

    it('should handle message callback errors in useWebSocket', async () => {
      const errorMessage = 'Message processing failed';
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error(errorMessage);
      });

      renderHook(() =>
        useWebSocket({
          url: () => `${BASE_WS_URL}api/v1/pods`,
          enabled: true,
          cluster: clusterName,
          onMessage: errorFn,
          onError,
        })
      );

      await mockServer.connected;
      await mockServer.nextMessage; // Skip subscription

      // Send message that will cause error in callback
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path: '/api/v1/pods',
          data: JSON.stringify({ kind: 'Pod' }),
          type: 'DATA',
        })
      );

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: errorMessage,
        })
      );
    });

    it('should handle missing fields in messages', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;

      // Skip subscription message
      await mockServer.nextMessage;

      // Send message without required fields
      await mockServer.send(
        JSON.stringify({
          data: JSON.stringify({ kind: 'Pod' }),
        })
      );

      expect(onMessage).not.toHaveBeenCalled();
    });
  });
});
