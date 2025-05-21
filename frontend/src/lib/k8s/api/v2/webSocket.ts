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
import { findKubeconfigByClusterName, getUserIdFromLocalStorage } from '../../../../stateless';
import { getToken } from '../../../auth';
import { getCluster } from '../../../cluster';
import { BASE_HTTP_URL } from './fetch';
import { makeUrl } from './makeUrl';

// Constants for WebSocket connection
export const BASE_WS_URL = BASE_HTTP_URL.replace('http', 'ws');
export const MULTIPLEXER_ENDPOINT = 'wsMultiplexer';

/**
 * Multiplexer endpoint for WebSocket connections
 * This endpoint allows multiple subscriptions over a single connection
 */

/**
 * Message format for WebSocket communication between client and server.
 * Used to manage subscriptions to Kubernetes resource updates.
 */
interface WebSocketMessage {
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

  /** Authentication token */
  token?: string;
}

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

  /**
   * Establishes or returns an existing WebSocket connection.
   *
   * This implementation uses a polling approach to handle concurrent connection attempts.
   * While not ideal, it's a simple solution that works for most cases.
   *
   * Known limitations:
   * 1. Polls every 100ms which may not be optimal for performance
   * 2. No timeout - could theoretically run forever if connection never opens
   * 3. May miss state changes that happen between polls
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
      return new Promise(resolve => {
        const checkConnection = setInterval(() => {
          if (this.socketMultiplexer?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve(this.socketMultiplexer);
          }
        }, 100);
      });
    }

    this.connecting = true;
    const wsUrl = `${BASE_WS_URL}${MULTIPLEXER_ENDPOINT}`;

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        this.socketMultiplexer = socket;
        this.connecting = false;

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
        token: getToken(clusterId), // Include the current token to ensure it's fresh
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
      token: getToken(clusterId),
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
    this.connecting = false;
    this.completedPaths.clear();

    // Only log reconnecting if we have active subscriptions
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
 * Configuration for establishing a WebSocket connection to watch Kubernetes resources.
 * Used by the multiplexer to manage multiple WebSocket connections efficiently.
 *
 * @template T The expected type of data that will be received over the WebSocket
 */
export type WebSocketConnectionRequest<T> = {
  /**
   * The Kubernetes cluster identifier to connect to.
   * Used for routing WebSocket messages in multi-cluster environments.
   */
  cluster: string;

  /**
   * The WebSocket endpoint URL to connect to.
   * Should be a full URL including protocol and any query parameters.
   * Example: 'https://cluster.example.com/api/v1/pods/watch'
   */
  url: string;

  /**
   * Callback function that handles incoming messages from the WebSocket.
   * @param data The message payload, typed as T (e.g., K8s Pod, Service, etc.)
   */
  onMessage: (data: T) => void;
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
        const parsedUrl = new URL(url, BASE_WS_URL);
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
 * Keeps track of open WebSocket connections and active listeners
 */
const sockets = new Map<string, WebSocket | 'pending'>();
const listeners = new Map<string, Array<(update: any) => void>>();

/**
 * Create new WebSocket connection to the backend
 *
 * @param url - WebSocket URL
 * @param options - Connection options
 *
 * @returns WebSocket connection
 */
export async function openWebSocket<T>(
  url: string,
  {
    protocols: moreProtocols = [],
    type = 'binary',
    cluster = getCluster() ?? '',
    onMessage,
  }: {
    /**
     * Any additional protocols to include in WebSocket connection
     */
    protocols?: string | string[];
    /**
     *
     */
    type: 'json' | 'binary';
    /**
     * Cluster name
     */
    cluster?: string;
    /**
     * Message callback
     */
    onMessage: (data: T) => void;
  }
) {
  const path = [url];
  const protocols = ['base64.binary.k8s.io', ...(moreProtocols ?? [])];

  const token = getToken(cluster);
  if (token) {
    const encodedToken = btoa(token).replace(/=/g, '');
    protocols.push(`base64url.bearer.authorization.k8s.io.${encodedToken}`);
  }

  if (cluster) {
    path.unshift('clusters', cluster);

    try {
      const kubeconfig = await findKubeconfigByClusterName(cluster);

      if (kubeconfig !== null) {
        const userID = getUserIdFromLocalStorage();
        protocols.push(`base64url.headlamp.authorization.k8s.io.${userID}`);
      }
    } catch (error) {
      console.error('Error while finding kubeconfig:', error);
    }
  }

  const socket = new WebSocket(makeUrl([BASE_WS_URL, ...path], {}), protocols);
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (body: MessageEvent) => {
    const data = type === 'json' ? JSON.parse(body.data) : body.data;
    onMessage(data);
  });
  socket.addEventListener('error', error => {
    console.error('WebSocket error:', error);
  });

  return socket;
}

/**
 * Creates or joins mutiple existing WebSocket connections
 *
 * @param url - endpoint URL
 * @param options - WebSocket options
 */
export function useWebSockets<T>({
  connections,
  enabled = true,
  protocols,
  type = 'json',
}: {
  enabled?: boolean;
  /** Make sure that connections value is stable between renders */
  connections: Array<WebSocketConnectionRequest<T>>;
  /**
   * Any additional protocols to include in WebSocket connection
   * make sure that the value is stable between renders
   */
  protocols?: string | string[];
  /**
   * Type of websocket data
   */
  type?: 'json' | 'binary';
}) {
  useEffect(() => {
    if (!enabled) return;

    let isCurrent = true;

    /** Open a connection to websocket */
    function connect({ cluster, url, onMessage }: WebSocketConnectionRequest<T>) {
      const connectionKey = cluster + url;

      if (!sockets.has(connectionKey)) {
        // Add new listener for this URL
        listeners.set(connectionKey, [...(listeners.get(connectionKey) ?? []), onMessage]);

        // Mark socket as pending, so we don't open more than one
        sockets.set(connectionKey, 'pending');

        let ws: WebSocket | undefined;
        openWebSocket(url, { protocols, type, cluster, onMessage })
          .then(socket => {
            ws = socket;

            // Hook was unmounted while it was connecting to WebSocket
            // so we close the socket and clean up
            if (!isCurrent) {
              ws.close();
              sockets.delete(connectionKey);
              return;
            }

            sockets.set(connectionKey, ws);
          })
          .catch(err => {
            console.error(err);
          });
      }

      return () => {
        const connectionKey = cluster + url;

        // Clean up the listener
        const newListeners = listeners.get(connectionKey)?.filter(it => it !== onMessage) ?? [];
        listeners.set(connectionKey, newListeners);

        // No one is listening to the connection
        // so we can close it
        if (newListeners.length === 0) {
          const maybeExisting = sockets.get(connectionKey);
          if (maybeExisting) {
            if (maybeExisting !== 'pending') {
              maybeExisting.close();
            }
            sockets.delete(connectionKey);
          }
        }
      };
    }

    const disconnectCallbacks = connections.map(endpoint => connect(endpoint));

    return () => {
      isCurrent = false;
      disconnectCallbacks.forEach(fn => fn());
    };
  }, [enabled, type, connections, protocols]);
}
