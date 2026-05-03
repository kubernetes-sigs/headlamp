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
    WebSocketManager.socketMultiplexer = null;
    WebSocketManager.connecting = false;
    WebSocketManager.connectPromise = null;
    WebSocketManager.connectionAttemptId = 0;
    WebSocketManager.isReconnecting = false;
    WebSocketManager.listeners.clear();
    WebSocketManager.errorListeners.clear();
    WebSocketManager.completedPaths.clear();
    WebSocketManager.activeSubscriptions.clear();
    WebSocketManager.pendingUnsubscribes.forEach(clearTimeout);
    WebSocketManager.pendingUnsubscribes.clear();
  });

  describe('WebSocketManager', () => {
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

    it('should handle concurrent connection failures and clean up subscriptions', async () => {
      const mockClose = vi.fn();
      const MockWebSocket = vi.fn(() => ({
        readyState: 0, // CONNECTING
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        send: vi.fn(),
        close: mockClose,
        onopen: null as any,
        onerror: null as any,
        onmessage: null as any,
        onclose: null as any,
      })) as any;

      MockWebSocket.CONNECTING = 0;
      MockWebSocket.OPEN = 1;
      MockWebSocket.CLOSING = 2;
      MockWebSocket.CLOSED = 3;

      vi.stubGlobal('WebSocket', MockWebSocket);

      try {
        const path1 = '/api/v1/pods';
        const path2 = '/api/v1/services';

        const sub1 = WebSocketManager.subscribe(clusterName, path1, 'watch=true', onMessage);
        const sub2 = WebSocketManager.subscribe(clusterName, path2, 'watch=true', vi.fn());

        expect(MockWebSocket).toHaveBeenCalledTimes(1);

        const wsInstance = MockWebSocket.mock.results[0].value;
        wsInstance.onerror?.(new Event('error'));

        await expect(sub1).rejects.toThrow('WebSocket connection failed');
        await expect(sub2).rejects.toThrow('WebSocket connection failed');

        const key1 = WebSocketManager.createKey(clusterName, path1, 'watch=true');
        const key2 = WebSocketManager.createKey(clusterName, path2, 'watch=true');

        expect(WebSocketManager.activeSubscriptions.has(key1)).toBe(false);
        expect(WebSocketManager.activeSubscriptions.has(key2)).toBe(false);
        expect(WebSocketManager.listeners.has(key1)).toBe(false);
        expect(WebSocketManager.listeners.has(key2)).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
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
    it('should reject concurrent callers when shared connection attempt fails', async () => {
      const MockWebSocket = vi.fn(() => ({
        readyState: 0, // CONNECTING
        onopen: null as any,
        onclose: null as any,
        onerror: null as any,
        onmessage: null as any,
        send: vi.fn(),
        close: vi.fn(),
      })) as any;
      MockWebSocket.CONNECTING = 0;
      MockWebSocket.OPEN = 1;
      MockWebSocket.CLOSING = 2;
      MockWebSocket.CLOSED = 3;

      vi.stubGlobal('WebSocket', MockWebSocket);

      try {
        const firstPromise = WebSocketManager.connect();
        const concurrentPromise = WebSocketManager.connect();

        expect(MockWebSocket).toHaveBeenCalledTimes(1);
        expect(WebSocketManager.connectPromise).not.toBeNull();

        const wsInstance = MockWebSocket.mock.results[0].value;
        wsInstance.onerror?.(new Event('error'));

        await expect(firstPromise).rejects.toThrow('WebSocket connection failed');
        await expect(concurrentPromise).rejects.toThrow('WebSocket connection failed');
        expect(WebSocketManager.connectPromise).toBeNull();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should keep newer connection attempt state when old socket closes', async () => {
      const MockWebSocket = vi.fn(() => ({
        readyState: 0, // CONNECTING
        onopen: null as any,
        onclose: null as any,
        onerror: null as any,
        onmessage: null as any,
        send: vi.fn(),
        close: vi.fn(),
      })) as any;
      MockWebSocket.CONNECTING = 0;
      MockWebSocket.OPEN = 1;
      MockWebSocket.CLOSING = 2;
      MockWebSocket.CLOSED = 3;

      vi.stubGlobal('WebSocket', MockWebSocket);

      try {
        const firstPromise = WebSocketManager.connect();
        const firstSocket = MockWebSocket.mock.results[0].value;

        firstSocket.readyState = WebSocket.OPEN;
        firstSocket.onopen?.(new Event('open'));

        await expect(firstPromise).resolves.toBe(firstSocket);

        firstSocket.readyState = WebSocket.CLOSING;
        const secondPromise = WebSocketManager.connect();
        const secondAttemptPromise = WebSocketManager.connectPromise;
        const secondSocket = MockWebSocket.mock.results[1].value;

        expect(MockWebSocket).toHaveBeenCalledTimes(2);

        firstSocket.onclose?.();

        expect(WebSocketManager.connecting).toBe(true);
        expect(WebSocketManager.connectPromise).toBe(secondAttemptPromise);

        secondSocket.readyState = WebSocket.OPEN;
        secondSocket.onopen?.(new Event('open'));

        await expect(secondPromise).resolves.toBe(secondSocket);
        expect(WebSocketManager.socketMultiplexer).toBe(secondSocket);
        expect(WebSocketManager.connectPromise).toBeNull();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should resubscribe when replacing a non-open socket before old close fires', async () => {
      const MockWebSocket = vi.fn(() => ({
        readyState: 0, // CONNECTING
        onopen: null as any,
        onclose: null as any,
        onerror: null as any,
        onmessage: null as any,
        send: vi.fn(),
        close: vi.fn(),
      })) as any;
      MockWebSocket.CONNECTING = 0;
      MockWebSocket.OPEN = 1;
      MockWebSocket.CLOSING = 2;
      MockWebSocket.CLOSED = 3;

      vi.stubGlobal('WebSocket', MockWebSocket);

      try {
        const path = '/api/v1/pods';
        const query = 'watch=true';
        const requestMsg = {
          clusterId: clusterName,
          path,
          query,
          userId,
          type: 'REQUEST',
        };

        const subscription = WebSocketManager.subscribe(clusterName, path, query, onMessage);
        const firstSocket = MockWebSocket.mock.results[0].value;

        firstSocket.readyState = WebSocket.OPEN;
        firstSocket.onopen?.(new Event('open'));
        await subscription;

        expect(firstSocket.send).toHaveBeenCalledWith(JSON.stringify(requestMsg));
        firstSocket.send.mockClear();

        firstSocket.readyState = WebSocket.CLOSING;
        const reconnectPromise = WebSocketManager.connect();
        const secondSocket = MockWebSocket.mock.results[1].value;

        expect(WebSocketManager.isReconnecting).toBe(true);

        secondSocket.readyState = WebSocket.OPEN;
        secondSocket.onopen?.(new Event('open'));

        await expect(reconnectPromise).resolves.toBe(secondSocket);
        expect(secondSocket.send).toHaveBeenCalledWith(JSON.stringify(requestMsg));
        expect(WebSocketManager.isReconnecting).toBe(false);

        firstSocket.onclose?.();

        expect(WebSocketManager.socketMultiplexer).toBe(secondSocket);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should handle connection handshake timeout', async () => {
      vi.useFakeTimers();

      try {
        const mockClose = vi.fn();

        // Mock WebSocket to remain in CONNECTING state and never fire events
        const MockWebSocket = vi.fn(
          () =>
            ({
              readyState: 0, // CONNECTING
              onopen: null as any,
              onclose: null as any,
              onerror: null as any,
              onmessage: null as any,
              send: vi.fn(),
              close: mockClose,
            } as any)
        ) as any;
        MockWebSocket.CONNECTING = 0;
        MockWebSocket.OPEN = 1;
        MockWebSocket.CLOSING = 2;
        MockWebSocket.CLOSED = 3;

        vi.stubGlobal('WebSocket', MockWebSocket);

        const path = '/api/v1/pods';
        const query = 'watch=true';

        const subPromise = WebSocketManager.subscribe(clusterName, path, query, onMessage);
        const assertion = expect(subPromise).rejects.toThrow('WebSocket connection timed out');

        await vi.advanceTimersByTimeAsync(10000);

        await assertion;

        const wsInstance = MockWebSocket.mock.results[0].value;
        wsInstance.readyState = WebSocket.OPEN;
        wsInstance.onopen?.(new Event('open'));

        expect(mockClose).toHaveBeenCalledTimes(1);
        expect(WebSocketManager.socketMultiplexer).toBeNull();
        expect(WebSocketManager.connecting).toBe(false);
        expect(WebSocketManager.connectPromise).toBeNull();
      } finally {
        vi.unstubAllGlobals();
        vi.useRealTimers();
      }
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
  });
});
