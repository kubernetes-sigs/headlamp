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
};

/**
 * Keeps track of open WebSocket connections and active listeners
 */
const sockets = new Map<string, WebSocket | symbol>();
const listeners = new Map<string, Array<(update: any) => void>>();
/** Arguments of the last open attempt per connection, used to reconnect */
const lastOpenArgs = new Map<string, { url: string; options: OpenWebSocketOptions }>();
/** Pending reconnect timers per connection */
const reconnectTimers = new Map<string, NodeJS.Timeout>();
/** Consecutive failed reconnect attempts per connection, for backoff */
const reconnectAttempts = new Map<string, number>();

type OpenWebSocketOptions = {
  protocols?: string | string[];
  type: 'json' | 'binary';
  cluster?: string;
};

/**
 * Schedules a reconnect for a dropped legacy WebSocket connection, with
 * exponential backoff. Only reconnects while something still listens.
 */
function scheduleLegacyReconnect(connectionKey: string): void {
  if (reconnectTimers.has(connectionKey)) {
    return;
  }

  const attempts = reconnectAttempts.get(connectionKey) ?? 0;
  reconnectAttempts.set(connectionKey, attempts + 1);

  const delay = Math.min(30_000, 1000 * 2 ** attempts);
  const timer = setTimeout(() => {
    reconnectTimers.delete(connectionKey);

    // Everyone unsubscribed while we were waiting.
    if ((listeners.get(connectionKey)?.length ?? 0) === 0) {
      return;
    }

    const args = lastOpenArgs.get(connectionKey);
    if (!args || sockets.has(connectionKey)) {
      return;
    }

    // Mark as pending so concurrent opens don't duplicate, mirroring useWebSockets.
    const pendingSocket = Symbol('pendingWebSocket');
    sockets.set(connectionKey, pendingSocket);

    // Message dispatch fans out to the registered listeners; the per-call
    // onMessage is only a fallback, so a no-op is safe here.
    openWebSocket(args.url, { ...args.options, onMessage: () => {} })
      .then(socket => {
        // A newer connection took over this key, or everyone unsubscribed
        // while the socket was opening. Either way this one is unwanted, and
        // leaving the marker in place would hide the socket from the close
        // handler and from cleanup, leaking the backend watch.
        if (
          sockets.get(connectionKey) !== pendingSocket ||
          (listeners.get(connectionKey)?.length ?? 0) === 0
        ) {
          socket.close();

          if (sockets.get(connectionKey) === pendingSocket) {
            sockets.delete(connectionKey);
          }

          return;
        }

        // Replace the marker with the live socket so its own close handler can
        // evict it and schedule the next reconnect.
        sockets.set(connectionKey, socket);
      })
      .catch(err => {
        if (sockets.get(connectionKey) === pendingSocket) {
          sockets.delete(connectionKey);
        }

        console.error('WebSocket reconnect failed:', err);

        if ((listeners.get(connectionKey)?.length ?? 0) > 0) {
          scheduleLegacyReconnect(connectionKey);
        }
      });
  }, delay);

  reconnectTimers.set(connectionKey, timer);
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
  }: OpenWebSocketOptions & {
    /**
     * Message callback
     */
    onMessage: (data: T) => void;
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

  // Remember how this connection was opened so it can be re-established
  // after a drop (see the close handler below).
  lastOpenArgs.set(connectionKey, {
    url,
    options: { protocols: moreProtocols, type, cluster },
  });

  socket.addEventListener('open', () => {
    reconnectAttempts.delete(connectionKey);
  });

  socket.addEventListener('close', () => {
    // Evict the dead socket so it's never handed out again.
    if (sockets.get(connectionKey) === socket) {
      sockets.delete(connectionKey);
    }

    // Re-establish the watch while something still listens and no other
    // connection took over for this key in the meantime.
    if (!sockets.has(connectionKey) && (listeners.get(connectionKey)?.length ?? 0) > 0) {
      scheduleLegacyReconnect(connectionKey);
    }
  });

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
    function connect({ cluster, url, onMessage }: WebSocketConnectionRequest<T>) {
      const connectionKey = cluster + url;

      // Always register the current listener, even when reusing an existing socket.
      listeners.set(connectionKey, [...(listeners.get(connectionKey) ?? []), onMessage]);

      if (!sockets.has(connectionKey)) {
        // Mark socket as pending, so we don't open more than one
        const pendingSocket = Symbol('pendingWebSocket');
        sockets.set(connectionKey, pendingSocket);

        openWebSocket(url, { protocols, type, cluster, onMessage })
          .then(socket => {
            // A newer connection replaced this pending one while it was opening.
            if (sockets.get(connectionKey) !== pendingSocket) {
              socket.close();
              return;
            }

            // All listeners unsubscribed while the socket was opening.
            if ((listeners.get(connectionKey)?.length ?? 0) === 0) {
              socket.close();
              sockets.delete(connectionKey);
              return;
            }

            sockets.set(connectionKey, socket);
          })
          .catch(err => {
            if (sockets.get(connectionKey) === pendingSocket) {
              sockets.delete(connectionKey);
            }
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
            if (typeof maybeExisting !== 'symbol') {
              maybeExisting.close();
            }
            sockets.delete(connectionKey);
          }

          // Also cancel any pending reconnect and forget the connection.
          const pendingReconnect = reconnectTimers.get(connectionKey);
          if (pendingReconnect) {
            clearTimeout(pendingReconnect);
            reconnectTimers.delete(connectionKey);
          }
          reconnectAttempts.delete(connectionKey);
          lastOpenArgs.delete(connectionKey);
        }
      };
    }

    const disconnectCallbacks = connections.map(endpoint => connect(endpoint));

    return () => {
      disconnectCallbacks.forEach(fn => fn());
    };
  }, [enabled, type, connections, protocols]);
}
