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
   * Optional callback function that handles WebSocket error events.
   */
  onError?: (error: any) => void;

  /**
   * Optional callback function called when the WebSocket closes unexpectedly.
   */
  onClose?: (event?: CloseEvent) => void;
};

/**
 * Keeps track of open WebSocket connections and active listeners
 */
const sockets = new Map<string, WebSocket | symbol>();
const listeners = new Map<string, Array<(update: any) => void>>();
const closeListeners = new Map<string, Array<(event?: CloseEvent) => void>>();
const errorListeners = new Map<string, Array<(error: any) => void>>();
const intentionalCloses = new WeakSet<WebSocket>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const handshakeFailureCounts = new Map<string, number>();

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
    onError,
    onClose,
    onOpen,
    onHandshakeFailure,
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
     * Error callback
     */
    onError?: (error: any) => void;
    /**
     * Close callback
     */
    onClose?: (event?: CloseEvent) => void;
    /**
     * Open callback invoked when connection successfully opens
     */
    onOpen?: () => void;
    /**
     * Handshake failure callback invoked when connection closes before open event
     */
    onHandshakeFailure?: () => void;
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
  let hasOpened = false;
  socket.addEventListener('open', () => {
    hasOpened = true;
    onOpen?.();
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
    const callbacks = errorListeners.get(connectionKey) ?? (onError ? [onError] : []);
    callbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('WebSocket error listener error:', err);
      }
    });
  });
  socket.addEventListener('close', (event: CloseEvent) => {
    if (sockets.get(connectionKey) === socket) {
      sockets.delete(connectionKey);
    }
    if (intentionalCloses.has(socket)) {
      intentionalCloses.delete(socket);
      return;
    }
    if (!hasOpened) {
      onHandshakeFailure?.();
      return;
    }
    const callbacks = closeListeners.get(connectionKey) ?? (onClose ? [onClose] : []);
    callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (err) {
        console.error('WebSocket close listener error:', err);
      }
    });
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
    function startConnection(endpoint: WebSocketConnectionRequest<T>) {
      const { cluster, url, onMessage, onError, onClose } = endpoint;
      const connectionKey = cluster + url;

      if (sockets.has(connectionKey)) {
        return;
      }

      const existingTimer = retryTimers.get(connectionKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        retryTimers.delete(connectionKey);
      }

      const pendingSocket = Symbol('pendingWebSocket');
      sockets.set(connectionKey, pendingSocket);

      const scheduleRetry = () => {
        if (sockets.get(connectionKey) === pendingSocket) {
          sockets.delete(connectionKey);
        }
        if ((listeners.get(connectionKey)?.length ?? 0) === 0) {
          return;
        }
        if (retryTimers.has(connectionKey)) {
          return;
        }
        const count = (handshakeFailureCounts.get(connectionKey) ?? 0) + 1;
        handshakeFailureCounts.set(connectionKey, count);

        // If handshake fails repeatedly, notify close listeners so higher-level hooks
        // can detect the failure and recover (e.g. relist or refresh credentials)
        if (count >= 3) {
          handshakeFailureCounts.delete(connectionKey);
          const callbacks = closeListeners.get(connectionKey) ?? (onClose ? [onClose] : []);
          callbacks.forEach(callback => {
            try {
              callback(
                new CloseEvent('close', { code: 1002, reason: 'Handshake failed repeatedly' })
              );
            } catch (err) {
              console.error('WebSocket close listener error:', err);
            }
          });
          return;
        }

        const timer = setTimeout(() => {
          retryTimers.delete(connectionKey);
          if ((listeners.get(connectionKey)?.length ?? 0) > 0 && !sockets.has(connectionKey)) {
            startConnection(endpoint);
          }
        }, 5000);
        retryTimers.set(connectionKey, timer);
      };

      openWebSocket(url, {
        protocols,
        type,
        cluster,
        onMessage,
        onError,
        onClose,
        onOpen: () => {
          handshakeFailureCounts.delete(connectionKey);
        },
        onHandshakeFailure: () => {
          if (sockets.get(connectionKey) === pendingSocket) {
            sockets.delete(connectionKey);
          }
          scheduleRetry();
        },
      })
        .then(socket => {
          // A newer connection replaced this pending one while it was opening.
          if (sockets.get(connectionKey) !== pendingSocket) {
            intentionalCloses.add(socket);
            socket.close();
            return;
          }

          // The socket closed or is closing before registration completed.
          if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
            if (sockets.get(connectionKey) === pendingSocket) {
              sockets.delete(connectionKey);
            }
            if (!retryTimers.has(connectionKey)) {
              scheduleRetry();
            }
            return;
          }

          // All listeners unsubscribed while the socket was opening.
          if ((listeners.get(connectionKey)?.length ?? 0) === 0) {
            intentionalCloses.add(socket);
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
          scheduleRetry();
        });
    }

    function connect(endpoint: WebSocketConnectionRequest<T>) {
      const { cluster, url, onMessage, onError, onClose } = endpoint;
      const connectionKey = cluster + url;

      // Always register the current listener, even when reusing an existing socket.
      listeners.set(connectionKey, [...(listeners.get(connectionKey) ?? []), onMessage]);
      if (onError) {
        errorListeners.set(connectionKey, [...(errorListeners.get(connectionKey) ?? []), onError]);
      }
      if (onClose) {
        closeListeners.set(connectionKey, [...(closeListeners.get(connectionKey) ?? []), onClose]);
      }

      if (!sockets.has(connectionKey) && !retryTimers.has(connectionKey)) {
        startConnection(endpoint);
      }

      return () => {
        const connectionKey = cluster + url;

        // Clean up the listener
        const newListeners = listeners.get(connectionKey)?.filter(it => it !== onMessage) ?? [];
        listeners.set(connectionKey, newListeners);

        if (onError) {
          const newErrorListeners =
            errorListeners.get(connectionKey)?.filter(it => it !== onError) ?? [];
          errorListeners.set(connectionKey, newErrorListeners);
        }

        if (onClose) {
          const newCloseListeners =
            closeListeners.get(connectionKey)?.filter(it => it !== onClose) ?? [];
          closeListeners.set(connectionKey, newCloseListeners);
        }

        // No one is listening to the connection
        // so we can close it
        if (newListeners.length === 0) {
          const timer = retryTimers.get(connectionKey);
          if (timer) {
            clearTimeout(timer);
            retryTimers.delete(connectionKey);
          }
          const maybeExisting = sockets.get(connectionKey);
          if (maybeExisting) {
            if (typeof maybeExisting !== 'symbol') {
              intentionalCloses.add(maybeExisting);
              maybeExisting.close();
            }
            sockets.delete(connectionKey);
          }
          errorListeners.delete(connectionKey);
          closeListeners.delete(connectionKey);
          handshakeFailureCounts.delete(connectionKey);
        }
      };
    }

    const handleOnline = () => {
      connections.forEach(endpoint => {
        const connectionKey = endpoint.cluster + endpoint.url;
        if ((listeners.get(connectionKey)?.length ?? 0) > 0 && !sockets.has(connectionKey)) {
          const timer = retryTimers.get(connectionKey);
          if (timer) {
            clearTimeout(timer);
            retryTimers.delete(connectionKey);
          }
          startConnection(endpoint);
        }
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    const disconnectCallbacks = connections.map(endpoint => connect(endpoint));

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
      disconnectCallbacks.forEach(fn => fn());
    };
  }, [enabled, type, connections, protocols]);
}

/**
 * Resets all internal WebSocket state. Intended for unit tests.
 */
export function resetWebSocketsForTesting(): void {
  for (const timer of retryTimers.values()) {
    clearTimeout(timer);
  }
  retryTimers.clear();
  sockets.clear();
  listeners.clear();
  closeListeners.clear();
  errorListeners.clear();
  handshakeFailureCounts.clear();
}
