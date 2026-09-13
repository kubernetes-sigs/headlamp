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

import { getHeadlampAPIHeaders, setBackendToken } from './getHeadlampAPIHeaders';

const BACKEND_TOKEN_HEADER = 'X-HEADLAMP_BACKEND-TOKEN';
let installed = false;

/**
 * Wraps fetch so requests to the active local Headlamp backend include its token.
 *
 * Requests to any other protocol, host, or port are passed through unchanged to
 * avoid exposing the desktop backend token outside its intended origin.
 *
 * @param fetchImplementation - Fetch implementation to wrap.
 * @param getHeaders - Returns the current Headlamp API headers.
 * @param getBackendPort - Returns the active desktop backend port when confirmed.
 * @returns A fetch implementation that authenticates local backend requests.
 */
export function createBackendTokenFetch(
  fetchImplementation: typeof fetch,
  getHeaders: () => Record<string, string>,
  getBackendPort: () => number | undefined
): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    let url: URL;
    try {
      url = new URL(requestUrl);
    } catch {
      return fetchImplementation(input, init);
    }

    const backendPort = getBackendPort();
    const token = getHeaders()[BACKEND_TOKEN_HEADER];
    if (
      !token ||
      backendPort === undefined ||
      url.protocol !== 'http:' ||
      url.hostname !== 'localhost' ||
      url.port !== `${backendPort}`
    ) {
      return fetchImplementation(input, init);
    }

    const requestHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init?.headers ?? requestHeaders);
    headers.set(BACKEND_TOKEN_HEADER, token);
    return fetchImplementation(input, { ...init, headers });
  };
}

/**
 * Installs the authenticated backend fetch wrapper once in a browser window.
 */
export function installBackendTokenFetch(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }

  window.fetch = createBackendTokenFetch(
    window.fetch.bind(window),
    getHeadlampAPIHeaders,
    () => window.headlampBackendPort
  );
  installed = true;
}

/** IPC surface used to request desktop backend connection details. */
export interface DesktopBackendApi {
  /**
   * Sends a backend initialization request to Electron's main process.
   *
   * @param channel - IPC channel identifying the requested connection detail.
   */
  send(channel: string): void;

  /**
   * Subscribes to delivery of the per-launch backend token.
   *
   * @param channel - Backend-token response channel.
   * @param callback - Receives the token generated for this desktop launch.
   * @returns A function that removes the subscription, when one is provided.
   */
  receive(channel: 'backend-token', callback: (token: string) => void): (() => void) | undefined;

  /**
   * Subscribes to delivery of the authenticated backend port.
   *
   * @param channel - Backend-port response channel.
   * @param callback - Receives the port selected for this desktop launch.
   * @returns A function that removes the subscription, when one is provided.
   */
  receive(channel: 'backend-port', callback: (port: number) => void): (() => void) | undefined;
}

/**
 * Initializes authenticated communication with the desktop backend.
 *
 * Readiness is reported only after both the per-launch token and the backend's
 * confirmed listening port have arrived. The returned cleanup function removes
 * both IPC subscriptions.
 *
 * @param api - Desktop IPC API exposed by Electron's preload script.
 * @param onReady - Called when authenticated backend requests can be created.
 * @returns A function that removes the token and port subscriptions.
 */
export function initializeDesktopBackend(api: DesktopBackendApi, onReady: () => void): () => void {
  installBackendTokenFetch();
  setBackendToken(null);
  window.headlampBackendPort = undefined;
  /** Confirmed backend port waiting to be published with its token. */
  let backendPort: number | undefined;
  /** Per-launch backend token waiting to be published with its port. */
  let backendToken: string | undefined;
  /** Whether the complete backend connection has already been published. */
  let backendReady = false;
  /** Publishes both backend connection details together, then reports readiness once. */
  const markBackendReady = () => {
    if (backendReady || backendPort === undefined || backendToken === undefined) {
      return;
    }
    window.headlampBackendPort = backendPort;
    setBackendToken(backendToken);
    backendReady = true;
    onReady();
  };
  /** Removes the backend-token subscription during renderer cleanup. */
  const unsubscribeToken = api.receive('backend-token', (token: string) => {
    backendToken = token;
    markBackendReady();
  });
  /** Removes the backend-port subscription during renderer cleanup. */
  const unsubscribePort = api.receive('backend-port', (port: number) => {
    backendPort = port;
    markBackendReady();
  });
  api.send('request-backend-token');
  api.send('request-backend-port');

  return () => {
    unsubscribeToken?.();
    unsubscribePort?.();
  };
}
