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

import { useEffect, useRef, useState } from 'react';
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

  /** Compute an updated URL when an established watch disconnects. */
  reconnectUrl?: () => string;
  /** Called when an opted-in watch opens. */
  onReady?: () => void;
  /** Called when an established socket closes unexpectedly. */
  onClose?: (event?: CloseEvent) => void;
  /** Called when a watch exhausts its retry attempts. */
  onError?: (error: Error) => void;
  /** Reconcile a fresh snapshot after the browser hides repeated handshake failures. */
  onRecoveryNeeded?: () => Promise<string | void>;
  /** Stable cache owner; isolates recovery and retains its budget across cursors. */
  recoveryOwner?: object;
  /** Retired snapshots cannot share a transport with a newer generation. */
  generation?: number;

  /**
   * Callback function that handles incoming messages from the WebSocket.
   * @param data The message payload, typed as T (e.g., K8s Pod, Service, etc.)
   */
  onMessage: (data: T) => void;
};

/**
 * Keeps track of open WebSocket connections and active listeners
 */
interface LegacyConnection {
  socket: WebSocket | symbol;
  timer?: ReturnType<typeof setTimeout>;
}

interface RecoveryBudget {
  id: number;
  /** Persists across cursor/generation changes; only a successful open resets it. */
  recoveries: number;
  error?: Error;
}

const sockets = new Map<string, LegacyConnection>();
const listeners = new Map<string, Set<WebSocketConnectionRequest<any>>>();
let recoveryBudgets = new WeakMap<object, RecoveryBudget>();
let recoverySequence = 0;
const MAX_SNAPSHOT_RECOVERIES = 3;

function recoveryBudget(owner: object): RecoveryBudget {
  let budget = recoveryBudgets.get(owner);
  if (!budget) {
    budget = { id: ++recoverySequence, recoveries: 0 };
    recoveryBudgets.set(owner, budget);
  }
  return budget;
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
    onHandshakeFailure,
    listenerKey,
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
    listenerKey?: string;
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onHandshakeFailure?: (event: CloseEvent) => void;
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
    if (listenerKey && sockets.get(listenerKey)?.socket !== socket) return;
    const data = type === 'json' ? JSON.parse(body.data) : body.data;
    const callbacks = listenerKey
      ? [...(listeners.get(listenerKey) ?? [])].map(listener => listener.onMessage)
      : [onMessage];
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
  let opened = false;
  socket.addEventListener('open', () => {
    opened = true;
    onOpen?.();
  });
  socket.addEventListener('close', event => {
    if (opened) onClose?.(event);
    else onHandshakeFailure?.(event);
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
  const activeConnections = useRef(
    new Map<string, { observer: WebSocketConnectionRequest<T>; disconnect: () => void }>()
  );
  const [credentialVersion, setCredentialVersion] = useState(0);
  useEffect(() => {
    const handleCredentialChange = (event: Event) => {
      const cluster = (event as CustomEvent<{ cluster?: string }>).detail?.cluster;

      let changed = false;
      for (const [key, connection] of activeConnections.current) {
        if (cluster && connection.observer.cluster !== cluster) continue;
        connection.disconnect();
        activeConnections.current.delete(key);
        changed = true;
      }
      if (changed) setCredentialVersion(version => version + 1);
    };
    window.addEventListener('headlamp-credentials-changed', handleCredentialChange);

    return () => window.removeEventListener('headlamp-credentials-changed', handleCredentialChange);
  }, []);
  useEffect(() => {
    const active = activeConnections.current;
    const keyFor = (request: WebSocketConnectionRequest<T>) => {
      const owner = request.recoveryOwner ?? request.onRecoveryNeeded;
      return JSON.stringify([
        request.cluster,
        request.url,
        owner ? recoveryBudget(owner).id : null,
        request.generation ?? 0,
        protocols,
        type,
      ]);
    };

    /** Open a connection to websocket */
    function connect(request: WebSocketConnectionRequest<T>) {
      const { cluster, url, onMessage } = request;
      const owner = request.recoveryOwner ?? request.onRecoveryNeeded;
      const budget = owner ? recoveryBudget(owner) : undefined;
      const connectionKey = keyFor(request);
      const observer = { ...request };
      const observers = listeners.get(connectionKey) ?? new Set();
      observers.add(observer);
      listeners.set(connectionKey, observers);
      const existing = sockets.get(connectionKey);
      const connection: LegacyConnection = existing ?? { socket: Symbol('pendingWebSocket') };
      let failures = 0;
      let onlineRetry: (() => void) | undefined;

      function current(socket: WebSocket | symbol) {
        return (
          sockets.get(connectionKey) === connection &&
          connection.socket === socket &&
          !!listeners.get(connectionKey)?.size
        );
      }

      function notifyError(error: Error) {
        if (budget) budget.error = error;
        for (const listener of listeners.get(connectionKey) ?? []) {
          try {
            listener.onError?.(error);
          } catch (error) {
            console.error('WebSocket error listener failed:', error);
          }
        }
      }

      function notifyClose(event: CloseEvent) {
        for (const listener of listeners.get(connectionKey) ?? []) {
          try {
            listener.onClose?.(event);
          } catch (error) {
            console.error('WebSocket close listener failed:', error);
          }
        }
      }

      function stop(error: Error) {
        console.error('Kubernetes watch recovery stopped:', error);
        sockets.delete(connectionKey);
        if (connection.timer) clearTimeout(connection.timer);
        notifyError(error);
      }

      function retry(socket: WebSocket | symbol, error: Error) {
        if (!current(socket)) return;
        if ((budget?.recoveries ?? 0) >= MAX_SNAPSHOT_RECOVERIES) {
          stop(
            new Error(
              `Kubernetes watch recovery exhausted after ${MAX_SNAPSHOT_RECOVERIES} snapshots: ${error.message}`
            )
          );
          return;
        }
        if (!observer.reconnectUrl || (failures >= 3 && !observer.onRecoveryNeeded)) {
          stop(error);
          return;
        }
        if (failures >= 3 && observer.onRecoveryNeeded) {
          const pendingRecovery = Symbol('recoveringWebSocket');
          connection.socket = pendingRecovery;
          if (budget) budget.recoveries++;
          notifyError(error);
          Promise.resolve()
            .then(() => {
              if (!current(pendingRecovery)) return;
              return observer.onRecoveryNeeded?.();
            })
            .then(nextUrl => {
              if (!current(pendingRecovery)) return;
              if (nextUrl) dial(nextUrl);
              else sockets.delete(connectionKey);
            })
            .catch(error => {
              if (!current(pendingRecovery)) return;
              console.error('Failed to recover Kubernetes watch:', error);
              stop(error instanceof Error ? error : new Error(String(error)));
            });
          return;
        }
        const delay = 1000 * 2 ** failures;
        failures++;
        connection.timer = setTimeout(() => {
          connection.timer = undefined;
          if (current(socket) && observer.reconnectUrl) dial(observer.reconnectUrl());
        }, delay);
      }

      function dial(dialUrl: string) {
        const pendingSocket = Symbol('pendingWebSocket');
        connection.socket = pendingSocket;
        sockets.set(connectionKey, connection);

        openWebSocket(dialUrl, {
          protocols,
          type,
          cluster,
          onMessage,
          listenerKey: connectionKey,
          onOpen: () => {
            if (!current(connection.socket)) return;
            failures = 0;
            if (onlineRetry) {
              window.removeEventListener('online', onlineRetry);
              onlineRetry = undefined;
            }
            if (budget) {
              budget.recoveries = 0;
              budget.error = undefined;
            }
            for (const listener of listeners.get(connectionKey) ?? []) {
              try {
                listener.onReady?.();
              } catch (error) {
                console.error('WebSocket readiness listener failed:', error);
              }
            }
          },
          onHandshakeFailure: event => {
            if (sockets.get(connectionKey) !== connection || !listeners.get(connectionKey)?.size)
              return;
            const failedSocket = Symbol('failedWebSocket');
            connection.socket = failedSocket;
            if (observer.reconnectUrl) {
              retry(failedSocket, new Error('Kubernetes watch handshake failed'));
              return;
            }
            failures++;
            if (failures >= 3 && observer.onRecoveryNeeded) {
              if ((budget?.recoveries ?? 0) >= MAX_SNAPSHOT_RECOVERIES) {
                stop(
                  new Error(
                    `Kubernetes watch recovery exhausted after ${MAX_SNAPSHOT_RECOVERIES} snapshots`
                  )
                );
                return;
              }
              const pendingRecovery = Symbol('recoveringWebSocket');
              connection.socket = pendingRecovery;
              if (budget) budget.recoveries++;
              const error = new Error('Kubernetes watch handshake failed repeatedly');
              notifyError(error);
              Promise.resolve()
                .then(() => {
                  if (!current(pendingRecovery)) return;
                  return observer.onRecoveryNeeded?.();
                })
                .then(nextUrl => {
                  if (!current(pendingRecovery)) return;
                  if (nextUrl) dial(nextUrl);
                  else sockets.delete(connectionKey);
                })
                .catch(error => {
                  if (!current(pendingRecovery)) return;
                  stop(error instanceof Error ? error : new Error(String(error)));
                });
              return;
            }
            if (failures >= 3 && [...(listeners.get(connectionKey) ?? [])].some(it => it.onClose)) {
              notifyClose(event);
              sockets.delete(connectionKey);
              return;
            }
            if (connection.timer) clearTimeout(connection.timer);
            connection.timer = setTimeout(() => {
              connection.timer = undefined;
              if (current(failedSocket)) dial(observer.reconnectUrl?.() ?? url);
            }, 5000);
            onlineRetry = () => {
              if (!current(failedSocket)) return;
              if (connection.timer) clearTimeout(connection.timer);
              connection.timer = undefined;
              window.removeEventListener('online', onlineRetry!);
              onlineRetry = undefined;
              dial(observer.reconnectUrl?.() ?? url);
            };
            window.addEventListener('online', onlineRetry, { once: true });
          },
          onClose: event => {
            notifyClose(event);
            retry(connection.socket, new Error('Kubernetes watch disconnected'));
          },
        })
          .then(socket => {
            if (!current(pendingSocket)) {
              socket.close();
              return;
            }

            connection.socket = socket;
          })
          .catch(err => {
            retry(pendingSocket, err instanceof Error ? err : new Error(String(err)));
            console.error(err);
          });
      }

      if (budget?.error) {
        try {
          observer.onError?.(budget.error);
        } catch (error) {
          console.error('WebSocket error listener failed:', error);
        }
      }
      if (!existing) dial(url);
      else if (
        typeof existing.socket !== 'symbol' &&
        existing.socket.readyState === WebSocket.OPEN
      ) {
        try {
          observer.onReady?.();
        } catch (error) {
          console.error('WebSocket readiness listener failed:', error);
        }
      }

      const disconnect = () => {
        const remaining = listeners.get(connectionKey);
        remaining?.delete(observer);
        if (remaining?.size === 0) {
          listeners.delete(connectionKey);
          const maybeExisting = sockets.get(connectionKey);
          if (maybeExisting) {
            sockets.delete(connectionKey);
            if (maybeExisting.timer) clearTimeout(maybeExisting.timer);
            if (onlineRetry) window.removeEventListener('online', onlineRetry);
            if (typeof maybeExisting.socket !== 'symbol') maybeExisting.socket.close();
          }
        }
      };
      return { observer, disconnect };
    }

    const occurrences = new Map<string, number>();
    const requestedEntries = enabled
      ? connections.map(request => {
          const key = keyFor(request);
          const occurrence = occurrences.get(key) ?? 0;
          occurrences.set(key, occurrence + 1);
          return { key: JSON.stringify([key, occurrence]), request };
        })
      : [];
    const requested = new Set(requestedEntries.map(entry => entry.key));
    for (const [key, connection] of active) {
      if (!requested.has(key)) {
        connection.disconnect();
        active.delete(key);
      }
    }
    for (const { key, request } of requestedEntries) {
      const existing = active.get(key);
      if (existing) Object.assign(existing.observer, request);
      else active.set(key, connect(request));
    }
  }, [enabled, type, connections, protocols, credentialVersion]);
  useEffect(() => {
    const active = activeConnections.current;
    return () => {
      active.forEach(connection => connection.disconnect());
      active.clear();
    };
  }, []);
}

export function resetWebSocketsForTesting(): void {
  for (const connection of sockets.values()) {
    if (connection.timer) clearTimeout(connection.timer);
    if (typeof connection.socket !== 'symbol') connection.socket.close();
  }
  sockets.clear();
  listeners.clear();
  recoveryBudgets = new WeakMap<object, RecoveryBudget>();
  recoverySequence = 0;
}
