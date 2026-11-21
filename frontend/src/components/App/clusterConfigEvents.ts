/*
 * Copyright 2026 The Kubernetes Authors
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

import { getHeadlampWebSocketProtocol } from '../../helpers/getHeadlampAPIHeaders';
import { makeUrl } from '../../lib/k8s/api/v2/makeUrl';
import { getBaseWsUrl } from '../../lib/k8s/api/v2/webSocket';

const CONFIG_EVENT_PROTOCOL = 'headlamp.config-events.v1';
const MIN_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const HEALTHY_STREAM_MS = 30_000;

/** Subscribes to config invalidations until the caller stops the connection. */
export function watchClusterConfig(onChange: () => Promise<unknown>): () => void {
  let stopped = false;
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = MIN_RETRY_DELAY_MS;
  let refreshPending = false;
  let refreshing = false;

  async function refresh() {
    if (refreshing) {
      refreshPending = true;
      return;
    }

    refreshing = true;
    try {
      do {
        refreshPending = false;
        await onChange().catch(() => {});
      } while (refreshPending && !stopped);
    } finally {
      refreshing = false;
    }
  }

  function reconnect() {
    reconnectTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
  }

  function connect() {
    const protocol = getHeadlampWebSocketProtocol();
    let connection: WebSocket;
    try {
      connection = new WebSocket(makeUrl([getBaseWsUrl(), 'config/events'], {}), [
        CONFIG_EVENT_PROTOCOL,
        ...(protocol ? [protocol] : []),
      ]);
    } catch {
      reconnect();
      return;
    }

    socket = connection;
    let openedAt: number | undefined;
    connection.addEventListener('open', () => {
      openedAt = Date.now();
    });
    connection.addEventListener('message', event => {
      if (!stopped && socket === connection && event.data === '{"type":"config"}') void refresh();
    });
    connection.addEventListener('close', () => {
      if (stopped || socket !== connection) return;
      if (openedAt !== undefined && Date.now() - openedAt >= HEALTHY_STREAM_MS) {
        retryDelay = MIN_RETRY_DELAY_MS;
      }
      reconnect();
    });
  }

  connect();

  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(reconnectTimer);
    socket?.close();
  };
}
