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

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import WS from 'vitest-websocket-mock';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { openWebSocket, useWebSockets } from './webSocket';
import { BASE_WS_URL } from './webSocket';

vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(() => ''),
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(() => ''),
}));

describe('useWebSockets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openWebSocket protocols', () => {
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

      await openWebSocket('/api/v1/pods', {
        cluster: 'test-cluster',
        protocols: ['caller.protocol'],
        type: 'binary',
        onMessage: vi.fn(),
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

    it('uses default protocols without a cluster', async () => {
      const listeners: Record<string, EventListener> = {};
      const socket = {
        addEventListener: vi.fn((type: string, listener: EventListener) => {
          listeners[type] = listener;
        }),
        binaryType: '',
      };
      const WebSocketMock = vi.fn(function () {
        return socket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);
      const onMessage = vi.fn();

      await openWebSocket('/api/v1/pods', {
        type: 'binary',
        onMessage,
      });
      listeners.message(new MessageEvent('message', { data: 'binary-data' }));

      expect(WebSocketMock).toHaveBeenCalledWith(expect.not.stringContaining('/clusters/'), [
        'base64.binary.k8s.io',
      ]);
      expect(onMessage).toHaveBeenCalledWith('binary-data');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    WS.clean();
  });

  it('delivers messages to all listeners that share the same websocket connection', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=1';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();

    renderHook(() =>
      useWebSockets({
        connections: [
          { cluster: '', url, onMessage: onMessageA },
          { cluster: '', url, onMessage: onMessageB },
        ],
      })
    );

    await server.connected;
    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-a' } } }));

    await waitFor(() => {
      expect(onMessageA).toHaveBeenCalledTimes(1);
      expect(onMessageB).toHaveBeenCalledTimes(1);
    });
  });

  it('delivers messages to remaining listeners when one listener throws', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=2';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const listenerError = new Error('listener failed');
    const onMessageA = vi.fn(() => {
      throw listenerError;
    });
    const onMessageB = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() =>
      useWebSockets({
        connections: [
          { cluster: '', url, onMessage: onMessageA },
          { cluster: '', url, onMessage: onMessageB },
        ],
      })
    );

    await server.connected;
    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-b' } } }));

    await waitFor(() => {
      expect(onMessageA).toHaveBeenCalledTimes(1);
      expect(onMessageB).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith('WebSocket listener error:', listenerError);
    });
  });

  it('notifies sibling watches when a close listener throws', async () => {
    const url = 'api/v1/pods?watch=1';
    const otherUrl = 'api/v1/services?watch=1';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const otherServer = new WS(`${BASE_WS_URL}${otherUrl}`);
    const error = new Error('close failed');
    const failingClose = vi.fn(() => {
      throw error;
    });
    const siblingClose = vi.fn();
    const otherClose = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() =>
      useWebSockets({
        connections: [
          { cluster: '', url, onMessage: vi.fn(), onClose: failingClose },
          { cluster: '', url, onMessage: vi.fn(), onClose: siblingClose },
          { cluster: '', url: otherUrl, onMessage: vi.fn(), onClose: otherClose },
        ],
      })
    );
    const [socket, otherSocket] = await Promise.all([server.connected, otherServer.connected]);

    socket.close();
    await waitFor(() => expect(siblingClose).toHaveBeenCalledTimes(1));
    expect(consoleError).toHaveBeenCalledWith('WebSocket listener error:', error);

    unmount();
    await otherServer.closed;
    expect(otherSocket.readyState).toBe(WebSocket.CLOSED);
    expect(otherClose).toHaveBeenCalledTimes(1);
  });

  it('closes all sockets on unmount when a close listener throws', async () => {
    const podUrl = 'api/v1/pods?watch=1';
    const serviceUrl = 'api/v1/services?watch=1';
    const podServer = new WS(`${BASE_WS_URL}${podUrl}`);
    const serviceServer = new WS(`${BASE_WS_URL}${serviceUrl}`);
    const error = new Error('close failed during unmount');
    const failingClose = vi.fn(() => {
      throw error;
    });
    const serviceClose = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() =>
      useWebSockets({
        connections: [
          { cluster: '', url: podUrl, onMessage: vi.fn(), onClose: failingClose },
          { cluster: '', url: serviceUrl, onMessage: vi.fn(), onClose: serviceClose },
        ],
      })
    );
    await Promise.all([podServer.connected, serviceServer.connected]);

    unmount();

    await Promise.all([podServer.closed, serviceServer.closed]);
    expect(failingClose).toHaveBeenCalledTimes(1);
    expect(serviceClose).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('WebSocket listener error:', error);
  });

  it('opens separate sockets for the same URL when listeners use different caches', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=1';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const connected = vi.fn();
    server.on('connection', connected);
    const scope = {};
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    const onShared = vi.fn();
    const connections = [
      { cluster: '', url, cacheEntry: scope, onMessage: onFirst },
      { cluster: '', url, cacheEntry: {}, onMessage: onSecond },
      { cluster: '', url, cacheEntry: scope, onMessage: onShared },
    ];

    renderHook(() => useWebSockets({ connections }));

    await waitFor(() => expect(connected).toHaveBeenCalledTimes(2));
    const first = connected.mock.calls[0][0];
    first.send(JSON.stringify({ type: 'DELETED' }));
    await waitFor(() => {
      expect(onFirst).toHaveBeenCalledWith({ type: 'DELETED' });
      expect(onShared).toHaveBeenCalledWith({ type: 'DELETED' });
    });
    expect(onSecond).not.toHaveBeenCalled();
  });

  it('reopens a closed watch at the latest URL and keeps its listeners', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=1';
    const updatedUrl = 'api/v1/pods?watch=1&resourceVersion=2';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const connected = vi.fn();
    server.on('connection', connected);
    const listener = vi.fn();
    let watchUrl = url;
    const getWatchUrl = vi.fn(async () => watchUrl);
    const connections = [{ cluster: '', url, onMessage: listener, getWatchUrl }];

    renderHook(() => useWebSockets({ connections }));

    const original = await server.connected;
    watchUrl = updatedUrl;
    original.close();
    await waitFor(
      () =>
        expect(connected).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            url: `${BASE_WS_URL}${updatedUrl}`,
          })
        ),
      { timeout: 4000 }
    );
    server.send(JSON.stringify({ type: 'ADDED' }));
    expect(listener).toHaveBeenCalledWith({ type: 'ADDED' });
    expect(getWatchUrl.mock.calls).toEqual([[false], [true]]);
  });

  it('backs off when watch URL generation fails and cancels retries on unmount', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getWatchUrl = vi.fn().mockRejectedValue(new Error('Unable to prepare watch'));
    const connections = [
      { cluster: '', url: 'api/v1/pods?watch=1', onMessage: vi.fn(), getWatchUrl },
    ];
    const { unmount } = renderHook(() => useWebSockets({ connections }));

    try {
      await vi.advanceTimersByTimeAsync(1499);
      expect(getWatchUrl.mock.calls).toEqual([[false]]);
      await vi.advanceTimersByTimeAsync(1);
      expect(getWatchUrl.mock.calls).toEqual([[false], [true]]);
      await vi.advanceTimersByTimeAsync(2999);
      expect(getWatchUrl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(getWatchUrl).toHaveBeenCalledTimes(3);
      unmount();
      await vi.advanceTimersByTimeAsync(30000);
      expect(getWatchUrl).toHaveBeenCalledTimes(3);
    } finally {
      unmount();
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('keeps a shared websocket alive until the last listener unsubscribes', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=3';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();

    const hookA = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageA }],
      })
    );

    await server.connected;

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageB }],
      })
    );

    hookA.unmount();

    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-b' } } }));

    await waitFor(() => {
      expect(onMessageA).not.toHaveBeenCalled();
      expect(onMessageB).toHaveBeenCalledTimes(1);
    });
  });

  it('uses the remaining URL provider when the first listener unsubscribes before resolving', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=5';
    const server = new WS(`${BASE_WS_URL}${url}`);
    let resolveFirst!: (url: string | null) => void;
    const firstUrl = new Promise<string | null>(resolve => {
      resolveFirst = resolve;
    });
    const first = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: vi.fn(), getWatchUrl: () => firstUrl }],
      })
    );
    const getWatchUrl = vi.fn().mockResolvedValue(url);
    renderHook(() =>
      useWebSockets({ connections: [{ cluster: '', url, onMessage: vi.fn(), getWatchUrl }] })
    );

    first.unmount();
    resolveFirst(null);

    await server.connected;
    expect(getWatchUrl).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected upgrade before the watch opens', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=6';
    new WS(`${BASE_WS_URL}${url}`, { verifyClient: () => false });
    const onOpenFailure = vi.fn();
    const onOpen = vi.fn();
    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: vi.fn(), onOpen, onOpenFailure }],
      })
    );

    await waitFor(() => expect(onOpenFailure).toHaveBeenCalledTimes(1));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps a pending shared websocket alive when its first listener unsubscribes', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=4';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();

    const hookA = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageA }],
      })
    );

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageB }],
      })
    );
    hookA.unmount();

    await server.connected;
    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-d' } } }));

    await waitFor(() => {
      expect(onMessageA).not.toHaveBeenCalled();
      expect(onMessageB).toHaveBeenCalledTimes(1);
    });
  });
});
