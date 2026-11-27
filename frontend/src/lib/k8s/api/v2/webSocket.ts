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

import { useEffect } from 'react';
import { getAppUrl } from '../../../../helpers/getAppUrl';
import { getHeadlampWebSocketProtocol } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { getCluster } from '../../../cluster';
import { makeUrl } from './makeUrl';

/**
 * Get the WebSocket base URL dynamically to support runtime port configuration
 */
export function getBaseWsUrl(): string {
  return getAppUrl().replace('http', 'ws');
}

// @deprecated BASE_WS_URL is deprecated for Electron apps with custom ports.
// It's evaluated at module load time, before window.headlampBackendPort is set.
// Use getBaseWsUrl() instead for runtime port configuration.
export const BASE_WS_URL = getBaseWsUrl();

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

  /**
   * Whether to automatically reconnect with backoff if the socket closes unexpectedly.
   */
  reconnectOnClose?: boolean;

  /**
   * Optional lazy URL resolver used when reconnecting after an unexpected close.
   */
  getReconnectUrl?: () => string;

  /**
   * Optional guard evaluated before scheduling or executing an automatic reconnect.
   */
  shouldReconnect?: () => boolean;
};

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const RECONNECT_STABILITY_WINDOW_MS = 5000;

/**
 * Keeps track of open WebSocket connections and active listeners
 */
const sockets = new Map<string, WebSocket | symbol>();
const listeners = new Map<string, Array<(update: any) => void>>();
const closeListeners = new Map<string, Array<() => void>>();

function removeMapCallback<C>(map: Map<string, Array<C>>, key: string, callback: C): number {
  const remaining = (map.get(key) ?? []).filter(it => it !== callback);
  if (remaining.length === 0) {
    map.delete(key);
  } else {
    map.set(key, remaining);
  }
  return remaining.length;
}

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
    onOpen,
    onClose,
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
    /**
     * Open callback
     */
    onOpen?: () => void;
    /**
     * Close callback
     */
    onClose?: (socket: WebSocket) => void;
  }
) {
  const connectionKey = cluster + url;
  const path = [url];
  const protocols = ['base64.binary.k8s.io', ...(moreProtocols ?? [])];
  const backendTokenProtocol = getHeadlampWebSocketProtocol();
  if (backendTokenProtocol !== null) {
    protocols.push(backendTokenProtocol);
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

  const socket = new WebSocket(makeUrl([getBaseWsUrl(), ...path], {}), protocols);
  socket.binaryType = 'arraybuffer';
  if (onOpen) {
    socket.addEventListener('open', () => {
      onOpen();
    });
  }
  socket.addEventListener('message', (body: MessageEvent) => {
    const data = type === 'json' ? JSON.parse(body.data) : body.data;
    const callbacks = listeners.get(connectionKey) ?? [onMessage];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('WebSocket listener error:', error);
      }
    });
  });
  socket.addEventListener('error', error => {
    console.error('WebSocket error:', error);
  });
  if (onClose) {
    socket.addEventListener('close', () => {
      onClose(socket);
    });
  }

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

    /** Open a connection to websocket */
    function connect({
      cluster,
      url,
      onMessage,
      reconnectOnClose = false,
      getReconnectUrl,
      shouldReconnect,
    }: WebSocketConnectionRequest<T>) {
      let currentKey = cluster + url;
      let disposed = false;
      let reconnectAttempts = 0;
      let openedAt: number | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

      const wrappedOnMessage = (data: T) => {
        reconnectAttempts = 0;
        onMessage(data);
      };

      const scheduleReconnect = () => {
        if (disposed || !reconnectOnClose || (shouldReconnect && !shouldReconnect())) {
          return;
        }

        if (openedAt !== null && Date.now() - openedAt >= RECONNECT_STABILITY_WINDOW_MS) {
          reconnectAttempts = 0;
        }
        openedAt = null;

        if (reconnectTimer !== null) {
          return;
        }

        const delay = Math.min(
          INITIAL_RECONNECT_DELAY_MS * 2 ** reconnectAttempts,
          MAX_RECONNECT_DELAY_MS
        );
        reconnectAttempts += 1;

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (disposed || (shouldReconnect && !shouldReconnect())) {
            return;
          }

          const nextUrl = getReconnectUrl ? getReconnectUrl() : url;
          openConnection(nextUrl);
        }, delay);
      };

      const notifyUnexpectedClose = (connectionKey: string) => {
        const callbacks = [...(closeListeners.get(connectionKey) ?? [])];
        callbacks.forEach(cb => cb());
      };

      function openConnection(targetUrl: string, registerListeners = true) {
        const nextKey = cluster + targetUrl;

        if (registerListeners && nextKey !== currentKey) {
          removeMapCallback(listeners, currentKey, wrappedOnMessage);
          removeMapCallback(closeListeners, currentKey, scheduleReconnect);
          currentKey = nextKey;
        }

        if (registerListeners) {
          listeners.set(currentKey, [...(listeners.get(currentKey) ?? []), wrappedOnMessage]);
          closeListeners.set(currentKey, [
            ...(closeListeners.get(currentKey) ?? []),
            scheduleReconnect,
          ]);
        }

        if (!sockets.has(currentKey)) {
          // Mark socket as pending, so we don't open more than one
          const pendingSocket = Symbol('pendingWebSocket');
          const keyForSocket = currentKey;
          let closedEarly = false;
          sockets.set(keyForSocket, pendingSocket);

          openWebSocket(targetUrl, {
            protocols,
            type,
            cluster,
            onMessage: wrappedOnMessage,
            onOpen: () => {
              if (sockets.get(keyForSocket) === pendingSocket || sockets.has(keyForSocket)) {
                openedAt = Date.now();
              }
            },
            onClose: socket => {
              closedEarly = true;
              const active = sockets.get(keyForSocket);
              if (active === socket || active === pendingSocket) {
                sockets.delete(keyForSocket);
                notifyUnexpectedClose(keyForSocket);
              }
            },
          })
            .then(socket => {
              // A newer connection replaced this pending one, or it closed while opening.
              if (closedEarly || sockets.get(keyForSocket) !== pendingSocket) {
                socket.close();
                return;
              }

              // All listeners unsubscribed while the socket was opening.
              if ((listeners.get(keyForSocket)?.length ?? 0) === 0) {
                socket.close();
                sockets.delete(keyForSocket);
                return;
              }

              sockets.set(keyForSocket, socket);
            })
            .catch(err => {
              if (sockets.get(keyForSocket) === pendingSocket) {
                sockets.delete(keyForSocket);
                notifyUnexpectedClose(keyForSocket);
              }
              console.error(err);
            });
        }
      }

      openConnection(url);

      return () => {
        disposed = true;
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        // Clean up the listeners
        const remainingCount = removeMapCallback(listeners, currentKey, wrappedOnMessage);
        removeMapCallback(closeListeners, currentKey, scheduleReconnect);

        // No one is listening to the connection
        // so we can close it
        if (remainingCount === 0) {
          const maybeExisting = sockets.get(currentKey);
          if (maybeExisting) {
            sockets.delete(currentKey);
            if (typeof maybeExisting !== 'symbol') {
              maybeExisting.close();
            }
          }
        }
      };
    }

    const disconnectCallbacks = connections.map(endpoint => connect(endpoint));

    return () => {
      disconnectCallbacks.forEach(fn => fn());
    };
  }, [enabled, type, connections, protocols]);
}
