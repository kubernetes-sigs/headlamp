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

  /** Flag to track if we're reconnecting after a disconnect */
  isReconnecting: false,

  /** Pending reconnect timer scheduled after a connection drop */
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,

  /** Number of consecutive failed reconnect attempts, for backoff */
  reconnectAttempts: 0,

  /** Pending retry timers for subscriptions that failed on an open socket */
  subscriptionRetryTimers: new Map<string, ReturnType<typeof setTimeout>>(),

  /** Number of consecutive failed retries per subscription key */
  subscriptionRetryAttempts: new Map<string, number>(),

  /** Map of message handlers for each subscription path */
  listeners: new Map<string, Set<(data: any) => void>>(),

  /** Map of error handlers for each subscription path */
  errorListeners: new Map<string, Set<(err: Error) => void>>(),

  /** Set of paths that have received a COMPLETE message */
  completedPaths: new Set<string>(),

  /** Map of active WebSocket subscriptions with their details */
  activeSubscriptions: new Map<string, { clusterId: string; path: string; query: string }>(),

  /** Map to track pending unsubscribe operations for debouncing */
  pendingUnsubscribes: new Map<string, ReturnType<typeof setTimeout>>(),

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
   * This implementation uses a polling approach to handle concurrent connection attempts.
   * While not ideal, it's a simple solution that works for most cases.
   *
   * Known limitations:
   * 1. Polls every 100ms which may not be optimal for performance
   * 2. May miss state changes that happen between polls
   * 3. Has no timeout while waiting on an in-progress connection attempt; callers
   *    will reject if that attempt fails and clears `this.connecting`, but can wait
   *    indefinitely if it never reaches open, error, or close
   *
   * A more robust solution would use event listeners and Promise caching,
   * but that adds complexity and potential race conditions to handle.
   * The current polling approach, while not perfect, is simple and mostly reliable.
   *
   * @returns Promise resolving to WebSocket connection
   */
  async connect(): Promise<WebSocket> {
    // Return existing connection if available
    if (this.socketMultiplexer?.readyState === WebSocket.OPEN) {
      return this.socketMultiplexer;
    }

    // Wait for existing connection attempt if in progress
    if (this.connecting) {
      return new Promise((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (this.socketMultiplexer?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve(this.socketMultiplexer!);
          } else if (!this.connecting) {
            clearInterval(checkConnection);
            reject(new Error('WebSocket connection failed'));
          }
        }, 100);
      });
    }

    this.connecting = true;
    const wsUrl = `${getBaseWsUrl()}${MULTIPLEXER_ENDPOINT}`;

    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        const backendTokenProtocol = getHeadlampWebSocketProtocol();
        socket = backendTokenProtocol
          ? new WebSocket(wsUrl, [MULTIPLEXER_PROTOCOL, backendTokenProtocol])
          : new WebSocket(wsUrl);
      } catch (e) {
        this.connecting = false;
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }

      socket.onopen = () => {
        this.socketMultiplexer = socket;
        this.connecting = false;
        this.reconnectAttempts = 0;

        // Only resubscribe if we're reconnecting after a disconnect
        if (this.isReconnecting) {
          this.resubscribeAll(socket);
        }
        this.isReconnecting = false;

        resolve(socket);
      };

      socket.onmessage = this.handleWebSocketMessage.bind(this);

      socket.onerror = event => {
        this.connecting = false;
        console.error('WebSocket error:', event);
        reject(new Error('WebSocket connection failed'));
      };

      socket.onclose = () => {
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
   * @param onError - Callback for handling errors
   * @returns Promise resolving to cleanup function
   */
  async subscribe(
    clusterId: string,
    path: string,
    query: string,
    onMessage: (data: any) => void,
    onError?: (err: Error) => void
  ): Promise<() => void> {
    const key = this.createKey(clusterId, path, query);

    // Clear any pending debounced unsubscribes for the same cluster and path
    // so that an in-flight delayed CLOSE does not close this replacement connection.
    const pathPrefix = `${clusterId}:${path}:`;
    for (const [pendingKey, pendingTimeout] of this.pendingUnsubscribes.entries()) {
      if (pendingKey === key || pendingKey.startsWith(pathPrefix)) {
        clearTimeout(pendingTimeout);
        this.pendingUnsubscribes.delete(pendingKey);
        if (!this.listeners.has(pendingKey)) {
          this.activeSubscriptions.delete(pendingKey);
          this.completedPaths.delete(pendingKey);
          this.subscriptionRetryAttempts.delete(pendingKey);

          // If the query changed, close the old upstream watch so that
          // stale events are not retained upstream.
          if (pendingKey !== key && this.socketMultiplexer?.readyState === WebSocket.OPEN) {
            const oldQuery = pendingKey.slice(pathPrefix.length);
            const userId = getUserIdFromLocalStorage();
            const closeMsg: WebSocketMessage = {
              clusterId,
              path,
              query: oldQuery,
              userId: userId || '',
              type: 'CLOSE',
            };
            this.socketMultiplexer.send(JSON.stringify(closeMsg));
          }
        }
      }
    }

    // Add to active subscriptions
    this.activeSubscriptions.set(key, { clusterId, path, query });

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

    try {
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
    } catch (err) {
      // Roll back registrations on initial failure so unmount does not leave orphan watches
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(onMessage);
        if (listeners.size === 0) {
          this.listeners.delete(key);
        }
      }
      if (onError) {
        const errListeners = this.errorListeners.get(key);
        if (errListeners) {
          errListeners.delete(onError);
          if (errListeners.size === 0) {
            this.errorListeners.delete(key);
          }
        }
      }
      if (!this.listeners.has(key)) {
        this.activeSubscriptions.delete(key);
        this.completedPaths.delete(key);
        const timeout = this.pendingUnsubscribes.get(key);
        if (timeout) {
          clearTimeout(timeout);
          this.pendingUnsubscribes.delete(key);
        }
        if (this.activeSubscriptions.size === 0 && this.reconnectTimer !== null) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
          this.isReconnecting = false;
          this.reconnectAttempts = 0;
        }
      }
      throw err;
    }

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

        const subRetryTimer = this.subscriptionRetryTimers.get(key);
        if (subRetryTimer) {
          clearTimeout(subRetryTimer);
          this.subscriptionRetryTimers.delete(key);
        }
        this.subscriptionRetryAttempts.delete(key);

        // Delay unsubscription to handle rapid re-subscriptions
        // This prevents unnecessary WebSocket churn when a component quickly unmounts and remounts
        // For example: during route changes or component updates in React's strict mode
        const timeout = setTimeout(() => {
          // Only unsubscribe if there are still no listeners
          if (!this.listeners.has(key)) {
            this.activeSubscriptions.delete(key);
            this.completedPaths.delete(key);
            this.subscriptionRetryAttempts.delete(key);

            if (this.activeSubscriptions.size === 0 && this.reconnectTimer !== null) {
              clearTimeout(this.reconnectTimer);
              this.reconnectTimer = null;
              this.isReconnecting = false;
              this.reconnectAttempts = 0;
            }

            // Do not send CLOSE if another subscription for the same cluster and path is active,
            // because the backend multiplexer identifies connections by clusterID:path:userID.
            const pathPrefix = `${clusterId}:${path}:`;
            const hasOtherActive = Array.from(this.activeSubscriptions.keys()).some(
              activeKey => activeKey !== key && activeKey.startsWith(pathPrefix)
            );

            if (!hasOtherActive && this.socketMultiplexer?.readyState === WebSocket.OPEN) {
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
   * Schedules a reconnect attempt after a connection drop, with exponential
   * backoff. Existing subscriptions are replayed once the connection is
   * re-established (see connect()'s onopen handler).
   */
  scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      // Everyone unsubscribed while we were waiting; nothing to restore.
      if (this.activeSubscriptions.size === 0) {
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        return;
      }

      this.connect().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  },

  /**
   * Schedules a retry for an active subscription that received an error on an
   * open multiplexer socket, using exponential backoff while listeners remain.
   */
  scheduleSubscriptionRetry(key: string): void {
    if (this.subscriptionRetryTimers.has(key)) {
      return;
    }

    if ((this.listeners.get(key)?.size ?? 0) === 0) {
      return;
    }

    const sub = this.activeSubscriptions.get(key);
    if (!sub) {
      return;
    }

    const attempts = this.subscriptionRetryAttempts.get(key) ?? 0;
    this.subscriptionRetryAttempts.set(key, attempts + 1);

    const delay = Math.min(30_000, 1000 * 2 ** attempts);

    const timer = setTimeout(() => {
      this.subscriptionRetryTimers.delete(key);

      if ((this.listeners.get(key)?.size ?? 0) === 0) {
        this.subscriptionRetryAttempts.delete(key);
        return;
      }

      if (this.socketMultiplexer?.readyState === WebSocket.OPEN) {
        const currentSub = this.activeSubscriptions.get(key);
        if (currentSub) {
          const userId = getUserIdFromLocalStorage();
          const requestMsg: WebSocketMessage = {
            clusterId: currentSub.clusterId,
            path: currentSub.path,
            query: currentSub.query,
            userId: userId || '',
            type: 'REQUEST',
          };
          this.socketMultiplexer.send(JSON.stringify(requestMsg));
        }
      }
    }, delay);

    this.subscriptionRetryTimers.set(key, timer);
  },

  /**
   * Handles WebSocket connection close event
   * Sets up state for potential reconnection
   */
  handleWebSocketClose(): void {
    this.socketMultiplexer = null;
    this.connecting = false;
    this.completedPaths.clear();

    // Clear open-socket retry timers because transport is closed;
    // resubscribeAll will replay active subscriptions on reconnect.
    this.subscriptionRetryTimers.forEach(clearTimeout);
    this.subscriptionRetryTimers.clear();
    this.subscriptionRetryAttempts.clear();

    // Only log reconnecting if we have active subscriptions
    this.isReconnecting = this.activeSubscriptions.size > 0;

    // Without this, mounted views would never receive updates again: the
    // socket is gone and resubscribeAll only runs when a NEW subscriber
    // triggers a successful connect().
    if (this.isReconnecting) {
      this.scheduleReconnect();
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
      if (!data.clusterId || !data.path) {
        return;
      }

      const key = this.createKey(data.clusterId, data.path, data.query || '');

      // Handle COMPLETE messages
      if (data.type === 'COMPLETE') {
        this.completedPaths.add(key);
        return;
      }

      // Handle ERROR messages from backend
      if (data.type === 'ERROR') {
        let errorMessage = 'Unknown error';
        let parsedData: any = null;
        try {
          parsedData = data.data ? JSON.parse(data.data) : {};
          errorMessage = parsedData.error || parsedData.message || errorMessage;
        } catch (e) {
          errorMessage = data.data || errorMessage;
        }

        const isExpired = isWatchExpiredError(parsedData) || isWatchExpiredError(errorMessage);

        const errListeners = this.errorListeners.get(key);
        if (errListeners && errListeners.size > 0) {
          const errorObj = new Error(errorMessage);
          const statusCode = parsedData?.statusCode || (isExpired ? 410 : undefined);
          if (statusCode) {
            (errorObj as any).status = statusCode;
            (errorObj as any).statusCode = statusCode;
          }
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
              ...(isExpired ? { code: 410, reason: 'Expired' } : {}),
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

        // Retry transient errors on open sockets with backoff while listeners remain.
        // Expired versions are not retried with the same version; the listener refetches a new snapshot.
        if (!isExpired && (this.listeners.get(key)?.size ?? 0) > 0) {
          this.scheduleSubscriptionRetry(key);
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

      // Clear subscription retry state on receiving data
      this.subscriptionRetryAttempts.delete(key);
      const subRetryTimer = this.subscriptionRetryTimers.get(key);
      if (subRetryTimer) {
        clearTimeout(subRetryTimer);
        this.subscriptionRetryTimers.delete(key);
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
          stableOnError
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

/**
 * Checks whether an incoming error or status object indicates that a Kubernetes
 * watch stream has expired (e.g. HTTP 410 Gone / too old resource version).
 */
export function isWatchExpiredError(err: any): boolean {
  if (!err) {
    return false;
  }
  // If this is a Kubernetes watch event wrapper, only ERROR events with Status objects can indicate watch expiry.
  if (err?.type && err.type !== 'ERROR') {
    return false;
  }
  if (err?.object?.kind && err.object.kind !== 'Status') {
    return false;
  }
  if (err?.kind && err.kind !== 'Status') {
    return false;
  }
  if (err === 410 || err?.status === 410 || err?.statusCode === 410 || err?.code === 410) {
    return true;
  }
  const target = err.object || err.status || err.error || err;
  if (
    target === 410 ||
    target?.code === 410 ||
    target?.status === 410 ||
    target?.statusCode === 410 ||
    target?.reason === 'Expired'
  ) {
    return true;
  }
  const msg =
    typeof err === 'string'
      ? err
      : typeof target === 'string'
      ? target
      : target?.message || err?.message || '';
  return (
    /\b410\b/i.test(msg) ||
    /resource\s*version\b.*(?:too\s+old|expired)|(?:too\s+old|expired).*resource\s*version\b/i.test(
      msg
    )
  );
}
