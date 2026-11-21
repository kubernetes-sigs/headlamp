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
import * as discoveredRevisions from './discoveredConnectionRevisions';
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

function unversionedQuery(query = '') {
  return [query, '__headlamp_connection_revision=unversioned'].filter(Boolean).join('&');
}

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
        query: unversionedQuery(query),
        userId,
        type: 'REQUEST',
      });

      // Send a message from server
      const podData = { kind: 'Pod', metadata: { name: 'test-pod' } };
      const serverMessage = {
        clusterId: clusterName,
        path,
        query: unversionedQuery(query),
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
          query: unversionedQuery(sub.query),
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
          query: unversionedQuery(sub.query),
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
        query: unversionedQuery(query),
        type: 'COMPLETE',
      };

      await mockServer.send(JSON.stringify(completeMessage));

      // Verify the path is marked as completed
      const key = WebSocketManager.createKey(clusterName, path, unversionedQuery(query));
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
          query: unversionedQuery(query),
          userId,
          type: 'CLOSE',
        });
      });

      // Verify subscription is removed
      const key = WebSocketManager.createKey(clusterName, path, unversionedQuery(query));
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
    });

    it('does not register a subscription when connecting fails', async () => {
      // Close the server to simulate connection failure
      await mockServer.close();
      const path = '/api/v1/pods';
      const query = 'watch=true';
      const key = WebSocketManager.createKey(clusterName, path, unversionedQuery(query));

      // Attempt to subscribe should fail
      await expect(
        WebSocketManager.subscribe(clusterName, path, query, onMessage, vi.fn())
      ).rejects.toThrow('WebSocket connection failed');

      expect(WebSocketManager.socketMultiplexer).toBeNull();
      expect(WebSocketManager.connecting).toBe(false);
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
      expect(WebSocketManager.listeners.has(key)).toBe(false);
      expect(WebSocketManager.errorListeners.has(key)).toBe(false);
    });

    it('does not subscribe after a same-named cluster is replaced while opening', async () => {
      const revision = vi
        .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
        .mockReturnValue(undefined);
      const connection = Promise.withResolvers<WebSocket>();
      vi.spyOn(WebSocketManager, 'connect').mockReturnValue(connection.promise);
      const send = vi.fn();

      const subscription = WebSocketManager.subscribe(
        clusterName,
        '/api/v1/pods',
        'watch=1',
        onMessage
      );
      revision.mockReturnValue('replacement:1');
      connection.resolve({ send } as unknown as WebSocket);

      await expect(subscription).rejects.toMatchObject({ status: 409 });
      expect(send).not.toHaveBeenCalled();
      expect(WebSocketManager.activeSubscriptions.size).toBe(0);
    });

    it('does not replay or deliver an ordinary watch after a discovered connection replaces it', async () => {
      const revision = vi
        .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
        .mockReturnValue(undefined);
      const path = '/api/v1/pods';
      const query = 'watch=1';
      await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      revision.mockReturnValue('replacement:1');
      const send = vi.fn();

      mockServer.send(
        JSON.stringify({
          clusterId: clusterName,
          path,
          query: unversionedQuery(query),
          type: 'DATA',
          data: '{}',
        })
      );
      WebSocketManager.resubscribeAll({ send } as unknown as WebSocket);

      expect(onMessage).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('keeps listeners separate across local revisions of the same routing key', async () => {
      const revision = vi
        .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
        .mockReturnValue('same:1');
      const path = '/api/v1/pods';
      const query = 'watch=1';
      const original = vi.fn();
      const replacement = vi.fn();

      const closeOriginal = await WebSocketManager.subscribe(clusterName, path, query, original);
      const first = JSON.parse((await mockServer.nextMessage) as string);
      revision.mockReturnValue('same:2');
      await WebSocketManager.subscribe(clusterName, path, query, replacement);
      const second = JSON.parse((await mockServer.nextMessage) as string);
      expect(first.query).not.toBe(second.query);
      for (const [request, name] of [
        [first, 'original'],
        [second, 'replacement'],
      ] as const) {
        mockServer.send(
          JSON.stringify({ ...request, type: 'DATA', data: JSON.stringify({ name }) })
        );
      }

      expect(original).not.toHaveBeenCalled();
      expect(replacement).toHaveBeenCalledExactlyOnceWith({ name: 'replacement' });
      closeOriginal();
      const closed = JSON.parse((await mockServer.nextMessage) as string);
      expect(closed).toMatchObject({ type: 'CLOSE', query: first.query });
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
          query: unversionedQuery(query),
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
        const key = WebSocketManager.createKey(clusterName, path, unversionedQuery(query));
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
          query: unversionedQuery(),
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

    it('leaves no subscription when unmounted before connecting fails', async () => {
      const fullUrl = `${BASE_WS_URL}api/v1/pods`;
      const key = WebSocketManager.createKey(clusterName, '/api/v1/pods', unversionedQuery());
      let rejectConnect: (error: Error) => void = () => {};
      const connecting = new Promise<WebSocket>((_, reject) => {
        rejectConnect = reject;
      });
      const connect = vi.spyOn(WebSocketManager, 'connect').mockReturnValue(connecting);

      const { unmount } = renderHook(() =>
        useWebSocket({
          url: () => fullUrl,
          enabled: true,
          cluster: clusterName,
          onMessage,
          onError,
        })
      );

      await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
      expect(WebSocketManager.listeners.has(key)).toBe(false);

      unmount();
      rejectConnect(new Error('WebSocket connection failed'));

      await expect(connecting).rejects.toThrow('WebSocket connection failed');
      expect(WebSocketManager.listeners.has(key)).toBe(false);
      expect(WebSocketManager.errorListeners.has(key)).toBe(false);
      expect(WebSocketManager.activeSubscriptions.has(key)).toBe(false);
      expect(onError).not.toHaveBeenCalled();
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
        query: unversionedQuery(query),
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
          query: unversionedQuery(query),
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
          query: unversionedQuery(),
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
          query: unversionedQuery(query),
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
                unversionedQuery(query)
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
          query: unversionedQuery(query),
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
                unversionedQuery(query)
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
          query: unversionedQuery(query),
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
          query: unversionedQuery(),
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
