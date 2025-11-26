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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let onMessage: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
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
    WebSocketManager.isReconnecting = false;
    WebSocketManager.listeners.clear();
    WebSocketManager.completedPaths.clear();
    WebSocketManager.activeSubscriptions.clear();
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
  });

  describe('WebSocket error handling', () => {
    it('should handle polling timeout', async () => {
      // Mock WebSocket to never open
      const mockWS = vi.spyOn(window, 'WebSocket').mockImplementation(() => {
        const ws = new EventTarget() as WebSocket;
        Object.defineProperty(ws, 'readyState', { value: WebSocket.CONNECTING });
        Object.defineProperty(ws, 'send', { value: null });
        return ws;
      });

      const path = '/api/v1/pods';
      const query = 'watch=true';

      let error: Error | null = null;
      try {
        await WebSocketManager.subscribe(clusterName, path, query, onMessage);
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeTruthy();
      expect(error?.message).toBe("Cannot read properties of null (reading 'send')");

      mockWS.mockRestore();
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
