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

import { useCallback, useEffect, useMemo } from 'react';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { getBaseWsUrl } from './webSocket';

/**
 * WebSocket manager to handle connections across the application.
 * Provides a singleton-like interface for managing WebSocket connections,
 * subscriptions, and message handling. Implements connection multiplexing
 * to optimize network usage.
 */
export const WebSocketManager = {
  /** Current WebSocket connection instance */
  socketMultiplexer: null as WebSocket | null,

  /** Promise for pending connection attempt - used to coordinate concurrent callers */
  connectionPromise: null as Promise<WebSocket> | null,

  /** Flag to track if we're reconnecting after a disconnect */
  isReconnecting: false,

  /** Map of message handlers for each subscription path */
  listeners: new Map<string, Set<(data: any) => void>>(),

  /** Set of paths that have received a COMPLETE message */
  completedPaths: new Set<string>(),

  /** Map of active WebSocket subscriptions with their details */
  activeSubscriptions: new Map<string, { clusterId: string; path: string; query: string }>(),

  /** Map to track pending unsubscribe operations for debouncing */
  pendingUnsubscribes: new Map<string, NodeJS.Timeout>(),

  /**
   * Creates a unique key for identifying WebSocket subscriptions
   * @param clusterId - Cluster identifier
   * @param path - API resource path
   * @param query - Query parameters
   * @returns Unique subscription key
   */
  createKey(clusterId: string, path: string, query: string): string {
    return `${clusterId}:${path}:${query}`;
  },

  /** Connection timeout in milliseconds */
  connectionTimeout: 30000,

  /**
   * Establishes or returns an existing WebSocket connection.
   *
   * This implementation uses Promise caching to handle concurrent connection attempts.
   * All concurrent callers receive the same Promise, which resolves when the connection
   * is established or rejects on failure/timeout.
   *
   * The Promise is automatically cleared in .finally(), ensuring that:
   * 1. Successful connections allow the socket to be reused
   * 2. Failed connections allow retry attempts
   * 3. No manual flag management is needed
   *
   * @returns Promise resolving to WebSocket connection
   */
  async connect(): Promise<WebSocket> {
    // Return existing open connection
    if (this.socketMultiplexer?.readyState === WebSocket.OPEN) {
      return this.socketMultiplexer;
    }

    // Return pending connection promise if one exists
    // All concurrent callers will share this same promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Create new connection and store the promise
    // The .finally() ensures cleanup happens regardless of success/failure
    this.connectionPromise = this.createConnection().finally(() => {
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  },

  /**
   * Creates a new WebSocket connection with timeout handling.
   *
   * @returns Promise resolving to WebSocket connection
   */
  createConnection(): Promise<WebSocket> {
    const wsUrl = `${getBaseWsUrl()}${MULTIPLEXER_ENDPOINT}`;

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);

      // Set up timeout to reject if connection takes too long
      const timeoutId = setTimeout(() => {
        socket.close();
        reject(new Error('WebSocket connection timeout'));
      }, this.connectionTimeout);

      socket.onopen = () => {
        clearTimeout(timeoutId);
        this.socketMultiplexer = socket;

        // Only resubscribe if we're reconnecting after a disconnect
        if (this.isReconnecting) {
          this.resubscribeAll(socket);
        }
        this.isReconnecting = false;

        resolve(socket);
      };

      socket.onmessage = this.handleWebSocketMessage.bind(this);

      socket.onerror = event => {
        clearTimeout(timeoutId);
        console.error('WebSocket error:', event);
        reject(new Error('WebSocket connection failed'));
      };

      socket.onclose = () => {
        clearTimeout(timeoutId);
        this.handleWebSocketClose();
      };
    });
  },

  /**
   * Resubscribes all active subscriptions to a new socket
   * @param socket - WebSocket connection to subscribe to
   */
  resubscribeAll(socket: WebSocket): void {
    this.activeSubscriptions.forEach(({ clusterId, path, query }) => {
      const userId = getUserIdFromLocalStorage();
      const requestMsg: WebSocketMessage = {
        clusterId,
        path,
        query,
        userId: userId || '',
        type: 'REQUEST',
      };
      socket.send(JSON.stringify(requestMsg));
    });
  },

  /**
   * Subscribe to WebSocket updates for a specific resource
   * @param clusterId - Cluster identifier
   * @param path - API resource path
   * @param query - Query parameters
   * @param onMessage - Callback for handling incoming messages
   * @returns Promise resolving to cleanup function
   */
  async subscribe(
    clusterId: string,
    path: string,
    query: string,
    onMessage: (data: any) => void
  ): Promise<() => void> {
    const key = this.createKey(clusterId, path, query);

    // Add to active subscriptions
    this.activeSubscriptions.set(key, { clusterId, path, query });

    // Add message listener
    const listeners = this.listeners.get(key) || new Set();
    listeners.add(onMessage);
    this.listeners.set(key, listeners);

    // Establish connection and send REQUEST
    const socket = await this.connect();
    const userId = getUserIdFromLocalStorage();
    const requestMsg: WebSocketMessage = {
      clusterId,
      path,
      query,
      userId: userId || '',
      type: 'REQUEST',
    };
    socket.send(JSON.stringify(requestMsg));

    // Return cleanup function
    return () => this.unsubscribe(key, clusterId, path, query, onMessage);
  },

  /**
   * Unsubscribes from WebSocket updates with debouncing to prevent rapid subscribe/unsubscribe cycles.
   *
   * State Management:
   * - Manages pendingUnsubscribes: Map of timeouts for delayed unsubscription
   * - Manages listeners: Map of message handlers for each subscription
   * - Manages activeSubscriptions: Set of currently active WebSocket subscriptions
   * - Manages completedPaths: Set of paths that have completed their initial data fetch
   *
   * Debouncing Logic:
   * 1. Clears any pending unsubscribe timeout for the subscription
   * 2. Removes the message handler from listeners
   * 3. If no listeners remain, sets a timeout before actually unsubscribing
   * 4. Only sends CLOSE message if no new listeners are added during timeout
   *
   * @param key - Subscription key that uniquely identifies this subscription
   * @param clusterId - Cluster identifier for routing to correct cluster
   * @param path - API resource path being watched
   * @param query - Query parameters for filtering
   * @param onMessage - Message handler to remove from subscription
   */
  unsubscribe(
    key: string,
    clusterId: string,
    path: string,
    query: string,
    onMessage: (data: any) => void
  ): void {
    // Clear any pending unsubscribe for this key
    const pendingTimeout = this.pendingUnsubscribes.get(key);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingUnsubscribes.delete(key);
    }

    // Remove the listener
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.delete(onMessage);
      if (listeners.size === 0) {
        this.listeners.delete(key);

        // Delay unsubscription to handle rapid re-subscriptions
        // This prevents unnecessary WebSocket churn when a component quickly unmounts and remounts
        // For example: during route changes or component updates in React's strict mode
        const timeout = setTimeout(() => {
          // Only unsubscribe if there are still no listeners
          if (!this.listeners.has(key)) {
            this.activeSubscriptions.delete(key);
            this.completedPaths.delete(key);

            if (this.socketMultiplexer?.readyState === WebSocket.OPEN) {
              const userId = getUserIdFromLocalStorage();
              const closeMsg: WebSocketMessage = {
                clusterId,
                path,
                query,
                userId: userId || '',
                type: 'CLOSE',
              };
              this.socketMultiplexer.send(JSON.stringify(closeMsg));
            }
          }
          this.pendingUnsubscribes.delete(key);
        }, 100); // 100ms debounce

        this.pendingUnsubscribes.set(key, timeout);
      }
    }
  },

  /**
   * Handles WebSocket connection close event
   * Sets up state for potential reconnection
   */
  handleWebSocketClose(): void {
    this.socketMultiplexer = null;
    this.completedPaths.clear();

    // Only set reconnecting flag if we have active subscriptions
    this.isReconnecting = this.activeSubscriptions.size > 0;
  },

  /**
   * Handles incoming WebSocket messages
   * Processes different message types and notifies appropriate listeners
   * @param event - WebSocket message event
   */
  handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      if (!data.clusterId || !data.path) {
        return;
      }

      const key = this.createKey(data.clusterId, data.path, data.query || '');

      // Handle COMPLETE messages
      if (data.type === 'COMPLETE') {
        this.completedPaths.add(key);
        return;
      }

      // Parse and validate update data
      let update;
      try {
        update = data.data ? JSON.parse(data.data) : data;
      } catch (err) {
        console.error('Failed to parse update data:', err);
        return;
      }

      // Notify listeners if update is valid
      if (update && typeof update === 'object') {
        const listeners = this.listeners.get(key);
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener(update);
            } catch (err) {
              console.error('Failed to process WebSocket message:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to process WebSocket message:', err);
    }
  },
};

/**
 * React hook for WebSocket subscription to Kubernetes resources
 * @template T - Type of data expected from the WebSocket
 * @param options - Configuration options for the WebSocket connection
 * @param options.url - Function that returns the WebSocket URL to connect to
 * @param options.enabled - Whether the WebSocket connection should be active
 * @param options.cluster - The Kubernetes cluster ID to watch
 * @param options.onMessage - Callback function to handle incoming messages
 * @param options.onError - Callback function to handle connection errors
 */
export function useWebSocket<T>({
  url: createUrl,
  enabled = true,
  cluster = '',
  onMessage,
  onError,
}: {
  /** Function that returns the WebSocket URL to connect to */
  url: () => string;
  /** Whether the WebSocket connection should be active */
  enabled?: boolean;
  /** The Kubernetes cluster ID to watch */
  cluster?: string;
  /** Callback function to handle incoming messages */
  onMessage: (data: T) => void;
  /** Callback function to handle connection errors */
  onError?: (error: Error) => void;
}) {
  const url = useMemo(() => (enabled ? createUrl() : ''), [enabled, createUrl]);

  const stableOnMessage = useCallback(
    (rawData: any) => {
      try {
        let parsedData: T;
        try {
          parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        } catch (parseError) {
          console.error('Failed to parse WebSocket message:', parseError);
          onError?.(parseError as Error);
          return;
        }

        onMessage(parsedData);
      } catch (err) {
        console.error('Failed to process WebSocket message:', err);
        onError?.(err as Error);
      }
    },
    [onMessage, onError]
  );

  useEffect(() => {
    if (!enabled || !url) {
      return;
    }

    let cleanup: (() => void) | undefined;

    const connectWebSocket = async () => {
      try {
        const parsedUrl = new URL(url, getBaseWsUrl());
        cleanup = await WebSocketManager.subscribe(
          cluster,
          parsedUrl.pathname,
          parsedUrl.search.slice(1),
          stableOnMessage
        );
      } catch (err) {
        console.error('WebSocket connection failed:', err);
        onError?.(err as Error);
      }
    };

    connectWebSocket();

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [url, enabled, cluster, stableOnMessage, onError]);
}

/**
 * Multiplexer endpoint for WebSocket connections
 * This endpoint allows multiple subscriptions over a single connection
 */
export const MULTIPLEXER_ENDPOINT = 'wsMultiplexer';

/**
 * Message format for WebSocket communication between client and server.
 * Used to manage subscriptions to Kubernetes resource updates.
 */
export interface WebSocketMessage {
  /**
   * Cluster identifier used to route messages to the correct Kubernetes cluster.
   * This is particularly important in multi-cluster environments.
   */
  clusterId: string;

  /**
   * API resource path that identifies the Kubernetes resource being watched.
   * Example: '/api/v1/pods' or '/apis/apps/v1/deployments'
   */
  path: string;

  /**
   * Query parameters for filtering or modifying the watch request.
   * Example: 'labelSelector=app%3Dnginx&fieldSelector=status.phase%3DRunning'
   */
  query: string;

  /**
   * User identifier for authentication and authorization.
   * Used to ensure users only receive updates for resources they have access to.
   */
  userId: string;

  /**
   * Message type that indicates the purpose of the message:
   * - REQUEST: Client is requesting to start watching a resource
   * - CLOSE: Client wants to stop watching a resource
   * - COMPLETE: Server indicates the watch request has completed (e.g., due to timeout or error)
   */
  type: 'REQUEST' | 'CLOSE' | 'COMPLETE';
}
