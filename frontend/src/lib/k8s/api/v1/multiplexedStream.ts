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

import { Base64 } from 'js-base64';
import { getHeadlampWebSocketProtocol } from '../../../../helpers/getHeadlampAPIHeaders';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { getCluster } from '../../../cluster';
import { MULTIPLEXER_ENDPOINT, MULTIPLEXER_PROTOCOL } from '../v2/multiplexer';
import { getBaseWsUrl } from '../v2/webSocket';
import { CLUSTERS_PREFIX } from './constants';
import { combinePath } from './formatUrl';
import type { StreamArgs, StreamResultsCb } from './streamingApi';

/** Close code for a stream the backend reported an error for, so the caller retries. */
const BACKEND_ERROR_CLOSE_CODE = 4000;

/**
 * Streams url through the backend's WebSocket multiplexer on a connection of its own.
 * The backend keeps exec and attach sessions for a grace period when this connection
 * drops, and buffers their output, so opening the same stream again reattaches to the
 * session. Output is passed to cb as an ArrayBuffer, like a direct binary stream.
 *
 * getSocket returns an object with the parts of a WebSocket that terminal code uses:
 * readyState, onclose, addEventListener and send, which sends binary input to the
 * stream. It is open once the backend reports the session connected, not when the
 * connection to the backend opens. The stream does not reconnect by itself; the
 * caller opens it again.
 *
 * @param url - The path of the stream, with its query.
 * @param cb - Called with each frame of output.
 * @param args - Stream arguments; only cluster is used.
 * @returns cancel, which ends the session, and getSocket.
 */
export function multiplexedStream<T>(url: string, cb: StreamResultsCb<T>, args: StreamArgs) {
  const [path, query = ''] = url.split('?');
  const target = {
    clusterId: args.cluster || getCluster() || '',
    path,
    query,
    userId: getUserIdFromLocalStorage() || '',
  };

  const backendTokenProtocol = getHeadlampWebSocketProtocol();
  const protocols = backendTokenProtocol
    ? [MULTIPLEXER_PROTOCOL, backendTokenProtocol]
    : [MULTIPLEXER_PROTOCOL];
  // Under the cluster's path, as the browser only sends a cluster's auth cookie there.
  const socket = new WebSocket(
    combinePath(getBaseWsUrl(), `/${CLUSTERS_PREFIX}/${target.clusterId}/${MULTIPLEXER_ENDPOINT}`),
    protocols
  );

  let isSessionOpen = false;
  const openListeners: Array<() => void> = [];

  function sessionOpened() {
    if (isSessionOpen) return;
    isSessionOpen = true;
    openListeners.splice(0).forEach(listener => listener());
  }

  const terminalSocket = {
    get readyState() {
      if (socket.readyState === WebSocket.OPEN && !isSessionOpen) {
        return WebSocket.CONNECTING;
      }
      return socket.readyState;
    },
    onclose: null as ((event: CloseEvent) => void) | null,
    addEventListener(type: string, listener: () => void) {
      if (type === 'open') {
        openListeners.push(listener);
      }
    },
    send(data: ArrayBuffer) {
      socket.send(
        JSON.stringify({
          ...target,
          type: 'REQUEST',
          data: Base64.fromUint8Array(new Uint8Array(data)),
          binary: true,
        })
      );
    },
  };

  socket.onopen = () => socket.send(JSON.stringify({ ...target, type: 'REQUEST' }));

  socket.onmessage = (event: MessageEvent) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      console.error('Failed to parse multiplexed stream message:', err);
      return;
    }

    // This connection only carries this stream. Status messages have no query.
    if (message.clusterId !== target.clusterId || message.path !== target.path) {
      return;
    }

    const status = message.type === 'STATUS' ? parseData(message.data) : {};

    if (status.state === 'connected') {
      sessionOpened();
    } else if (message.type === 'COMPLETE' || status.state === 'closed') {
      // The session ended, e.g. because the shell exited or another window took it over.
      endSession(1000, status.error || '');
    } else if (message.type === 'ERROR') {
      console.error('Multiplexed stream error:', message.data);
      endSession(BACKEND_ERROR_CLOSE_CODE, parseData(message.data).error || message.data || '');
    } else if (message.binary && message.data) {
      sessionOpened();
      const output = Base64.toUint8Array(message.data);
      cb(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as T);
    }
  };

  // A close event only carries the reason of the close frame the server echoes back,
  // so the stream reports the ends it decides on itself, with their reason.
  let hasEnded = false;

  function endSession(code: number, reason: string) {
    if (hasEnded) return;
    hasEnded = true;
    terminalSocket.onclose?.({ code, reason, wasClean: true } as CloseEvent);
    socket.close(1000);
  }

  socket.onclose = (event: CloseEvent) => {
    if (!hasEnded) {
      hasEnded = true;
      terminalSocket.onclose?.(event);
    }
  };

  function cancel() {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ ...target, type: 'CLOSE' }));
    }
    socket.close(1000);
  }

  return {
    cancel,
    getSocket: () => terminalSocket as unknown as WebSocket,
  };
}

/** Parses the JSON data of a status or error message, e.g. { state, error }. */
function parseData(data: string | undefined): { state?: string; error?: string } {
  try {
    return JSON.parse(data || '{}') || {};
  } catch {
    return {};
  }
}
