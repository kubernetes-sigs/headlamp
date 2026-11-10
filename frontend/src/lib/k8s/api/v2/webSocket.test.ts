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
import { openWebSocket, resetWebSocketsForTesting, useWebSockets } from './webSocket';
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

  it('notifies onClose listeners and removes socket when connection closes', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=5';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessage = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage, onClose }],
      })
    );

    await server.connected;

    // Simulate unexpected server close
    server.close();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onClose when unmounting intentionally', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=6';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessage = vi.fn();
    const onClose = vi.fn();

    const hook = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage, onClose }],
      })
    );

    await server.connected;

    // Unmount intentionally
    hook.unmount();

    // Allow any asynchronous close events to settle
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up pending socket reference if it closes during initialization', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=7';
    const server1 = new WS(`${BASE_WS_URL}${url}`);
    const onMessage1 = vi.fn();
    const onClose1 = vi.fn();

    const hook1 = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessage1, onClose: onClose1 }],
      })
    );

    await server1.connected;
    // Server closes connection immediately
    server1.close();

    await waitFor(() => {
      expect(onClose1).toHaveBeenCalledTimes(1);
    });

    hook1.unmount();

    // Now establish a second connection to the same URL with a fresh server
    const server2 = new WS(`${BASE_WS_URL}${url}`);
    const onMessage2 = vi.fn();

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessage2 }],
      })
    );

    // The second connection must successfully connect and receive messages
    await server2.connected;
    await server2.send(
      JSON.stringify({ type: 'ADDED', object: { metadata: { name: 'pod-fresh' } } })
    );

    await waitFor(() => {
      expect(onMessage2).toHaveBeenCalledTimes(1);
    });

    server2.close();
  });

  describe('handshake failure and retry behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      resetWebSocketsForTesting();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('schedules a 5-second delayed retry on immediate close without spinning immediately', async () => {
      const createdSockets: any[] = [];

      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const onMessage = vi.fn();
      const onClose = vi.fn();
      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage, onClose }],
        })
      );

      // Sockets connect asynchronously through openWebSocket
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // Simulate handshake failure: close fires without open event
      createdSockets[0].listenersMap.close(new CloseEvent('close'));

      // Verify onClose is NOT called when !hasOpened
      expect(onClose).not.toHaveBeenCalled();

      // Ensure no immediate retry spin
      vi.advanceTimersByTime(1000);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(3999);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      // At 5 seconds, single-flight retry fires
      vi.advanceTimersByTime(1);
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

      hook.unmount();
    });

    it('wakes up failed endpoint immediately when browser online event fires', async () => {
      const createdSockets: any[] = [];
      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage: vi.fn() }],
        })
      );

      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // Simulate failed handshake
      createdSockets[0].listenersMap.close(new CloseEvent('close'));

      // 1 second elapsed, no retry yet
      vi.advanceTimersByTime(1000);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      // Browser online event triggers immediate retry
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

      // Advancing remaining timer does not trigger duplicate retry
      vi.advanceTimersByTime(5000);
      expect(WebSocketMock).toHaveBeenCalledTimes(2);

      hook.unmount();
    });

    it('clears retry timers when component unmounts', async () => {
      const createdSockets: any[] = [];
      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage: vi.fn() }],
        })
      );

      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // Simulate failed handshake
      createdSockets[0].listenersMap.close(new CloseEvent('close'));

      // Unmount component before 5s retry timer fires
      hook.unmount();

      // Advance time past the 5s timer window
      vi.advanceTimersByTime(10000);

      // No new connection attempt should occur
      expect(WebSocketMock).toHaveBeenCalledTimes(1);
    });
  });
});
