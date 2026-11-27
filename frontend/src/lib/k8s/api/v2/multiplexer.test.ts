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

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import WS from 'vitest-websocket-mock';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { getCluster } from '../../../cluster';
import { MULTIPLEXER_ENDPOINT } from './multiplexer';
import { useWebSocket } from './multiplexer';
import { WebSocketManager } from './multiplexer';
import { BASE_WS_URL } from './webSocket';

// Mock dependencies
vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(),
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

describe('WebSocket Multiplexer', () => {
  let mockServer: WS;
  let onMessage: Mock<(data: any) => void>;
  let onError: Mock<(error: any) => void>;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    vi.clearAllMocks();
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
    // Restore console.error
    console.error = originalConsoleError;

    WS.clean();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    setBackendToken(null);
    WebSocketManager.socketMultiplexer = null;
    WebSocketManager.connecting = false;
    WebSocketManager.isReconnecting = false;
    WebSocketManager.listeners.clear();
    WebSocketManager.errorListeners.clear();
    WebSocketManager.closeListeners.clear();
    WebSocketManager.completedPaths.clear();
    WebSocketManager.activeSubscriptions.clear();
    WebSocketManager.failedStreams.clear();
    WebSocketManager.pendingCloseAcks.clear();
    WebSocketManager.replayGatedListeners.clear();
    WebSocketManager.supersededQueries.clear();
    if (WebSocketManager.reconnectTimer) {
      clearTimeout(WebSocketManager.reconnectTimer);
    }
    WebSocketManager.reconnectTimer = null;
    WebSocketManager.reconnectRetryCount = 0;
    WebSocketManager.pendingUnsubscribes.forEach(clearTimeout);
    WebSocketManager.pendingUnsubscribes.clear();
  });

  describe('WebSocketManager', () => {
    it.each([
      {
        name: 'with a backend token',
        token: 'desktop-token',
        protocols: [
          'headlamp.multiplexer.k8s.io',
          'base64url.headlamp.backend.authorization.k8s.io.ZGVza3RvcC10b2tlbg',
        ],
      },
      { name: 'without a backend token', token: null, protocols: null },
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
      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;

      // Get the subscription message
      const subscribeMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(subscribeMsg).toEqual({
        clusterId: clusterName,
        path,
        query,
        userId,
        type: 'REQUEST',
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
      await new Promise(resolve => setTimeout(resolve, 150));
      const closeMessages = mockServer.messages
        .map(raw => {
          try {
            return JSON.parse(raw as string);
          } catch {
            return null;
          }
        })
        .filter(msg => msg?.type === 'CLOSE');
      expect(closeMessages).toHaveLength(0);
    });
  });

  describe('useWebSocket hook', () => {
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
          expect.any(Function)
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
      vi.useFakeTimers();

      try {
        // Manually set connecting = true to simulate an in-progress attempt
        WebSocketManager.connecting = true;

        // Start a concurrent caller — it enters the polling branch
        const concurrentPromise = WebSocketManager.connect();

        // Simulate the primary connection failing by resetting connecting to false
        WebSocketManager.connecting = false;

        // Advance timers so the setInterval tick fires and detects the failure
        await vi.advanceTimersByTimeAsync(200);

        await expect(concurrentPromise).rejects.toThrow('WebSocket connection failed');
      } finally {
        vi.useRealTimers();
      }
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
      const key = WebSocketManager.createKey(clusterName, path, query);
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
      expect(WebSocketManager.listeners.has(key)).toBe(false);

      vi.stubGlobal('WebSocket', OriginalWebSocket);
    });

    it('should handle reconnection and resubscribe', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      // First connection
      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      await mockServer.nextMessage; // Skip initial subscription

      // Close the connection to trigger reconnect
      mockServer.close();

      // Verify WebSocketManager state after close
      expect(WebSocketManager.socketMultiplexer).toBeNull();
      expect(WebSocketManager.isReconnecting).toBe(true);
      expect(WebSocketManager.connecting).toBe(false);

      // Try to use connection again to trigger reconnect
      const newServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`);
      await WebSocketManager.connect();
      await newServer.connected;

      // Should get resubscription message
      const resubMsg = JSON.parse((await newServer.nextMessage) as string);
      expect(resubMsg).toEqual({
        clusterId: clusterName,
        path,
        query,
        userId,
        type: 'REQUEST',
      });

      // Verify reconnection state is reset
      expect(WebSocketManager.isReconnecting).toBe(false);

      newServer.close();
    });

    it('schedules transport reconnect after an unexpected close', async () => {
      vi.useFakeTimers();
      try {
        const socket = {
          readyState: WebSocket.CLOSED,
          send: vi.fn(),
        } as any;
        WebSocketManager.activeSubscriptions.set(
          WebSocketManager.createKey(clusterName, '/api/v1/pods', 'watch=1'),
          {
            clusterId: clusterName,
            path: '/api/v1/pods',
            query: 'watch=1',
            requestQuery: 'watch=1',
          }
        );
        WebSocketManager.socketMultiplexer = socket;
        const connectSpy = vi
          .spyOn(WebSocketManager, 'connect')
          .mockRejectedValue(new Error('offline'));

        WebSocketManager.handleWebSocketClose();

        expect(connectSpy).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(connectSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reconnect and resubscribe using the latest resourceVersion from incoming messages', async () => {
      const path = '/api/v1/pods';
      const initialQuery = 'watch=1&resourceVersion=100';

      // First connection
      const unsubscribe = await WebSocketManager.subscribe(
        clusterName,
        path,
        initialQuery,
        onMessage
      );
      await mockServer.connected;
      await mockServer.nextMessage; // Skip initial subscription message

      // Incoming watch message arrives from backend updating resourceVersion to 105
      const updateMessage = {
        clusterId: clusterName,
        path,
        query: initialQuery,
        data: JSON.stringify({
          type: 'MODIFIED',
          object: {
            kind: 'Pod',
            metadata: { name: 'pod-1', resourceVersion: '105' },
          },
        }),
      };
      await mockServer.send(JSON.stringify(updateMessage));

      expect(onMessage).toHaveBeenCalledTimes(1);

      // Close the connection to trigger unexpected disconnect
      mockServer.close();

      expect(WebSocketManager.socketMultiplexer).toBeNull();
      expect(WebSocketManager.isReconnecting).toBe(true);

      // Reconnect to a new server
      const newServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`);
      await WebSocketManager.connect();
      await newServer.connected;

      // Resubscription message MUST use the updated resourceVersion 105
      const resubMsg = JSON.parse((await newServer.nextMessage) as string);
      expect(resubMsg).toEqual({
        clusterId: clusterName,
        path,
        query: 'watch=1&resourceVersion=105',
        userId,
        type: 'REQUEST',
      });

      // Subsequent messages on the reconnected stream are delivered to the listener
      const newUpdateMessage = {
        clusterId: clusterName,
        path,
        query: 'watch=1&resourceVersion=105',
        data: JSON.stringify({
          type: 'MODIFIED',
          object: {
            kind: 'Pod',
            metadata: { name: 'pod-1', resourceVersion: '106' },
          },
        }),
      };
      await newServer.send(JSON.stringify(newUpdateMessage));

      expect(onMessage).toHaveBeenCalledTimes(2);

      // Cleanup
      unsubscribe();
      newServer.close();
    });

    it('should deliver multiple consecutive messages on the same connection as resourceVersion advances and resubscribe with the latest resourceVersion', async () => {
      const path = '/api/v1/pods';
      const initialQuery = 'watch=1&resourceVersion=100';

      const unsubscribe = await WebSocketManager.subscribe(
        clusterName,
        path,
        initialQuery,
        onMessage
      );
      await mockServer.connected;
      await mockServer.nextMessage; // Skip initial subscription request

      // Message 1 on existing stream (updates RV to 101)
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { kind: 'Pod', metadata: { name: 'pod-1', resourceVersion: '101' } },
          }),
        })
      );
      expect(onMessage).toHaveBeenCalledTimes(1);

      // Message 2 on the SAME stream (backend still sends initialQuery, updates RV to 102)
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { kind: 'Pod', metadata: { name: 'pod-1', resourceVersion: '102' } },
          }),
        })
      );
      expect(onMessage).toHaveBeenCalledTimes(2);

      // Message 3 on the SAME stream (backend still sends initialQuery, updates RV to 103)
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { kind: 'Pod', metadata: { name: 'pod-1', resourceVersion: '103' } },
          }),
        })
      );
      expect(onMessage).toHaveBeenCalledTimes(3);

      // Now close connection to trigger reconnect
      mockServer.close();
      expect(WebSocketManager.isReconnecting).toBe(true);

      const newServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`);
      await WebSocketManager.connect();
      await newServer.connected;

      // Resubscription must use the latest RV (103)
      const resubMsg = JSON.parse((await newServer.nextMessage) as string);
      expect(resubMsg).toEqual({
        clusterId: clusterName,
        path,
        query: 'watch=1&resourceVersion=103',
        userId,
        type: 'REQUEST',
      });

      // Message on the reconnected stream with the new query
      await newServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: 'watch=1&resourceVersion=103',
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { kind: 'Pod', metadata: { name: 'pod-1', resourceVersion: '104' } },
          }),
        })
      );
      expect(onMessage).toHaveBeenCalledTimes(4);

      unsubscribe();
      newServer.close();
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

    it('allows a fresh watch request after a stream fails with an ERROR', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=true';

      const errorCallback = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, errorCallback);
      await mockServer.connected;
      const firstRequest = await mockServer.nextMessage;
      expect(JSON.parse(firstRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Backend fails to establish watch and sends ERROR
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({ error: 'failed to establish watch' }),
          type: 'ERROR',
        })
      );

      await vi.waitFor(() => {
        expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
      });

      // Subsequent subscription after failure must send a fresh REQUEST rather than skipping it
      const onMessage2 = vi.fn();
      const errorCallback2 = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage2, errorCallback2);

      const secondRequest = await mockServer.nextMessage;
      expect(JSON.parse(secondRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });
    });

    it('allows a fresh watch request after receiving a nested Kubernetes ERROR event (410)', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=100';

      const key = WebSocketManager.createKey(clusterName, path, query);
      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      const firstRequest = await mockServer.nextMessage;
      expect(JSON.parse(firstRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Backend delivers a nested Kubernetes ERROR (e.g. 410 Gone / expired resourceVersion)
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({
            type: 'ERROR',
            object: {
              kind: 'Status',
              status: 'Failure',
              message: 'too old resource version: 100 (200)',
              code: 410,
              reason: 'Expired',
            },
          }),
        })
      );

      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ERROR',
            object: expect.objectContaining({ code: 410 }),
          })
        );
      });

      expect(WebSocketManager.failedStreams.has(key)).toBe(true);

      // Re-subscribing to this stream must send a fresh REQUEST rather than skipping it
      const onMessage2 = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage2);

      const secondRequest = await mockServer.nextMessage;
      expect(JSON.parse(secondRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Subsequent valid event clears the failed stream marker
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({
            type: 'ADDED',
            object: { kind: 'Pod', metadata: { name: 'pod-1', resourceVersion: '201' } },
          }),
        })
      );

      await vi.waitFor(() => {
        expect(onMessage2).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ADDED',
          })
        );
      });

      expect(WebSocketManager.failedStreams.has(key)).toBe(false);
    });

    it('tracks failed streams across aliased query variants when receiving a nested Kubernetes ERROR', async () => {
      const path = '/api/v1/pods';
      const queryA = 'watch=1&labelSelector=app%3Dweb&resourceVersion=10';
      const queryB = 'labelSelector=app%3Dweb&watch=1&resourceVersion=20';

      const keyA = WebSocketManager.createKey(clusterName, path, queryA);
      const keyB = WebSocketManager.createKey(clusterName, path, queryB);
      expect(keyA).toBe(keyB);
      const canonicalKey = keyA;

      const onMessageA = vi.fn();
      const onMessageB = vi.fn();

      const cleanupA = await WebSocketManager.subscribe(clusterName, path, queryA, onMessageA);
      await mockServer.connected;
      const initialRequest = await mockServer.nextMessage;
      expect(JSON.parse(initialRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Second subscriber joins with queryB (alias ordering)
      const cleanupB = await WebSocketManager.subscribe(clusterName, path, queryB, onMessageB);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockServer.messages).toHaveLength(1);

      // Backend delivers a nested Kubernetes ERROR referencing queryB
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: queryB,
          data: JSON.stringify({
            type: 'ERROR',
            object: {
              kind: 'Status',
              status: 'Failure',
              message: 'too old resource version: 20 (30)',
              code: 410,
              reason: 'Expired',
            },
          }),
        })
      );

      await vi.waitFor(() => {
        expect(onMessageA).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ERROR',
            object: expect.objectContaining({ code: 410 }),
          })
        );
        expect(onMessageB).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ERROR',
            object: expect.objectContaining({ code: 410 }),
          })
        );
      });

      // Verify failedStreams tracks the canonical key
      expect(WebSocketManager.failedStreams.has(canonicalKey)).toBe(true);

      // Re-subscribing with queryA must send a fresh REQUEST because stream is marked failed
      const onMessageFresh = vi.fn();
      const cleanupFresh = await WebSocketManager.subscribe(
        clusterName,
        path,
        queryA,
        onMessageFresh
      );
      const replacementRequest = await mockServer.nextMessage;
      expect(JSON.parse(replacementRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Subsequent valid event clears failedStreams
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: queryA,
          data: JSON.stringify({
            type: 'ADDED',
            object: { kind: 'Pod', metadata: { name: 'pod-fresh', resourceVersion: '31' } },
          }),
        })
      );

      await vi.waitFor(() => {
        expect(onMessageFresh).toHaveBeenCalledWith(expect.objectContaining({ type: 'ADDED' }));
      });

      expect(WebSocketManager.failedStreams.has(canonicalKey)).toBe(false);

      cleanupA();
      cleanupB();
      cleanupFresh();
    });

    it('marks stream as failed upon nested 403 Forbidden ERROR and preserves error handling without request loops', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';

      const key = WebSocketManager.createKey(clusterName, path, query);
      const cleanup = await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      const initialRequest = await mockServer.nextMessage;
      expect(JSON.parse(initialRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Backend delivers a nested 403 Forbidden ERROR (non-410)
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({
            type: 'ERROR',
            object: {
              kind: 'Status',
              status: 'Failure',
              message: 'pods is forbidden: User cannot list resource pods',
              code: 403,
              reason: 'Forbidden',
            },
          }),
        })
      );

      // Verify error handling semantics are preserved (onMessage receives the error)
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ERROR',
            object: expect.objectContaining({
              code: 403,
              reason: 'Forbidden',
            }),
          })
        );
      });

      // Verify the multiplexer marks the stream as failed
      expect(WebSocketManager.failedStreams.has(key)).toBe(true);

      // Verify no unsolicited replacement requests are emitted (no infinite loop)
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockServer.messages).toHaveLength(1);

      // Verify replacement behavior: re-subscribing explicitly sends a single fresh REQUEST
      const onMessage2 = vi.fn();
      const cleanup2 = await WebSocketManager.subscribe(clusterName, path, query, onMessage2);
      const secondRequest = await mockServer.nextMessage;
      expect(JSON.parse(secondRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Failed stream marker is cleared on replacement
      expect(WebSocketManager.failedStreams.has(key)).toBe(false);

      cleanup();
      cleanup2();
    });

    it('notifies close listeners and allows subsequent subscriber to revive stream when upstream watch closes', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const key = WebSocketManager.createKey(clusterName, path, query);

      const onClose1 = vi.fn();
      const cleanup1 = await WebSocketManager.subscribe(
        clusterName,
        path,
        query,
        onMessage,
        undefined,
        onClose1
      );

      await mockServer.connected;
      const initialRequest = await mockServer.nextMessage;
      expect(JSON.parse(initialRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Backend notifies that upstream watch closed (STATUS: closed)
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );

      // Verify close listener was notified
      await vi.waitFor(() => {
        expect(onClose1).toHaveBeenCalledTimes(1);
      });

      // Stream must no longer be marked active
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
      expect(WebSocketManager.failedStreams.has(key)).toBe(true);

      // A subsequent subscriber subscribes while listener 1 remains
      const onMessage2 = vi.fn();
      const cleanup2 = await WebSocketManager.subscribe(clusterName, path, query, onMessage2);

      // A new REQUEST must be sent to backend to revive the dead stream
      const reviveRequest = await mockServer.nextMessage;
      expect(JSON.parse(reviveRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      cleanup1();
      cleanup2();
    });

    it('retains closed streams without close listeners for transport resubscription', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const key = WebSocketManager.createKey(clusterName, path, query);

      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      await mockServer.nextMessage;

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );

      await vi.waitFor(() => {
        expect(WebSocketManager.failedStreams.has(key)).toBe(true);
      });
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(true);

      const mockWs = { send: vi.fn() } as any;
      WebSocketManager.resubscribeAll(mockWs);

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockWs.send.mock.calls[0][0])).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });
      expect(WebSocketManager.failedStreams.has(key)).toBe(false);
    });

    it('re-subscribes previously failed streams when the multiplexer reconnects', async () => {
      const path = '/api/v1/services';
      const query = 'watch=true';

      const errorCallback = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage, errorCallback);
      await mockServer.connected;
      const firstRequest = await mockServer.nextMessage;
      expect(JSON.parse(firstRequest as string)).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
      });

      // Backend sends ERROR for this stream
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({ error: 'temporarily unavailable' }),
          type: 'ERROR',
        })
      );

      await vi.waitFor(() => {
        expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
      });

      // Now the multiplexer socket reconnects and calls resubscribeAll
      const mockWs = { send: vi.fn() } as any;
      WebSocketManager.resubscribeAll(mockWs);

      // It must attempt to revive the subscription
      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMsg).toMatchObject({
        type: 'REQUEST',
        path,
        clusterId: clusterName,
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

    it('reuses canonical subscription when a newer subscriber joins', async () => {
      const path = '/api/v1/pods';
      const queryA = 'watch=1&resourceVersion=10';
      const queryB = 'resourceVersion=20&watch=1';
      const onMessageA = vi.fn();
      const onMessageB = vi.fn();

      const cleanupA = await WebSocketManager.subscribe(clusterName, path, queryA, onMessageA);
      await mockServer.connected;

      const firstRequest = JSON.parse((await mockServer.nextMessage) as string);
      expect(firstRequest.type).toBe('REQUEST');
      expect(firstRequest.path).toBe(path);

      // A subscriber from a newer snapshot can safely join the stream without reconnecting.
      const cleanupB = await WebSocketManager.subscribe(clusterName, path, queryB, onMessageB);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockServer.messages).toHaveLength(1);

      // Send update event matching canonical stream
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: queryA,
          data: JSON.stringify({
            type: 'ADDED',
            object: {
              kind: 'Pod',
              metadata: { name: 'pod-1', resourceVersion: '25' },
            },
          }),
        })
      );

      expect(onMessageA).toHaveBeenCalledTimes(1);
      expect(onMessageB).toHaveBeenCalledTimes(1);

      // Unsubscribe first subscriber
      cleanupA();

      // Send second update
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: queryA,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: {
              kind: 'Pod',
              metadata: { name: 'pod-1', resourceVersion: '26' },
            },
          }),
        })
      );

      // Only onMessageB receives the second update
      expect(onMessageA).toHaveBeenCalledTimes(1);
      expect(onMessageB).toHaveBeenCalledTimes(2);

      // Clean up second subscriber
      cleanupB();
      await new Promise(resolve => setTimeout(resolve, 150));
      const closeMessages = mockServer.messages
        .map(raw => {
          try {
            return JSON.parse(raw as string);
          } catch {
            return null;
          }
        })
        .filter(msg => msg?.type === 'CLOSE');
      expect(closeMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('keeps keyAliases bounded and does not add aliases on consecutive watch events', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=100';

      const cleanup = await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      await mockServer.nextMessage;

      const initialAliasesSize = WebSocketManager.keyAliases.size;

      // Simulate 10 consecutive watch events updating resourceVersion
      for (let i = 1; i <= 10; i++) {
        await mockServer.send(
          JSON.stringify({
            clusterId: clusterName,
            path,
            query,
            data: JSON.stringify({
              type: 'MODIFIED',
              object: {
                kind: 'Pod',
                metadata: { name: `pod-${i}`, resourceVersion: `${100 + i}` },
              },
            }),
          })
        );
      }

      expect(onMessage).toHaveBeenCalledTimes(10);
      // Key aliases should not grow with each watch message
      expect(WebSocketManager.keyAliases.size).toBe(initialAliasesSize);

      cleanup();
    });

    it('sends catch-up REQUEST when a joining subscriber has an older resourceVersion than the active stream', async () => {
      const path = '/api/v1/pods';
      const initialQuery = 'watch=1&resourceVersion=98';
      const staleQuery = 'watch=1&resourceVersion=99';
      const key = WebSocketManager.createKey(clusterName, path, initialQuery);

      const onMessage1 = vi.fn();
      const cleanup1 = await WebSocketManager.subscribe(
        clusterName,
        path,
        initialQuery,
        onMessage1
      );
      await mockServer.connected;
      const firstReq = JSON.parse((await mockServer.nextMessage) as string);
      expect(firstReq).toMatchObject({
        type: 'REQUEST',
        path,
        query: initialQuery,
        clusterId: clusterName,
      });

      // Active stream advances to resourceVersion 101 via a DELETED event
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          type: 'DATA',
          data: JSON.stringify({
            type: 'DELETED',
            object: { metadata: { name: 'pod-1', resourceVersion: '101' } },
          }),
        })
      );

      await vi.waitFor(() => {
        expect(onMessage1).toHaveBeenCalledTimes(1);
      });
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toBe(
        'watch=1&resourceVersion=101'
      );

      // A second subscriber joins from a delayed LIST snapshot at resourceVersion 99
      const onMessage2 = vi.fn();
      const cleanup2 = await WebSocketManager.subscribe(clusterName, path, staleQuery, onMessage2);

      // Must send a catch-up REQUEST with the joining subscriber's older resourceVersion (99)
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'CLOSE',
        query: 'watch=1&resourceVersion=98',
      });
      const catchUpReq = JSON.parse((await mockServer.nextMessage) as string);
      expect(catchUpReq).toMatchObject({
        type: 'REQUEST',
        path,
        query: staleQuery,
        clusterId: clusterName,
      });

      // Active subscription must NOT regress its tracked resourceVersion below 101
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toBe(
        'watch=1&resourceVersion=99'
      );

      const onMessage3 = vi.fn();
      const cleanup3 = await WebSocketManager.subscribe(
        clusterName,
        path,
        'watch=1&resourceVersion=100',
        onMessage3
      );

      // Any final event from the superseded stream is ignored while the CLOSE is pending.
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          type: 'DATA',
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-old', resourceVersion: '101' } },
          }),
        })
      );
      expect(onMessage2).not.toHaveBeenCalled();
      expect(onMessage3).not.toHaveBeenCalled();

      // The backend acknowledges the intentional query-less CLOSE.
      await new Promise(resolve => setTimeout(resolve, 1100));
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(true);

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-old-late', resourceVersion: '105' } },
          }),
        })
      );
      expect(onMessage2).not.toHaveBeenCalled();

      // Replay of the missed deletion at 101 reaches the joining subscriber
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: staleQuery,
          type: 'DATA',
          data: JSON.stringify({
            type: 'DELETED',
            object: { metadata: { name: 'pod-1', resourceVersion: '101' } },
          }),
        })
      );

      await vi.waitFor(() => {
        expect(onMessage2).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'DELETED',
            object: { metadata: { name: 'pod-1', resourceVersion: '101' } },
          })
        );
        expect(onMessage3).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'DELETED',
            object: { metadata: { name: 'pod-1', resourceVersion: '101' } },
          })
        );
      });

      cleanup1();
      cleanup2();
      cleanup3();
    });

    it('gates a joining listener while the initial transport is connecting', async () => {
      const path = '/api/v1/pods';
      const activeQuery = 'watch=1&resourceVersion=101';
      const joiningQuery = 'watch=1&resourceVersion=99';
      const activeMessage = vi.fn();
      const joiningMessage = vi.fn();

      const activeCleanup = WebSocketManager.subscribe(
        clusterName,
        path,
        activeQuery,
        activeMessage
      );
      const joiningCleanup = WebSocketManager.subscribe(
        clusterName,
        path,
        joiningQuery,
        joiningMessage
      );

      await mockServer.connected;
      await Promise.all([activeCleanup, joiningCleanup]);
      await mockServer.nextMessage;
      await mockServer.nextMessage;
      await mockServer.nextMessage;

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: activeQuery,
          data: JSON.stringify({
            type: 'ADDED',
            object: { metadata: { name: 'pod-live', resourceVersion: '105' } },
          }),
        })
      );
      expect(activeMessage).toHaveBeenCalledTimes(0);
      expect(joiningMessage).not.toHaveBeenCalled();

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: joiningQuery,
          data: JSON.stringify({
            type: 'DELETED',
            object: { metadata: { name: 'pod-replayed', resourceVersion: '100' } },
          }),
        })
      );
      expect(joiningMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DELETED',
          object: expect.objectContaining({
            metadata: expect.objectContaining({ resourceVersion: '100' }),
          }),
        })
      );
    });

    it('resubscribes a pending catch-up from the joining cursor if transport drops first', async () => {
      const path = '/api/v1/pods';
      const initialQuery = 'watch=1&resourceVersion=101';
      const joiningQuery = 'watch=1&resourceVersion=99';
      const key = WebSocketManager.createKey(clusterName, path, initialQuery);

      await WebSocketManager.subscribe(clusterName, path, initialQuery, vi.fn());
      await mockServer.connected;
      await mockServer.nextMessage;

      await WebSocketManager.subscribe(clusterName, path, joiningQuery, vi.fn());
      await mockServer.nextMessage;
      await mockServer.nextMessage;
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toBe(joiningQuery);

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-old', resourceVersion: '102' } },
          }),
        })
      );
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toBe(joiningQuery);

      WebSocketManager.handleWebSocketClose();
      const replacement = { send: vi.fn() } as any;
      WebSocketManager.resubscribeAll(replacement);

      expect(replacement.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(replacement.send.mock.calls[0][0])).toMatchObject({
        type: 'REQUEST',
        query: joiningQuery,
      });
    });

    it('accepts replay events when replacement returns to the original request cursor', async () => {
      const path = '/api/v1/pods';
      const originalQuery = 'watch=1&resourceVersion=100';
      const joiningMessage = vi.fn();

      await WebSocketManager.subscribe(clusterName, path, originalQuery, vi.fn());
      await mockServer.connected;
      await mockServer.nextMessage;
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: originalQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-advanced', resourceVersion: '200' } },
          }),
        })
      );

      await WebSocketManager.subscribe(clusterName, path, originalQuery, joiningMessage);
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'CLOSE',
        query: originalQuery,
      });
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'REQUEST',
        query: originalQuery,
      });
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: originalQuery,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: originalQuery,
          data: JSON.stringify({
            type: 'DELETED',
            object: { metadata: { name: 'pod-replayed', resourceVersion: '101' } },
          }),
        })
      );
      expect(joiningMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'DELETED' }));
    });

    it('does not let a slower concurrent join advance a pending replay cursor', async () => {
      const path = '/api/v1/pods';
      const activeQuery = 'watch=1&resourceVersion=101';
      const olderQuery = 'watch=1&resourceVersion=99';
      const slowerQuery = 'watch=1&resourceVersion=100';

      await WebSocketManager.subscribe(clusterName, path, activeQuery, vi.fn());
      await mockServer.connected;
      await mockServer.nextMessage;

      const cleanup99 = WebSocketManager.subscribe(clusterName, path, olderQuery, vi.fn());
      const cleanup100 = WebSocketManager.subscribe(clusterName, path, slowerQuery, vi.fn());
      await Promise.all([cleanup99, cleanup100]);

      const close = JSON.parse((await mockServer.nextMessage) as string);
      const request = JSON.parse((await mockServer.nextMessage) as string);
      expect(close).toMatchObject({ type: 'CLOSE', query: activeQuery });
      expect(request).toMatchObject({ type: 'REQUEST', query: olderQuery });
      expect(mockServer.messages).toHaveLength(3);
    });

    it('keeps all joiners gated through overlapping catch-up acknowledgements', async () => {
      const path = '/api/v1/pods';
      const activeQuery = 'watch=1&resourceVersion=101';
      const firstQuery = 'watch=1&resourceVersion=100';
      const finalQuery = 'watch=1&resourceVersion=90';
      const onFirst = vi.fn();
      const onFinal = vi.fn();

      await WebSocketManager.subscribe(clusterName, path, activeQuery, vi.fn());
      await mockServer.connected;
      await mockServer.nextMessage;

      const firstJoin = WebSocketManager.subscribe(clusterName, path, firstQuery, onFirst);
      const finalJoin = WebSocketManager.subscribe(clusterName, path, finalQuery, onFinal);
      await Promise.all([firstJoin, finalJoin]);

      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'CLOSE',
        query: activeQuery,
      });
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'REQUEST',
        query: firstQuery,
      });
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'CLOSE',
        query: firstQuery,
      });
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'REQUEST',
        query: finalQuery,
      });

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: firstQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-intermediate', resourceVersion: '100' } },
          }),
        })
      );
      expect(onFirst).not.toHaveBeenCalled();
      expect(onFinal).not.toHaveBeenCalled();

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: finalQuery,
          data: JSON.stringify({
            type: 'DELETED',
            object: { metadata: { name: 'pod-caught-up', resourceVersion: '91' } },
          }),
        })
      );
      expect(onFirst).toHaveBeenCalledTimes(1);
      expect(onFinal).toHaveBeenCalledTimes(1);
    });

    it('ignores delayed acknowledgement after a final unsubscribe and remount', async () => {
      const path = '/api/v1/services';
      const query = 'watch=1&resourceVersion=10';
      const onClose = vi.fn();

      const cleanup = await WebSocketManager.subscribe(clusterName, path, query, vi.fn());
      await mockServer.connected;
      await mockServer.nextMessage;

      cleanup();
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'CLOSE',
      });

      await WebSocketManager.subscribe(clusterName, path, query, vi.fn(), undefined, onClose);
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'REQUEST',
      });

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );

      expect(onClose).not.toHaveBeenCalled();
      expect(
        WebSocketManager.activeSubscriptions.has(
          WebSocketManager.createKey(clusterName, path, query)
        )
      ).toBe(true);
    });

    it('does not expect a close acknowledgement after stream closure and delayed relist', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=100';
      const key = WebSocketManager.createKey(clusterName, path, query);
      const onClose = vi.fn();
      const cleanup = await WebSocketManager.subscribe(
        clusterName,
        path,
        query,
        vi.fn(),
        undefined,
        onClose
      );
      await mockServer.connected;
      await mockServer.nextMessage;

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          type: 'STATUS',
          data: JSON.stringify({ state: 'closed', error: '' }),
        })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);

      cleanup();
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(mockServer.messages).toHaveLength(1);
      expect(WebSocketManager.pendingCloseAcks.has(key)).toBe(false);

      const replacementMessage = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, replacementMessage);
      await mockServer.nextMessage;
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          data: JSON.stringify({
            type: 'ADDED',
            object: { metadata: { name: 'pod-relisted', resourceVersion: '200' } },
          }),
        })
      );
      expect(replacementMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADDED',
          object: expect.objectContaining({
            metadata: expect.objectContaining({ resourceVersion: '200' }),
          }),
        })
      );
    });

    it('compares very large numeric resourceVersions using BigInt precision', async () => {
      const path = '/api/v1/pods';
      const activeQuery = 'watch=1&resourceVersion=9007199254740993';
      const joiningQuery = 'watch=1&resourceVersion=9007199254740992';

      const onMessage1 = vi.fn();
      const cleanup1 = await WebSocketManager.subscribe(clusterName, path, activeQuery, onMessage1);
      await mockServer.connected;
      await mockServer.nextMessage;

      const onMessage2 = vi.fn();
      const cleanup2 = await WebSocketManager.subscribe(
        clusterName,
        path,
        joiningQuery,
        onMessage2
      );

      // Both exceed Number.MAX_SAFE_INTEGER; BigInt must still detect 9007199254740992 < 9007199254740993
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'CLOSE',
        query: activeQuery,
      });
      const catchUpReq = JSON.parse((await mockServer.nextMessage) as string);
      expect(catchUpReq).toMatchObject({
        type: 'REQUEST',
        path,
        query: joiningQuery,
        clusterId: clusterName,
      });

      cleanup1();
      cleanup2();
    });

    it('does not trigger catch-up for opaque or missing resourceVersions', async () => {
      const path = '/api/v1/pods';
      const activeQuery = 'watch=1&resourceVersion=101';

      const onMessage1 = vi.fn();
      const cleanup1 = await WebSocketManager.subscribe(clusterName, path, activeQuery, onMessage1);
      await mockServer.connected;
      await mockServer.nextMessage;

      const sendSpy = vi.spyOn(WebSocketManager.socketMultiplexer!, 'send');

      // Opaque resourceVersion with numeric prefix must not be parsed as 100
      const onMessage2 = vi.fn();
      const cleanup2 = await WebSocketManager.subscribe(
        clusterName,
        path,
        'watch=1&resourceVersion=100-abc',
        onMessage2
      );
      expect(sendSpy).toHaveBeenCalledTimes(1);
      sendSpy.mockClear();

      // Missing resourceVersion must not trigger catch-up
      const onMessage3 = vi.fn();
      const cleanup3 = await WebSocketManager.subscribe(clusterName, path, 'watch=1', onMessage3);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      sendSpy.mockClear();

      // Non-older numeric resourceVersion must not trigger catch-up
      const onMessage4 = vi.fn();
      const cleanup4 = await WebSocketManager.subscribe(
        clusterName,
        path,
        'watch=1&resourceVersion=101',
        onMessage4
      );

      expect(sendSpy).not.toHaveBeenCalled();

      cleanup1();
      cleanup2();
      cleanup3();
      cleanup4();
    });

    it('isolates streams with incomparable opaque cursors', async () => {
      const path = '/api/v1/secrets';
      const activeQuery = 'watch=1&resourceVersion=opaque-current';
      const joiningQuery = 'watch=1&resourceVersion=opaque-old';
      const onClose = vi.fn();
      const activeMessage = vi.fn();
      const joiningMessage = vi.fn();

      await WebSocketManager.subscribe(clusterName, path, activeQuery, activeMessage);
      await mockServer.connected;
      await mockServer.nextMessage;

      await WebSocketManager.subscribe(
        clusterName,
        path,
        joiningQuery,
        joiningMessage,
        undefined,
        onClose
      );

      expect(onClose).not.toHaveBeenCalled();
      expect(JSON.parse((await mockServer.nextMessage) as string)).toMatchObject({
        type: 'REQUEST',
        query: joiningQuery,
      });

      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: activeQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'secret-a', resourceVersion: 'opaque-advanced' } },
          }),
        })
      );
      expect(activeMessage).toHaveBeenCalledTimes(1);
      expect(joiningMessage).not.toHaveBeenCalled();

      const replacement = { send: vi.fn() } as any;
      WebSocketManager.resubscribeAll(replacement);
      const queries = replacement.send.mock.calls
        .map((call: [string]) => JSON.parse(call[0]).query)
        .sort();
      expect(queries).toEqual([activeQuery, joiningQuery].sort());
      expect(
        WebSocketManager.keyAliases.has(
          WebSocketManager.createKey(clusterName, path, 'watch=1&resourceVersion=opaque-advanced')
        )
      ).toBe(false);
    });

    it('does not collide with an active numeric-cursor subscription when reconnecting an empty-cursor subscription', async () => {
      const path = '/api/v1/pods';
      const emptyCursorQuery = 'watch=1&resourceVersion=';
      const numericCursorQuery = 'watch=1&resourceVersion=50';
      const emptyCursorKey = WebSocketManager.createKey(clusterName, path, emptyCursorQuery);
      const numericCursorKey = WebSocketManager.createKey(clusterName, path, numericCursorQuery);

      const onEmptyCursorMessage = vi.fn();
      const onNumericCursorMessage = vi.fn();

      const cleanupEmpty = await WebSocketManager.subscribe(
        clusterName,
        path,
        emptyCursorQuery,
        onEmptyCursorMessage
      );
      await mockServer.connected;
      await mockServer.nextMessage;

      const cleanupNumeric = await WebSocketManager.subscribe(
        clusterName,
        path,
        numericCursorQuery,
        onNumericCursorMessage
      );
      await mockServer.nextMessage;

      // Advance the empty-cursor subscription to a numeric resourceVersion
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: emptyCursorQuery,
          data: JSON.stringify({
            type: 'ADDED',
            object: { metadata: { name: 'pod-a', resourceVersion: '105' } },
          }),
        })
      );
      expect(onEmptyCursorMessage).toHaveBeenCalledTimes(1);

      // Reconnecting must not alias the active numeric-cursor key to the empty-cursor key
      const replacementWs = { send: vi.fn() } as any;
      WebSocketManager.resubscribeAll(replacementWs);

      expect(WebSocketManager.keyAliases.has(numericCursorKey)).toBe(false);

      // Events for the numeric-cursor subscription still route to its own listener
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: numericCursorQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-b', resourceVersion: '51' } },
          }),
        })
      );
      expect(onNumericCursorMessage).toHaveBeenCalledTimes(1);
      expect(onEmptyCursorMessage).toHaveBeenCalledTimes(1);

      // Events for the reconnected empty-cursor stream route to its own listener
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: 'watch=1&resourceVersion=105',
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-a', resourceVersion: '106' } },
          }),
        })
      );
      expect(onEmptyCursorMessage).toHaveBeenCalledTimes(2);
      expect(onNumericCursorMessage).toHaveBeenCalledTimes(1);

      // Unsubscribing the numeric-cursor subscription cleans up its own state without affecting the other
      vi.useFakeTimers();
      try {
        cleanupNumeric();
        vi.advanceTimersByTime(150);
      } finally {
        vi.useRealTimers();
      }

      expect(WebSocketManager.listeners.has(numericCursorKey)).toBe(false);
      expect(WebSocketManager.activeSubscriptions.has(numericCursorKey)).toBe(false);
      expect(WebSocketManager.listeners.has(emptyCursorKey)).toBe(true);
      expect(WebSocketManager.activeSubscriptions.has(emptyCursorKey)).toBe(true);

      cleanupEmpty();
    });
  });
});
