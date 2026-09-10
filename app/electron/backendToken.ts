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

import { randomBytes } from 'node:crypto';

/**
 * Resolves the token shared with Headlamp's backend.
 *
 * External-server development may provide the token used by its separately
 * started backend. Packaged and self-hosted app runs always generate a fresh
 * token instead of accepting an environment override.
 *
 * @param isDevelopment - Whether Electron is running from a development build.
 * @param useExternalServer - Whether Electron connects to a separately started backend.
 * @param configuredToken - Token configured for that external backend.
 * @param generateToken - Random token generator, injectable for tests.
 * @returns The configured external token or a newly generated token.
 */
export function resolveBackendToken(
  isDevelopment: boolean,
  useExternalServer: boolean,
  configuredToken: string | undefined,
  generateToken = () => randomBytes(32).toString('hex')
): string {
  return isDevelopment && useExternalServer && configuredToken ? configuredToken : generateToken();
}

interface ExternalBackendWaitOptions {
  /** Number of authenticated readiness attempts. */
  attempts?: number;
  /** Delay between transport failures. */
  retryDelayMs?: number;
  /** Maximum duration of one readiness request. */
  requestTimeoutMs?: number;
  /** Fetch implementation, injectable for tests. */
  fetchFn?: typeof fetch;
  /** Delay implementation, injectable for tests. */
  delayFn?: (milliseconds: number) => Promise<void>;
}

/**
 * Waits for a separately started backend to accept authenticated requests.
 *
 * Connection failures are expected while local development compiles the Go
 * backend, so they are retried without logging. An HTTP response proves the
 * server is reachable; a non-success response fails immediately so token or
 * configuration errors remain visible.
 *
 * @param port - Local backend port.
 * @param token - Backend token shared by the development processes.
 * @param options - Retry and dependency overrides.
 * @returns A promise that resolves when the backend accepts the token.
 * @throws When the backend rejects the request or does not become reachable.
 */
export async function waitForExternalBackend(
  port: number,
  token: string,
  options: ExternalBackendWaitOptions = {}
): Promise<void> {
  const attempts = options.attempts ?? 120;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const requestTimeoutMs = options.requestTimeoutMs ?? 500;
  const fetchFn = options.fetchFn ?? fetch;
  const delayFn =
    options.delayFn ??
    ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, requestTimeoutMs));
    let response: Response;
    try {
      response = await fetchFn(`http://localhost:${port}/config`, {
        headers: { 'X-HEADLAMP_BACKEND-TOKEN': token },
        signal: controller.signal,
      });
    } catch {
      if (attempt === attempts) {
        throw new Error(`External backend did not become reachable on port ${port}`);
      }
      if (!controller.signal.aborted) {
        await delayFn(retryDelayMs);
      }
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `External backend readiness failed: ${response.status} ${response.statusText}`
      );
    }
    return;
  }
}
