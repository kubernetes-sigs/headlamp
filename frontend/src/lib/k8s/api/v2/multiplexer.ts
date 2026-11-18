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
import { getHeadlampWebSocketProtocol } from '../../../../helpers/getHeadlampAPIHeaders';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { getBaseWsUrl } from './webSocket';

const MULTIPLEXER_PROTOCOL = 'headlamp.multiplexer.k8s.io';
const MULTIPLEXER_WATCH_PROTOCOL = 'headlamp.multiplexer.v2.k8s.io';
const WATCH_REQUEST_TIMEOUT = 60_000;

/**
 * WebSocket manager to handle connections across the application.
 * Provides a singleton-like interface for managing WebSocket connections,
 * subscriptions, and message handling. Implements connection multiplexing
 * to optimize network usage.
 */
export const WebSocketManager = {
  /** Current WebSocket connection instance */
  socketMultiplexer: null as WebSocket | null,

  /** Flag to track if a connection attempt is in progress */
  connecting: false,
  connectionPromise: null as Promise<WebSocket> | null,
  connectionGeneration: 0,

  /** Flag to track if we're reconnecting after a disconnect */
  isReconnecting: false,

  /** Map of message handlers for each subscription path */
  listeners: new Map<string, Set<(data: any) => void>>(),

  /** Map of error handlers for each subscription path */
  errorListeners: new Map<string, Set<(err: Error) => void>>(),

  /** Set of paths that have received a COMPLETE message */
  completedPaths: new Set<string>(),

  /** Map of active WebSocket subscriptions with their details */
  activeSubscriptions: new Map<
    string,
    { clusterId: string; path: string; query: string; userId: string; generation: number }
  >(),

  /** Only known watch callers opt in; arbitrary/exec subscriptions never retry here. */
  retryableWatches: new Set<string>(),
  pendingWatchRetries: new Set<string>(),
  connectedRoutes: new Set<string>(),
  pendingWatchRequests: new Map<string, WebSocketMessage>(),
  inFlightWatchRequest: null as {
    key: string;
    requestId: string;
    socket: WebSocket;
    generation: number;
    message: WebSocketMessage;
  } | null,
  watchRequestTimeout: null as ReturnType<typeof setTimeout> | null,
  subscriptionSequence: 0,
  requestSequence: 0,
  overloadRecoveries: 0,

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

  /**
   * Establishes or returns an existing WebSocket connection.
   *
   * Concurrent subscribers share one connection promise, without polling timers.
   *
   * @returns Promise resolving to WebSocket connection
   */
  async connect(): Promise<WebSocket> {
    // Return existing connection if available
    if (this.socketMultiplexer?.readyState === WebSocket.OPEN) {
      return this.socketMultiplexer;
    }

    // Wait for existing connection attempt if in progress
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.socketMultiplexer) {
      this.handleWebSocketClose();
    }
    const generation = ++this.connectionGeneration;
    this.connecting = true;
    const wsUrl = `${getBaseWsUrl()}${MULTIPLEXER_ENDPOINT}`;

    const connection = new Promise<WebSocket>((resolve, reject) => {
      let socket: WebSocket;
      let opened = false;
      try {
        const backendTokenProtocol = getHeadlampWebSocketProtocol();
        const protocols = [MULTIPLEXER_WATCH_PROTOCOL, MULTIPLEXER_PROTOCOL];
        if (backendTokenProtocol) protocols.push(backendTokenProtocol);
        socket = new WebSocket(wsUrl, protocols);
      } catch (e) {
        this.connecting = false;
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }

      socket.onopen = () => {
        if (generation !== this.connectionGeneration) {
          socket.close();
          reject(new Error('WebSocket connection superseded'));
          return;
        }
        opened = true;
        this.socketMultiplexer = socket;
        this.connecting = false;

        // Only resubscribe if we're reconnecting after a disconnect
        if (this.isReconnecting) {
          this.resubscribeAll(socket);
        }
        this.isReconnecting = false;

        resolve(socket);
      };

      socket.onmessage = event => {
        if (generation === this.connectionGeneration) this.handleWebSocketMessage(event);
      };

      socket.onerror = event => {
        if (generation !== this.connectionGeneration) return;
        this.connecting = false;
        console.error('WebSocket error:', event);
        reject(new Error('WebSocket connection failed'));
      };

      socket.onclose = event => {
        if (!opened) reject(new Error('WebSocket closed before opening'));
        if (generation !== this.connectionGeneration) return;
        this.handleWebSocketClose(event);
      };
    });
    this.connectionPromise = connection;
    const clear = () => {
      if (this.connectionPromise === connection) this.connectionPromise = null;
    };
    void connection.then(clear, clear);
    return connection;
  },

  /**
   * Resubscribes all active subscriptions to a new socket
   * @param socket - WebSocket connection to subscribe to
   */
  resubscribeAll(socket: WebSocket): void {
    this.activeSubscriptions.forEach((subscription, key) => {
      if (!this.retryableWatches.has(key) || !this.listeners.has(key)) return;
      const { clusterId, path, query, userId } = subscription;
      const requestMsg: WebSocketMessage = {
        clusterId,
        path,
        query,
        userId: userId || '',
        type: 'REQUEST',
      };
      this.sendSubscriptionRequest(key, socket, requestMsg);
    });
  },

  /**
   * Subscribe to WebSocket updates for a specific resource
   * @param clusterId - Cluster identifier
   * @param path - API resource path
   * @param query - Query parameters
   * @param onMessage - Callback for handling incoming messages
   * @param onError - Callback for handling errors
   * @param options - Enables reconnect retries only for known watch subscriptions.
   * @returns Promise resolving to cleanup function
   */
  async subscribe(
    clusterId: string,
    path: string,
    query: string,
    onMessage: (data: any) => void,
    onError?: (err: Error) => void,
    options: { retryWatch?: boolean } = {}
  ): Promise<() => void> {
    const key = this.createKey(clusterId, path, query);
    const subscription = this.activeSubscriptions.get(key) ?? {
      clusterId,
      path,
      query,
      userId: getUserIdFromLocalStorage() || '',
      generation: ++this.subscriptionSequence,
    };
    const pendingUnsubscribe = this.pendingUnsubscribes.get(key);
    if (pendingUnsubscribe) {
      clearTimeout(pendingUnsubscribe);
      this.pendingUnsubscribes.delete(key);
    }
    const watch = new URLSearchParams(query).get('watch');
    if (options.retryWatch && (watch === 'true' || watch === '1')) {
      this.retryableWatches.add(key);
    }

    // Add to active subscriptions
    this.activeSubscriptions.set(key, subscription);

    // Add message listener
    const listeners = this.listeners.get(key) || new Set();
    listeners.add(onMessage);
    this.listeners.set(key, listeners);

    // Add error listener if provided
    if (onError) {
      const errListeners = this.errorListeners.get(key) || new Set();
      errListeners.add(onError);
      this.errorListeners.set(key, errListeners);
    }

    // Establish connection and send REQUEST
    const socket = await this.connect();
    if (this.retryableWatches.has(key) && this.connectedRoutes.has(key)) {
      return () => this.unsubscribe(key, clusterId, path, query, onMessage, onError);
    }
    const requestMsg: WebSocketMessage = {
      clusterId,
      path,
      query,
      userId: subscription.userId,
      type: 'REQUEST',
    };
    this.sendSubscriptionRequest(key, socket, requestMsg);

    // Return cleanup function
    return () => this.unsubscribe(key, clusterId, path, query, onMessage, onError);
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
   * @param onError - Error handler to remove from subscription
   */
  unsubscribe(
    key: string,
    clusterId: string,
    path: string,
    query: string,
    onMessage: (data: any) => void,
    onError?: (err: Error) => void
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
        this.retryableWatches.delete(key);
        this.pendingWatchRetries.delete(key);
        this.pendingWatchRequests.delete(key);

        // Delay unsubscription to handle rapid re-subscriptions
        // This prevents unnecessary WebSocket churn when a component quickly unmounts and remounts
        // For example: during route changes or component updates in React's strict mode
        const timeout = setTimeout(() => {
          // Only unsubscribe if there are still no listeners
          if (!this.listeners.has(key)) {
            const subscription = this.activeSubscriptions.get(key);
            this.activeSubscriptions.delete(key);
            this.completedPaths.delete(key);
            this.connectedRoutes.delete(key);

            if (subscription && this.socketMultiplexer?.readyState === WebSocket.OPEN) {
              const closeMsg: WebSocketMessage = {
                clusterId,
                path,
                query,
                userId: subscription.userId,
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

    // Remove the error listener
    if (onError) {
      const errListeners = this.errorListeners.get(key);
      if (errListeners) {
        errListeners.delete(onError);
        if (errListeners.size === 0) {
          this.errorListeners.delete(key);
        }
      }
    }
  },

  /**
   * Handles WebSocket connection close event
   * Sets up state for potential reconnection
   */
  handleWebSocketClose(event?: CloseEvent): void {
    this.connectionGeneration++;
    this.socketMultiplexer = null;
    this.connecting = false;
    this.connectionPromise = null;
    this.completedPaths.clear();
    this.connectedRoutes.clear();
    this.pendingWatchRetries.clear();
    this.pendingWatchRequests.clear();
    if (this.watchRequestTimeout) clearTimeout(this.watchRequestTimeout);
    this.watchRequestTimeout = null;
    this.inFlightWatchRequest = null;

    // Only log reconnecting if we have active subscriptions
    this.isReconnecting = this.activeSubscriptions.size > 0;
    if (event?.code === 1013) {
      const error = new Error('Multiplexer overloaded; watch recovery is required');
      console.error(error.message);
      this.notifyCloseErrors(
        [...this.errorListeners.keys()].filter(key => !this.retryableWatches.has(key)),
        error
      );
      if ([...this.retryableWatches].some(key => this.listeners.has(key))) {
        if (this.overloadRecoveries >= 3) {
          this.notifyCloseErrors(this.retryableWatches, error);
          return;
        }
        this.overloadRecoveries++;
        void this.connect().catch(error => {
          this.notifyCloseErrors(
            this.retryableWatches,
            error instanceof Error ? error : new Error(String(error))
          );
        });
      }
    }
  },

  /**
   * Handles incoming WebSocket messages
   * Processes different message types and notifies appropriate listeners
   * @param event - WebSocket message event
   */
  handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'ACK') {
        const request = this.inFlightWatchRequest;
        if (
          request &&
          request.requestId === data.requestId &&
          request.socket === this.socketMultiplexer
        ) {
          this.finishWatchRequest();
        }
        return;
      }
      if (!data.clusterId || !data.path) {
        return;
      }

      const key = this.createKey(data.clusterId, data.path, data.query || '');

      if (data.type === 'STATUS') {
        const status = data.data ? JSON.parse(data.data) : {};
        const query =
          this.socketMultiplexer?.protocol !== MULTIPLEXER_WATCH_PROTOCOL && !data.query
            ? undefined
            : data.query;
        const keys = this.statusKeys(data.clusterId, data.path, query);
        for (const route of keys) {
          if (status.state === 'connected' && this.activeSubscriptions.has(route)) {
            this.connectedRoutes.add(route);
            this.retryPendingWatch(route);
          } else {
            this.connectedRoutes.delete(route);
          }
        }
        return;
      }

      // Handle COMPLETE messages
      if (data.type === 'COMPLETE') {
        this.completedPaths.add(key);
        return;
      }

      // Handle ERROR messages from backend
      if (data.type === 'ERROR') {
        this.connectedRoutes.delete(key);
        let errorMessage = 'Unknown error';
        try {
          const parsedData = data.data ? JSON.parse(data.data) : {};
          errorMessage = parsedData.error || errorMessage;
          if (
            parsedData.code === 'subscription_reconnecting' &&
            this.retryableWatches.has(key) &&
            this.listeners.has(key)
          ) {
            this.pendingWatchRetries.add(key);
            // A pre-reconnect connected status is stale. Only the backend's
            // writer-ordered readiness acknowledgement permits an immediate retry.
            if (parsedData.retryReady === true) {
              this.connectedRoutes.add(key);
            } else {
              this.connectedRoutes.delete(key);
            }
            this.retryPendingWatch(key);
            return;
          }
        } catch (e) {
          errorMessage = data.data || errorMessage;
        }

        const subscription = this.activeSubscriptions.get(key);
        if (subscription) subscription.generation = ++this.subscriptionSequence;
        const errListeners = this.errorListeners.get(key);
        if (errListeners && errListeners.size > 0) {
          const errorObj = new Error(errorMessage);
          for (const errListener of errListeners) {
            try {
              errListener(errorObj);
            } catch (err) {
              console.error('Failed to process WebSocket error message:', err);
            }
          }
        } else {
          // Fallback to data listeners as a safety net for legacy/direct callers
          const update = {
            type: 'ERROR',
            object: {
              kind: 'Status',
              status: 'Failure',
              message: errorMessage,
              metadata: {
                uid: `${key}:ERROR:${errorMessage}`,
                resourceVersion: '0',
              },
            },
          };

          const listeners = this.listeners.get(key);
          if (listeners) {
            for (const listener of listeners) {
              try {
                listener(update);
              } catch (err) {
                console.error('Failed to process WebSocket error message:', err);
              }
            }
          }
        }
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

  statusKeys(clusterId: string, path: string, query?: string): string[] {
    if (query !== undefined) return [this.createKey(clusterId, path, query)];
    // Older backends omit the query from STATUS messages.
    return [...this.activeSubscriptions]
      .filter(
        ([, subscription]) => subscription.clusterId === clusterId && subscription.path === path
      )
      .map(([key]) => key);
  },

  retryPendingWatch(key: string): void {
    const socket = this.socketMultiplexer;
    if (
      socket?.readyState !== WebSocket.OPEN ||
      !this.connectedRoutes.has(key) ||
      !this.pendingWatchRetries.has(key)
    ) {
      return;
    }
    const subscription = this.activeSubscriptions.get(key);
    if (subscription && this.retryableWatches.has(key) && this.listeners.has(key)) {
      this.pendingWatchRetries.delete(key);
      this.completedPaths.delete(key);
      const { clusterId, path, query, userId } = subscription;
      this.sendSubscriptionRequest(key, socket, {
        clusterId,
        path,
        query,
        userId,
        type: 'REQUEST',
        reopen: true,
      });
    }
  },

  notifyCloseErrors(keys: Iterable<string>, error: Error): void {
    for (const key of keys) {
      for (const listener of this.errorListeners.get(key) || []) {
        try {
          listener(error);
        } catch (error) {
          console.error('Failed to process WebSocket close error:', error);
        }
      }
    }
  },

  sendSubscriptionRequest(key: string, socket: WebSocket, request: WebSocketMessage): void {
    if (!this.retryableWatches.has(key) || socket.protocol !== MULTIPLEXER_WATCH_PROTOCOL) {
      socket.send(JSON.stringify(request));
      return;
    }
    if (
      !request.reopen &&
      (this.pendingWatchRequests.has(key) ||
        (this.inFlightWatchRequest?.key === key &&
          this.inFlightWatchRequest.generation === this.activeSubscriptions.get(key)?.generation))
    )
      return;
    this.pendingWatchRequests.set(key, request);
    this.flushWatchRequests();
  },

  finishWatchRequest(): void {
    if (this.watchRequestTimeout) clearTimeout(this.watchRequestTimeout);
    this.watchRequestTimeout = null;
    this.inFlightWatchRequest = null;
    this.overloadRecoveries = 0;
    this.flushWatchRequests();
  },

  flushWatchRequests(): void {
    const socket = this.socketMultiplexer;
    if (socket?.readyState !== WebSocket.OPEN || this.inFlightWatchRequest) return;
    for (const [key, request] of this.pendingWatchRequests) {
      this.pendingWatchRequests.delete(key);
      const subscription = this.activeSubscriptions.get(key);
      if (!subscription || !this.retryableWatches.has(key) || !this.listeners.has(key)) continue;
      const requestId = String(++this.requestSequence);
      const generation = subscription.generation;
      this.inFlightWatchRequest = { key, requestId, socket, generation, message: request };
      const pacedRequest = { ...request, requestId };
      this.watchRequestTimeout = setTimeout(() => {
        if (this.inFlightWatchRequest?.requestId !== requestId) return;
        const error = new Error(
          'Multiplexer watch request timed out waiting for processing confirmation'
        );
        console.error(error.message);
        this.notifyCloseErrors(this.retryableWatches, error);
        socket.close();
      }, WATCH_REQUEST_TIMEOUT);
      socket.send(JSON.stringify(pacedRequest));
      return;
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
  retryWatch = false,
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
  /** Only known Kubernetes watches may opt into pacing and automatic recovery. */
  retryWatch?: boolean;
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
    let isCancelled = false;
    let subscriptionPath: string | undefined;
    let subscriptionQuery = '';

    const connectWebSocket = async () => {
      let stableOnError: ((err: Error) => void) | undefined;
      try {
        const parsedUrl = new URL(url, getBaseWsUrl());
        subscriptionPath = parsedUrl.pathname;
        subscriptionQuery = parsedUrl.search.slice(1);
        stableOnError = (err: Error) => {
          console.error('WebSocket error for', subscriptionPath, err);
          onError?.(err);
        };
        const unsubscribe = await WebSocketManager.subscribe(
          cluster,
          subscriptionPath,
          subscriptionQuery,
          stableOnMessage,
          stableOnError,
          { retryWatch }
        );
        if (isCancelled) {
          unsubscribe();
        } else {
          cleanup = unsubscribe;
        }
      } catch (err) {
        if (subscriptionPath) {
          const key = WebSocketManager.createKey(cluster, subscriptionPath, subscriptionQuery);
          WebSocketManager.unsubscribe(
            key,
            cluster,
            subscriptionPath,
            subscriptionQuery,
            stableOnMessage,
            stableOnError
          );
        }
        if (isCancelled) {
          return;
        }
        console.error('WebSocket connection failed:', err);
        onError?.(err as Error);
      }
    };

    connectWebSocket();

    return () => {
      isCancelled = true;
      if (cleanup) {
        cleanup();
      }
    };
  }, [url, enabled, cluster, stableOnMessage, onError, retryWatch]);
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
   * Client routing identifier, not an authenticated identity.
   * The socket handshake credentials authorize upstream requests.
   */
  userId: string;
  /** Explicitly replace a watch transport using this request's query. */
  reopen?: boolean;
  /** Opt into a processing ACK, used to pace list-watch requests. */
  requestId?: string;

  /**
   * Message type that indicates the purpose of the message:
   * - REQUEST: Client is requesting to start watching a resource
   * - CLOSE: Client wants to stop watching a resource
   * - COMPLETE: Server indicates the watch request has completed (e.g., due to timeout or error)
   */
  type: 'REQUEST' | 'CLOSE' | 'COMPLETE';
}
