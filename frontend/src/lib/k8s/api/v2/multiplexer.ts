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
const DECIMAL_INTEGER_PATTERN = /^\d+$/;

function getQueryResourceVersion(query: string): string {
  if (!query) {
    return '';
  }
  return new URLSearchParams(query).get('resourceVersion') || '';
}

function isQueryResourceVersionOlder(a: string, b: string): boolean {
  if (!DECIMAL_INTEGER_PATTERN.test(a) || !DECIMAL_INTEGER_PATTERN.test(b)) {
    return false;
  }
  return BigInt(a) < BigInt(b);
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

  /** Retry count and timer for the shared transport itself */
  reconnectRetryCount: 0,
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,

  /** Map of message handlers for each subscription path */
  listeners: new Map<string, Set<(data: any) => void>>(),

  /** Map of error handlers for each subscription path */
  errorListeners: new Map<string, Set<(err: Error) => void>>(),

  /** Map of close handlers for each subscription path */
  closeListeners: new Map<string, Set<(requiresRelist?: boolean) => void>>(),

  /** Set of paths that have received a COMPLETE message */
  completedPaths: new Set<string>(),

  /** Map of active WebSocket subscriptions with their details */
  activeSubscriptions: new Map<
    string,
    { clusterId: string; path: string; query: string; requestQuery: string }
  >(),

  /** Intentional CLOSE acknowledgements still expected per canonical stream */
  pendingCloseAcks: new Map<string, Array<{ replay: boolean }>>(),

  /** Joining listeners that must wait for the superseded stream to close */
  replayGatedListeners: new Map<string, Set<(data: any) => void>>(),

  /** Request queries superseded by replay but potentially still in flight */
  supersededQueries: new Map<string, Set<string>>(),

  /** Set of subscription keys whose backend stream failed with an ERROR */
  failedStreams: new Set<string>(),

  /** Map to track aliases when subscription query updates its resourceVersion */
  keyAliases: new Map<string, string>(),

  /** Map to track pending unsubscribe operations for debouncing */
  pendingUnsubscribes: new Map<string, NodeJS.Timeout>(),

  /**
   * Updates the resourceVersion parameter in a query string, preserving all other parameters.
   */
  updateQueryResourceVersion(query: string, resourceVersion: string): string {
    const params = new URLSearchParams(query);
    if (!params.has('resourceVersion')) {
      return query;
    }
    params.set('resourceVersion', resourceVersion);
    return params.toString();
  },

  /**
   * Normalizes a query string by removing the resourceVersion parameter
   * and sorting parameters to produce a stable canonical query string.
   */
  getCanonicalQuery(query: string): string {
    if (!query) {
      return '';
    }
    const params = new URLSearchParams(query);
    const resourceVersion = params.get('resourceVersion');
    params.delete('resourceVersion');
    if (resourceVersion === null) {
      params.set('__headlamp_cursor', 'none');
    } else if (!/^\d+$/.test(resourceVersion)) {
      params.set('__headlamp_cursor', resourceVersion);
    }
    params.sort();
    return params.toString();
  },

  /**
   * Creates a unique canonical key for identifying WebSocket subscriptions.
   * Query parameters affecting watch semantics (labelSelector, fieldSelector, etc.)
   * are preserved, while the stream cursor (resourceVersion) is omitted.
   * @param clusterId - Cluster identifier
   * @param path - API resource path
   * @param query - Query parameters
   * @returns Canonical subscription key
   */
  createKey(clusterId: string, path: string, query: string): string {
    const canonicalQuery = this.getCanonicalQuery(query);
    return `${clusterId}:${path}:${canonicalQuery}`;
  },

  /**
   * Resolves an incoming message or stream-close target to its canonical
   * subscription key, falling back to exact requestQuery matching when
   * multiple active subscriptions share a canonical key on reconnect.
   */
  resolveIncomingKey(clusterId: string, path: string, query: string): string {
    const incomingKey = this.createKey(clusterId, path, query);
    const aliased = this.keyAliases.get(incomingKey);
    if (aliased) {
      return aliased;
    }

    if (query) {
      const incomingQuery = new URLSearchParams(query).toString();
      const directSub = this.activeSubscriptions.get(incomingKey);
      const directMatches =
        directSub &&
        (new URLSearchParams(directSub.requestQuery).toString() === incomingQuery ||
          this.supersededQueries.get(incomingKey)?.has(incomingQuery));

      if (!directMatches) {
        for (const [candidateKey, sub] of this.activeSubscriptions.entries()) {
          if (sub.clusterId !== clusterId || sub.path !== path) {
            continue;
          }
          if (
            new URLSearchParams(sub.requestQuery).toString() === incomingQuery ||
            this.supersededQueries.get(candidateKey)?.has(incomingQuery)
          ) {
            return candidateKey;
          }
        }
      }
    }

    return incomingKey;
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

        // Only resubscribe if we're reconnecting after a disconnect
        if (this.isReconnecting) {
          this.resubscribeAll(socket);
        }
        this.isReconnecting = false;
        this.reconnectRetryCount = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

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
    this.failedStreams.clear();
    this.activeSubscriptions.forEach((subscription, canonicalKey) => {
      const { clusterId, path, query } = subscription;
      const resubKey = this.createKey(clusterId, path, query);
      if (
        resubKey !== canonicalKey &&
        !this.activeSubscriptions.has(resubKey) &&
        !this.listeners.has(resubKey)
      ) {
        this.keyAliases.set(resubKey, canonicalKey);
      }
      const userId = getUserIdFromLocalStorage();
      const requestMsg: WebSocketMessage = {
        clusterId,
        path,
        query,
        userId: userId || '',
        type: 'REQUEST',
      };
      socket.send(JSON.stringify(requestMsg));
      subscription.requestQuery = query;
    });
  },

  /**
   * Subscribe to WebSocket updates for a specific resource
   * @param clusterId - Cluster identifier
   * @param path - API resource path
   * @param query - Query parameters
   * @param onMessage - Callback for handling incoming messages
   * @param onError - Callback for handling errors
   * @param onClose - Callback for handling stream close
   * @returns Promise resolving to cleanup function
   */
  async subscribe(
    clusterId: string,
    path: string,
    query: string,
    onMessage: (data: any) => void,
    onError?: (err: Error) => void,
    onClose?: (requiresRelist?: boolean) => void
  ): Promise<() => void> {
    const requestedKey = this.createKey(clusterId, path, query);
    const key = this.keyAliases.get(requestedKey) || requestedKey;

    // Clear any pending unsubscribe for this key
    const pendingTimeout = this.pendingUnsubscribes.get(key);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingUnsubscribes.delete(key);
    }

    const canonicalKey = key;
    const isFailed = this.failedStreams.has(key) || this.failedStreams.has(canonicalKey);
    const existingSub =
      this.activeSubscriptions.get(canonicalKey) || this.activeSubscriptions.get(key);
    const isAlreadyActive = Boolean(existingSub) && !isFailed;
    const joiningRV = getQueryResourceVersion(query);
    const activeRV = existingSub ? getQueryResourceVersion(existingSub.query) : '';
    const needsCatchUp =
      isAlreadyActive &&
      Boolean(joiningRV && activeRV && isQueryResourceVersionOlder(joiningRV, activeRV));
    const requiresRelist =
      isAlreadyActive &&
      (!/^\d+$/.test(joiningRV) || !/^\d+$/.test(activeRV)) &&
      joiningRV !== activeRV &&
      !needsCatchUp;
    const replayPending = Boolean(
      this.pendingCloseAcks.get(canonicalKey)?.some(pending => pending.replay)
    );
    if (needsCatchUp || replayPending) {
      const gatedListeners = this.replayGatedListeners.get(canonicalKey) || new Set();
      gatedListeners.add(onMessage);
      this.replayGatedListeners.set(canonicalKey, gatedListeners);
    }
    if (requiresRelist) {
      onClose?.(true);
    }

    // Track active subscription details if not already active
    if (!isAlreadyActive) {
      this.failedStreams.delete(key);
      this.failedStreams.delete(canonicalKey);
      this.activeSubscriptions.set(key, { clusterId, path, query, requestQuery: query });
    }

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

    // Add close listener if provided
    if (onClose) {
      const clsListeners = this.closeListeners.get(key) || new Set();
      clsListeners.add(onClose);
      this.closeListeners.set(key, clsListeners);
    }

    // Establish connection and send REQUEST if this stream wasn't already active
    // or if a joining subscriber starts from an older resourceVersion than the active stream.
    try {
      if (!isAlreadyActive || needsCatchUp) {
        const socket = await this.connect();
        const userId = getUserIdFromLocalStorage();
        let currentSub = existingSub;
        if (needsCatchUp) {
          currentSub =
            this.activeSubscriptions.get(canonicalKey) || this.activeSubscriptions.get(key);
          const currentRV = currentSub ? getQueryResourceVersion(currentSub.query) : '';
          if (
            !currentSub ||
            !joiningRV ||
            !currentRV ||
            !isQueryResourceVersionOlder(joiningRV, currentRV)
          ) {
            return () => this.unsubscribe(key, clusterId, path, query, onMessage, onError, onClose);
          }
        }
        if (needsCatchUp && currentSub) {
          const superseded = this.supersededQueries.get(canonicalKey) || new Set();
          superseded.add(new URLSearchParams(currentSub.requestQuery).toString());
          this.supersededQueries.set(canonicalKey, superseded);
          const pendingAcks = this.pendingCloseAcks.get(canonicalKey) || [];
          pendingAcks.push({ replay: true });
          this.pendingCloseAcks.set(canonicalKey, pendingAcks);
          socket.send(
            JSON.stringify({
              clusterId,
              path,
              query: currentSub.requestQuery,
              userId: userId || '',
              type: 'CLOSE',
            } satisfies WebSocketMessage)
          );
          currentSub.query = query;
          currentSub.requestQuery = query;
        }
        const requestMsg: WebSocketMessage = {
          clusterId,
          path,
          query,
          userId: userId || '',
          type: 'REQUEST',
        };
        socket.send(JSON.stringify(requestMsg));
      } else if (this.socketMultiplexer?.readyState !== WebSocket.OPEN) {
        await this.connect();
      }
    } catch (error) {
      const remaining = this.listeners.get(key);
      remaining?.delete(onMessage);
      if (remaining?.size === 0) {
        this.listeners.delete(key);
        this.activeSubscriptions.delete(key);
        this.failedStreams.delete(key);
        this.supersededQueries.delete(key);
        this.replayGatedListeners.delete(key);
      }
      this.errorListeners.get(key)?.delete(onError!);
      this.closeListeners.get(key)?.delete(onClose!);
      throw error;
    }

    // Return cleanup function
    return () => this.unsubscribe(key, clusterId, path, query, onMessage, onError, onClose);
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
    onError?: (err: Error) => void,
    onClose?: (requiresRelist?: boolean) => void
  ): void {
    const canonicalKey = this.keyAliases.get(key) || key;

    // Clear any pending unsubscribe for this key
    const pendingTimeout = this.pendingUnsubscribes.get(canonicalKey);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingUnsubscribes.delete(canonicalKey);
    }

    // Remove the listener
    const listeners = this.listeners.get(canonicalKey);
    if (listeners) {
      listeners.delete(onMessage);
      const gatedListeners = this.replayGatedListeners.get(canonicalKey);
      gatedListeners?.delete(onMessage);
      if (gatedListeners?.size === 0) {
        this.replayGatedListeners.delete(canonicalKey);
      }
      if (listeners.size === 0) {
        this.listeners.delete(canonicalKey);

        // Delay unsubscription to handle rapid re-subscriptions
        // This prevents unnecessary WebSocket churn when a component quickly unmounts and remounts
        // For example: during route changes or component updates in React's strict mode
        const timeout = setTimeout(() => {
          // Only unsubscribe if there are still no listeners
          if (!this.listeners.has(canonicalKey)) {
            const sub = this.activeSubscriptions.get(canonicalKey);
            const closeQuery = sub?.requestQuery || query;
            this.activeSubscriptions.delete(canonicalKey);
            this.failedStreams.delete(canonicalKey);
            this.completedPaths.delete(canonicalKey);
            this.supersededQueries.delete(canonicalKey);

            // Clean up any alias mappings pointing to this subscription key
            for (const [alias, target] of this.keyAliases.entries()) {
              if (target === canonicalKey || alias === canonicalKey) {
                this.keyAliases.delete(alias);
              }
            }

            if (sub && this.socketMultiplexer?.readyState === WebSocket.OPEN) {
              const userId = getUserIdFromLocalStorage();
              const closeMsg: WebSocketMessage = {
                clusterId,
                path,
                query: closeQuery,
                userId: userId || '',
                type: 'CLOSE',
              };
              const pendingAcks = this.pendingCloseAcks.get(canonicalKey) || [];
              pendingAcks.push({ replay: false });
              this.pendingCloseAcks.set(canonicalKey, pendingAcks);
              this.socketMultiplexer.send(JSON.stringify(closeMsg));
            }
          }
          this.pendingUnsubscribes.delete(canonicalKey);
        }, 100); // 100ms debounce

        this.pendingUnsubscribes.set(canonicalKey, timeout);
      }
    }

    // Remove the error listener
    if (onError) {
      const errListeners = this.errorListeners.get(canonicalKey);
      if (errListeners) {
        errListeners.delete(onError);
        if (errListeners.size === 0) {
          this.errorListeners.delete(canonicalKey);
        }
      }
    }

    // Remove the close listener
    if (onClose) {
      const clsListeners = this.closeListeners.get(canonicalKey);
      if (clsListeners) {
        clsListeners.delete(onClose);
        if (clsListeners.size === 0) {
          this.closeListeners.delete(canonicalKey);
        }
      }
    }
  },

  /**
   * Handles per-stream closure from backend or upstream watch termination.
   * Cleans up subscription tracking so subsequent subscribers can revive the stream.
   * Notifies registered close listeners.
   */
  handleStreamClosed(clusterId: string, path: string, query?: string): void {
    const keysToClose = new Set<string>();
    if (query !== undefined && query !== '') {
      const key = this.createKey(clusterId, path, query);
      const canonicalKey = this.resolveIncomingKey(clusterId, path, query);
      keysToClose.add(key);
      keysToClose.add(canonicalKey);
    } else {
      const prefix = `${clusterId}:${path}:`;
      for (const k of this.activeSubscriptions.keys()) {
        if (k.startsWith(prefix)) {
          keysToClose.add(k);
        }
      }
      for (const k of this.listeners.keys()) {
        if (k.startsWith(prefix)) {
          keysToClose.add(k);
        }
      }
      for (const k of this.closeListeners.keys()) {
        if (k.startsWith(prefix)) {
          keysToClose.add(k);
        }
      }
    }

    for (const key of keysToClose) {
      this.failedStreams.add(key);

      const clsListeners = this.closeListeners.get(key);
      const hasCloseListeners = Boolean(clsListeners && clsListeners.size > 0);
      if (hasCloseListeners || !this.listeners.has(key)) {
        this.activeSubscriptions.delete(key);
      }

      if (clsListeners && clsListeners.size > 0) {
        const toCall = Array.from(clsListeners);
        for (const listener of toCall) {
          try {
            listener();
          } catch (err) {
            console.error('Failed to process WebSocket close listener:', err);
          }
        }
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
    this.pendingCloseAcks.clear();
    this.replayGatedListeners.clear();
    this.supersededQueries.clear();

    // Only log reconnecting if we have active subscriptions
    this.isReconnecting = this.activeSubscriptions.size > 0;
    this.scheduleReconnect();
  },

  scheduleReconnect(): void {
    if (this.activeSubscriptions.size > 0 && !this.reconnectTimer) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectRetryCount), 30000);
      this.reconnectRetryCount += 1;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.activeSubscriptions.size === 0) {
          return;
        }
        void this.connect().catch(() => {
          this.scheduleReconnect();
        });
      }, delay);
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

      const incomingKey = this.createKey(data.clusterId, data.path, data.query || '');
      const key = this.resolveIncomingKey(data.clusterId, data.path, data.query || '');
      const incomingQuery = new URLSearchParams(data.query || '').toString();
      const activeSubscription = this.activeSubscriptions.get(key);
      if (
        data.type !== 'STATUS' &&
        incomingQuery &&
        this.supersededQueries.get(key)?.has(incomingQuery)
      ) {
        return;
      }
      if (
        data.type !== 'STATUS' &&
        activeSubscription &&
        incomingQuery === new URLSearchParams(activeSubscription.requestQuery).toString()
      ) {
        this.supersededQueries.delete(key);
      }

      // Handle COMPLETE messages
      if (data.type === 'COMPLETE') {
        this.completedPaths.add(key);
        return;
      }

      // Handle STATUS messages from backend (e.g. state: "closed" or state: "error")
      if (data.type === 'STATUS') {
        let statusState = '';
        try {
          const parsedData = data.data ? JSON.parse(data.data) : {};
          statusState = parsedData.state || '';
        } catch (e) {
          // ignore
        }

        if (statusState === 'closed') {
          {
            const ackKey = data.query ? key : `${data.clusterId}:${data.path}:`;
            let acknowledgedIntentionalClose = false;
            for (const pendingKey of this.pendingCloseAcks.keys()) {
              if (data.query ? pendingKey === ackKey : pendingKey.startsWith(ackKey)) {
                const pendingAcks = this.pendingCloseAcks.get(pendingKey) || [];
                const ack = pendingAcks.shift();
                if (!ack) {
                  continue;
                }
                const replayComplete = ack.replay && !pendingAcks.some(pending => pending.replay);
                if (replayComplete) {
                  this.replayGatedListeners.delete(pendingKey);
                  const activeQuery = this.activeSubscriptions.get(pendingKey)?.requestQuery;
                  if (activeQuery) {
                    const superseded = this.supersededQueries.get(pendingKey);
                    superseded?.delete(new URLSearchParams(activeQuery).toString());
                    if (superseded?.size === 0) {
                      this.supersededQueries.delete(pendingKey);
                    }
                  }
                }
                if (pendingAcks.length === 0) {
                  this.pendingCloseAcks.delete(pendingKey);
                } else {
                  this.pendingCloseAcks.set(pendingKey, pendingAcks);
                }
                acknowledgedIntentionalClose = true;
                break;
              }
            }
            if (acknowledgedIntentionalClose) {
              return;
            }
          }
          const activeSubscription = this.activeSubscriptions.get(key);
          if (
            data.query &&
            activeSubscription &&
            new URLSearchParams(data.query).toString() !==
              new URLSearchParams(activeSubscription.requestQuery).toString()
          ) {
            return;
          }
          this.handleStreamClosed(data.clusterId, data.path, data.query);
          return;
        }
        return;
      }

      // Handle ERROR messages from backend
      if (data.type === 'ERROR') {
        this.failedStreams.add(key);
        if (incomingKey !== key) {
          this.failedStreams.add(incomingKey);
        }
        let errorMessage = 'Unknown error';
        try {
          const parsedData = data.data ? JSON.parse(data.data) : {};
          errorMessage = parsedData.error || errorMessage;
        } catch (e) {
          errorMessage = data.data || errorMessage;
        }

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
              if (this.replayGatedListeners.get(key)?.has(listener)) {
                continue;
              }
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

      const isErrorEvent = update && typeof update === 'object' && update.type === 'ERROR';

      if (isErrorEvent) {
        this.failedStreams.add(key);
        if (incomingKey !== key) {
          this.failedStreams.add(incomingKey);
        }
      } else {
        this.failedStreams.delete(key);
        if (incomingKey !== key) {
          this.failedStreams.delete(incomingKey);
        }
      }

      // Notify listeners if update is valid
      if (update && typeof update === 'object') {
        const listeners = this.listeners.get(key);
        if (listeners) {
          for (const listener of listeners) {
            if (this.replayGatedListeners.get(key)?.has(listener)) {
              continue;
            }
            try {
              listener(update);
            } catch (err) {
              console.error('Failed to process WebSocket message:', err);
            }
          }
        }

        // When a watch message updates resourceVersion, update activeSubscription
        // so that if a reconnect occurs, resubscribeAll uses the latest resourceVersion.
        const hasPendingReplay = Boolean(
          this.pendingCloseAcks.get(key)?.some(pending => pending.replay)
        );
        if (
          !hasPendingReplay &&
          update.type !== 'ERROR' &&
          update.object?.metadata?.resourceVersion &&
          /^\d+$/.test(update.object.metadata.resourceVersion)
        ) {
          const newRV = update.object.metadata.resourceVersion;
          const sub = this.activeSubscriptions.get(key);
          if (sub && sub.query) {
            const currentRV = getQueryResourceVersion(sub.query);
            if (!currentRV || !isQueryResourceVersionOlder(newRV, currentRV)) {
              const updatedQuery = this.updateQueryResourceVersion(sub.query, newRV);
              if (updatedQuery !== sub.query) {
                sub.query = updatedQuery;
              }
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
 * @param options.onClose - Callback function to handle stream close
 */
export function useWebSocket<T>({
  url: createUrl,
  enabled = true,
  cluster = '',
  onMessage,
  onError,
  onClose,
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
  /** Callback function to handle stream close */
  onClose?: (requiresRelist?: boolean) => void;
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
          ...(onClose ? [onClose] : [])
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
            stableOnError,
            onClose
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
  }, [url, enabled, cluster, stableOnMessage, onError, onClose]);
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
