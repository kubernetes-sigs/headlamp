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
    WebSocketManager.completedPaths.clear();
    WebSocketManager.activeSubscriptions.clear();
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
      const msg = await Promise.race([
        mockServer.nextMessage,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 150)),
      ]);
      if (msg !== null) {
        expect(JSON.parse(msg as string).type).not.toBe('CLOSE');
      }
    });

    it('should update reconnect metadata on watch events and resubscribe with the latest resourceVersion', async () => {
      const path = '/api/v1/pods';
      const initialQuery = 'watch=1&resourceVersion=100';

      await WebSocketManager.subscribe(clusterName, path, initialQuery, onMessage);
      await mockServer.connected;

      // Verify initial subscription was sent with resourceVersion 100
      const initialMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(initialMsg.query).toContain('resourceVersion=100');

      // Deliver an incoming watch event with a newer resourceVersion 105
      const watchEvent = {
        clusterId: clusterName,
        path,
        query: initialQuery,
        data: JSON.stringify({
          type: 'MODIFIED',
          object: {
            metadata: {
              resourceVersion: '105',
            },
          },
        }),
      };
      await mockServer.send(JSON.stringify(watchEvent));

      // Verify listener received update
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalled();
      });

      // Simulate connection drop
      mockServer.close();
      WebSocketManager.handleWebSocketClose();
      expect(WebSocketManager.isReconnecting).toBe(true);

      // Clean old server and set up new server for reconnect
      WS.clean();
      const reconnectServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`);

      // Reconnect
      await WebSocketManager.connect();
      await reconnectServer.connected;

      // Verify resubscription uses the updated resourceVersion 105 instead of stale 100
      const resubMsg = JSON.parse((await reconnectServer.nextMessage) as string);
      expect(resubMsg.type).toBe('REQUEST');
      expect(resubMsg.path).toBe(path);
      expect(resubMsg.query).toContain('resourceVersion=105');
      expect(resubMsg.query).not.toContain('resourceVersion=100');

      // Deliver another watch event on the reconnected stream
      const subsequentEvent = {
        clusterId: clusterName,
        path,
        query: resubMsg.query,
        data: JSON.stringify({
          type: 'MODIFIED',
          object: {
            metadata: {
              resourceVersion: '110',
            },
          },
        }),
      };
      await reconnectServer.send(JSON.stringify(subsequentEvent));

      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledTimes(2);
      });
    });

    it('should keep initially unversioned detail watches unversioned on reconnect after receiving events with old resourceVersion', async () => {
      const path = '/api/v1/namespaces/default/pods';
      const initialQuery = 'watch=1&fieldSelector=metadata.name%3Dmy-pod';

      await WebSocketManager.subscribe(clusterName, path, initialQuery, onMessage);
      await mockServer.connected;

      // Verify initial subscription was sent without resourceVersion
      const initialMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(initialMsg.query).not.toContain('resourceVersion');

      // Deliver an incoming ADDED event with an old resourceVersion (e.g. '5')
      const watchEvent = {
        clusterId: clusterName,
        path,
        query: initialQuery,
        data: JSON.stringify({
          type: 'ADDED',
          object: {
            metadata: {
              name: 'my-pod',
              resourceVersion: '5',
            },
          },
        }),
      };
      await mockServer.send(JSON.stringify(watchEvent));

      // Verify listener received update
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalled();
      });

      // Simulate connection drop
      mockServer.close();
      WebSocketManager.handleWebSocketClose();
      expect(WebSocketManager.isReconnecting).toBe(true);

      // Clean old server and set up new server for reconnect
      WS.clean();
      const reconnectServer = new WS(`${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`);

      // Reconnect
      await WebSocketManager.connect();
      await reconnectServer.connected;

      // Verify resubscription stays unversioned so it does not fail with 410
      const resubMsg = JSON.parse((await reconnectServer.nextMessage) as string);
      expect(resubMsg.type).toBe('REQUEST');
      expect(resubMsg.path).toBe(path);
      expect(resubMsg.query).not.toContain('resourceVersion');
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

    it('should explicitly send CLOSE before REQUEST when re-subscribing with an updated query', async () => {
      const path = '/api/v1/pods';
      const initialQuery = 'watch=1&resourceVersion=100';
      const updatedQuery = 'watch=1&resourceVersion=200';

      await WebSocketManager.subscribe(clusterName, path, initialQuery, onMessage);
      await mockServer.connected;

      const firstMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(firstMsg.type).toBe('REQUEST');
      expect(firstMsg.query).toBe(initialQuery);

      // Re-subscribing with a different query (e.g. fresh LIST generation) on the same normalized key
      await WebSocketManager.subscribe(clusterName, path, updatedQuery, onMessage);

      const closeMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(closeMsg.type).toBe('CLOSE');
      expect(closeMsg.query).toBe(initialQuery);

      const restartMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(restartMsg.type).toBe('REQUEST');
      expect(restartMsg.query).toBe(updatedQuery);
    });

    it('should ignore delayed frames from a retired stream after restarting with a new query', async () => {
      const path = '/api/v1/pods';
      const initialQuery = 'watch=1&resourceVersion=100';
      const restartedQuery = 'watch=1&resourceVersion=200';
      const oldListener = vi.fn();
      const newListener = vi.fn();

      const cleanupOld = await WebSocketManager.subscribe(
        clusterName,
        path,
        initialQuery,
        oldListener
      );
      await mockServer.connected;
      await mockServer.nextMessage; // initial REQUEST

      // Unsubscribe old listener and restart with new query (LIST generation change)
      cleanupOld();
      await WebSocketManager.subscribe(clusterName, path, restartedQuery, newListener);

      const closeMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(closeMsg.type).toBe('CLOSE');
      expect(closeMsg.query).toBe(initialQuery);

      const restartMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(restartMsg.type).toBe('REQUEST');
      expect(restartMsg.query).toBe(restartedQuery);

      // Deliver a delayed frame from the retired stream (old query) with RV 300
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: initialQuery,
          data: JSON.stringify({
            type: 'MODIFIED',
            object: { metadata: { name: 'pod-b', resourceVersion: '300' } },
          }),
          type: 'DATA',
        })
      );

      // Wait a microtask and verify neither listener nor reconnect cursor was affected
      await Promise.resolve();
      expect(oldListener).not.toHaveBeenCalled();
      expect(newListener).not.toHaveBeenCalled();

      const key = WebSocketManager.createKey(clusterName, path, restartedQuery);
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toBe(restartedQuery);

      // Deliver a frame from the new stream incarnation (new query) with RV 205
      const newUpdate = {
        type: 'MODIFIED',
        object: { metadata: { name: 'pod-a', resourceVersion: '205' } },
      };
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: restartedQuery,
          data: JSON.stringify(newUpdate),
          type: 'DATA',
        })
      );

      await vi.waitFor(() => {
        expect(newListener).toHaveBeenCalledWith(newUpdate);
      });
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toContain('resourceVersion=205');
    });

    it('should preserve shared stream and reconnect cursor when a second consumer attaches with a different resourceVersion', async () => {
      const path = '/api/v1/pods';
      const consumerAQuery = 'watch=1&resourceVersion=100';
      const consumerBQuery = 'watch=1&resourceVersion=200';
      const listenerA = vi.fn();
      const listenerB = vi.fn();

      await WebSocketManager.subscribe(clusterName, path, consumerAQuery, listenerA);
      await mockServer.connected;

      const initialMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(initialMsg.type).toBe('REQUEST');
      expect(initialMsg.query).toBe(consumerAQuery);

      // Second consumer attaches while consumer A is still active
      await WebSocketManager.subscribe(clusterName, path, consumerBQuery, listenerB);

      const key = WebSocketManager.createKey(clusterName, path, consumerAQuery);
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toBe(consumerAQuery);
      expect(WebSocketManager.activeSubscriptions.get(key)?.streamQuery).toBe(consumerAQuery);

      // Deliver an update on consumer A's active stream — both consumers receive it
      const update = {
        type: 'MODIFIED',
        object: { metadata: { name: 'pod-1', resourceVersion: '105' } },
      };
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: consumerAQuery,
          data: JSON.stringify(update),
          type: 'DATA',
        })
      );

      await vi.waitFor(() => {
        expect(listenerA).toHaveBeenCalledWith(update);
        expect(listenerB).toHaveBeenCalledWith(update);
      });

      // Ensure no CLOSE was ever sent while consumer A remained active
      expect(mockServer.messages).toHaveLength(1);
      expect(WebSocketManager.activeSubscriptions.get(key)?.query).toContain('resourceVersion=105');
    });

    it('should normalize query encoding consistently in createKey regardless of resourceVersion presence', () => {
      const path = '/api/v1/pods';
      const keyWithRV = WebSocketManager.createKey(
        clusterName,
        path,
        'labelSelector=app%20in%20(a)&watch=1&resourceVersion=10'
      );
      const keyWithoutRV = WebSocketManager.createKey(
        clusterName,
        path,
        'labelSelector=app%20in%20(a)&watch=1'
      );
      expect(keyWithRV).toBe(keyWithoutRV);
    });

    it('should unsubscribe failed attempt and allow subsequent retry after connect() failure', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const key = WebSocketManager.createKey(clusterName, path, query);
      const connectSpy = vi.spyOn(WebSocketManager, 'connect');

      // First connection fails
      connectSpy.mockRejectedValueOnce(new Error('Connection failure'));
      await expect(WebSocketManager.subscribe(clusterName, path, query, onMessage)).rejects.toThrow(
        'Connection failure'
      );

      // Failed attempt must not leave listeners registered
      expect(WebSocketManager.listeners.get(key)?.size ?? 0).toBe(0);

      // Subsequent subscription must succeed and send REQUEST without seeing phantom listeners
      connectSpy.mockRestore();
      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;

      const msg = JSON.parse((await mockServer.nextMessage) as string);
      expect(msg.type).toBe('REQUEST');
      expect(msg.path).toBe(path);
    });

    it('should reopen stream and send REQUEST when resubscribing after COMPLETE', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const key = WebSocketManager.createKey(clusterName, path, query);

      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      await mockServer.connected;
      await mockServer.nextMessage; // initial REQUEST

      // Backend terminates the stream with COMPLETE
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query,
          type: 'COMPLETE',
        })
      );

      await vi.waitFor(() => {
        expect(WebSocketManager.completedPaths.has(key)).toBe(true);
      });

      // Replacement subscription attaches under the same key
      const secondListener = vi.fn();
      await WebSocketManager.subscribe(clusterName, path, query, secondListener);

      // Reopening sends REQUEST and clears completedPaths
      const restartMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(restartMsg.type).toBe('REQUEST');
      expect(WebSocketManager.completedPaths.has(key)).toBe(false);
    });

    it('should send CLOSE before REQUEST when refetching after COMPLETE followed by DATA', async () => {
      const path = '/api/v1/pods';
      const query1 = 'watch=1&resourceVersion=1';
      const query2 = 'watch=1&resourceVersion=2';

      await WebSocketManager.subscribe(clusterName, path, query1, onMessage);
      await mockServer.connected;
      await mockServer.nextMessage; // initial REQUEST

      // Backend sends COMPLETE before a new-version DATA frame (stream stays live)
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: query1,
          type: 'COMPLETE',
        })
      );
      await mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: query1,
          type: 'DATA',
          data: JSON.stringify({
            type: 'ADDED',
            object: { metadata: { name: 'pod-1', resourceVersion: '10' } },
          }),
        })
      );

      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledTimes(1);
      });

      // Refetch with a new resourceVersion must still CLOSE the live backend stream first
      await WebSocketManager.subscribe(clusterName, path, query2, onMessage);

      const closeMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(closeMsg.type).toBe('CLOSE');
      const requestMsg = JSON.parse((await mockServer.nextMessage) as string);
      expect(requestMsg.type).toBe('REQUEST');
      expect(requestMsg.query).toBe(query2);
    });

    it('should open the stream for a surviving subscriber if the first subscriber unmounts during handshake', async () => {
      const path = '/api/v1/pods';
      const query = 'watch=1&resourceVersion=1';
      const key = WebSocketManager.createKey(clusterName, path, query);

      const resolvers: ((socket: WebSocket) => void)[] = [];
      const connectSpy = vi.spyOn(WebSocketManager, 'connect').mockImplementation(
        () =>
          new Promise<WebSocket>(resolve => {
            resolvers.push(resolve);
          })
      );

      const sentMessages: any[] = [];
      const fakeSocket = {
        readyState: WebSocket.OPEN,
        send: (msg: string) => sentMessages.push(JSON.parse(msg)),
      } as unknown as WebSocket;

      const listenerA = vi.fn();
      const listenerB = vi.fn();

      const subAPromise = WebSocketManager.subscribe(clusterName, path, query, listenerA);
      const subBPromise = WebSocketManager.subscribe(clusterName, path, query, listenerB);

      // First subscriber unmounts before the handshake completes
      WebSocketManager.unsubscribe(key, clusterName, path, query, listenerA);

      resolvers.forEach(resolve => resolve(fakeSocket));
      await subAPromise;
      await subBPromise;

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe('REQUEST');

      connectSpy.mockRestore();
    });
  });
});
