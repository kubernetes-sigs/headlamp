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

const INITIAL_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const HEALTHY_CONNECTION_MS = 30000;

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
 * Connections with the same cluster and URL share an underlying socket.
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

  /** Watches share a socket only within the same cache entry. */
  cacheEntry?: object;

  /** Provides the current URL before opening or reconnecting a watch. */
  getWatchUrl?: (reconnecting: boolean) => Promise<string | null>;

  /** Runs when the server accepts this watch. */
  onOpen?: (url: string, event: Event) => void;

  /** Runs when the connection closes without being accepted. */
  onOpenFailure?: () => void;

  /** Runs when this watch loses its connection or its last subscriber. */
  onClose?: () => void;

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
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
type WebSocketListener = Pick<
  WebSocketConnectionRequest<any>,
  'onMessage' | 'getWatchUrl' | 'onOpen' | 'onOpenFailure' | 'onClose'
>;
const listeners = new Map<string, WebSocketListener[]>();
const cacheEntryIds = new WeakMap<object, number>();
let nextCacheEntryId = 0;

function notifyWatchListener(callback: () => void) {
  try {
    callback();
  } catch (error) {
    console.error('WebSocket listener error:', error);
  }
}

function connectionKeyFor(cluster: string, url: string, cacheEntry?: object) {
  let cacheEntryId = cacheEntry && cacheEntryIds.get(cacheEntry);
  if (cacheEntry && cacheEntryId === undefined) {
    cacheEntryId = ++nextCacheEntryId;
    cacheEntryIds.set(cacheEntry, cacheEntryId);
  }
  return JSON.stringify([cluster, url, cacheEntryId]);
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

    /** Open a connection to websocket */
    function connect({ cluster, url, cacheEntry, ...listener }: WebSocketConnectionRequest<T>) {
      const connectionKey = connectionKeyFor(cluster, url, cacheEntry);

      // Always register the current listener, even when reusing an existing socket.
      listeners.set(connectionKey, [...(listeners.get(connectionKey) ?? []), listener]);

      let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

      function retry() {
        if (!listeners.get(connectionKey)?.some(listener => listener.getWatchUrl)) {
          sockets.delete(connectionKey);
          return;
        }

        const reservation = Symbol('reconnectingWebSocket');
        sockets.set(connectionKey, reservation);
        const delay = reconnectDelay * (0.5 + Math.random() * 0.5);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        reconnectTimers.set(
          connectionKey,
          setTimeout(() => {
            reconnectTimers.delete(connectionKey);
            if (sockets.get(connectionKey) === reservation) void open(true);
          }, delay)
        );
      }

      async function open(reconnecting = false) {
        const pendingSocket = Symbol('pendingWebSocket');
        sockets.set(connectionKey, pendingSocket);

        try {
          let watchUrl: string | null = url;
          for (;;) {
            const watch = listeners.get(connectionKey)?.find(listener => listener.getWatchUrl);
            if (!watch?.getWatchUrl) break;
            try {
              watchUrl = await watch.getWatchUrl(reconnecting);
            } catch (error) {
              if (listeners.get(connectionKey)?.includes(watch)) throw error;
            }
            if (sockets.get(connectionKey) !== pendingSocket) return;
            if (listeners.get(connectionKey)?.includes(watch)) break;
            watchUrl = url;
          }
          if (watchUrl === null) {
            sockets.delete(connectionKey);
            return;
          }

          const socket = await openWebSocket<T>(watchUrl, {
            protocols,
            type,
            cluster,
            onMessage(update) {
              if (sockets.get(connectionKey) !== socket) return;
              listeners
                .get(connectionKey)
                ?.forEach(listener => notifyWatchListener(() => listener.onMessage(update)));
            },
          });

          if (sockets.get(connectionKey) !== pendingSocket) {
            socket.close();
            return;
          }

          sockets.set(connectionKey, socket);
          let openedAt: number | undefined;
          socket.addEventListener('open', event => {
            if (sockets.get(connectionKey) !== socket) return;
            openedAt = Date.now();
            listeners
              .get(connectionKey)
              ?.forEach(listener => notifyWatchListener(() => listener.onOpen?.(watchUrl, event)));
          });
          socket.addEventListener('close', () => {
            if (sockets.get(connectionKey) !== socket) return;
            if (openedAt !== undefined && Date.now() - openedAt >= HEALTHY_CONNECTION_MS) {
              reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            }
            retry();
            listeners.get(connectionKey)?.forEach(listener => {
              if (openedAt === undefined) notifyWatchListener(() => listener.onOpenFailure?.());
              notifyWatchListener(() => listener.onClose?.());
            });
          });
        } catch (error) {
          if (sockets.get(connectionKey) !== pendingSocket) return;
          retry();
          console.error(error);
        }
      }

      if (!sockets.has(connectionKey)) void open();

      return () => {
        const newListeners = listeners.get(connectionKey)?.filter(it => it !== listener) ?? [];
        if (newListeners.length > 0) {
          listeners.set(connectionKey, newListeners);
          return;
        }

        const socket = sockets.get(connectionKey);
        listeners.delete(connectionKey);
        sockets.delete(connectionKey);
        clearTimeout(reconnectTimers.get(connectionKey));
        reconnectTimers.delete(connectionKey);
        if (socket && typeof socket !== 'symbol') {
          socket.close();
          notifyWatchListener(() => listener.onClose?.());
        }
      };
    }

    const disconnectCallbacks = connections.map(endpoint => connect(endpoint));

    return () => {
      disconnectCallbacks.forEach(fn => fn());
    };
  }, [enabled, type, connections, protocols]);
}
