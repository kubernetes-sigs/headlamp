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

import { getHeadlampAPIHeaders } from '../helpers/getHeadlampAPIHeaders';
import { RegisteredClusterSnapshot, setRegisteredClusterSnapshot } from './clusterRegistration';
import { backendFetch } from './k8s/api/v2/fetch';

function registrationFetch(path: string, signal: AbortSignal): Promise<Response> {
  return backendFetch(path, { headers: getHeadlampAPIHeaders(), signal });
}

async function refresh(signal: AbortSignal): Promise<void> {
  const response = await registrationFetch('/cluster-registrations', signal);
  setRegisteredClusterSnapshot((await response.json()) as RegisteredClusterSnapshot);
}

async function consumeEvents(signal: AbortSignal): Promise<void> {
  const response = await registrationFetch('/cluster-registrations/events', signal);
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    // Take every complete event at once, so a chunk carrying several needs one refresh.
    const lastBoundary = buffer.lastIndexOf('\n\n');
    if (lastBoundary === -1) continue;

    const events = buffer.slice(0, lastBoundary);
    buffer = buffer.slice(lastBoundary + 2);

    // Keepalives are comments, so only registration events carry a data field.
    if (events.includes('data:')) {
      await refresh(signal);
    }
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', done);
      resolve();
    };

    const timeout = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done);
  });
}

const MIN_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30_000;

/** A stream that stays open past the server's keepalive interval proved it is healthy. */
const HEALTHY_STREAM_DURATION = 30_000;

/** Starts the registration SSE loop and returns a cleanup function. */
export function startClusterRegistrationStream(): () => void {
  const controller = new AbortController();

  void (async () => {
    let retryDelay = MIN_RETRY_DELAY;
    while (!controller.signal.aborted) {
      const startedAt = Date.now();

      try {
        await consumeEvents(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Cluster registration stream failed:', error);
      }

      if (Date.now() - startedAt >= HEALTHY_STREAM_DURATION) {
        retryDelay = MIN_RETRY_DELAY;
      }

      await delay(retryDelay, controller.signal);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
    }
  })();

  return () => controller.abort();
}
