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
    const effectiveUrlPort =
      url.port || (url.protocol === 'http:' ? '80' : url.protocol === 'https:' ? '443' : '');
    if (
      !token ||
      backendPort === undefined ||
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      effectiveUrlPort !== `${backendPort}`
    ) {
      return fetchImplementation(input, init);
    }

    // Older plugins use localhost or IPv6 loopback directly. Rewrite before adding
    // the token so the authenticated request reaches the backend's owned listener.
    url.hostname = '127.0.0.1';
    const backendInput =
      input instanceof Request
        ? new Request(url, input)
        : input instanceof URL
        ? url
        : url.toString();
    const requestHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init?.headers ?? requestHeaders);
    headers.set(BACKEND_TOKEN_HEADER, token);
    return fetchImplementation(backendInput, { ...init, headers });
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

const HEADLESS_BACKEND_TOKEN_STORAGE_KEY = 'headlamp_headless_backend_token';

/**
 * Initializes authenticated communication with the backend in headless mode.
 *
 * In headless mode Electron cannot deliver the per-launch backend token via IPC
 * because the UI runs in an external system browser. Instead the token is passed
 * as a one-time URL fragment (#backendToken=<token>) when the browser is
 * opened. This function reads that fragment, sets the active backend port from
 * window.location.port, installs the authenticated fetch wrapper, caches the
 * token in sessionStorage so authentication survives page reloads in the same
 * browser tab, and immediately strips the token from the visible URL fragment
 * so it does not persist in the browser history or appear in server logs/referrers.
 *
 * If no token is found in the URL fragment (e.g. following a page reload), this
 * function attempts to restore the cached token from sessionStorage.
 *
 * This must only be called when `window.desktopApi` is absent (i.e. in a plain
 * browser window, not inside Electron's renderer process).
 *
 * @param locationHash - The `window.location.hash` string, injectable for tests.
 * @param replaceState - `window.history.replaceState` function, injectable for tests.
 * @param port - Optional port override, defaults to parsing `window.location.port`.
 * @param storage - Storage implementation for session persistence, injectable for tests.
 * @returns true when a valid headless token was found and applied, false otherwise.
 */
export function initializeHeadlessBackend(
  locationHash: string = (() => {
    try {
      return typeof window !== 'undefined' && window.location ? window.location.hash : '';
    } catch {
      return '';
    }
  })(),
  replaceState: (data: unknown, unused: string, url: string) => void = (() => {
    try {
      return typeof window !== 'undefined' && window.history
        ? window.history.replaceState.bind(window.history)
        : () => {};
    } catch {
      return () => {};
    }
  })(),
  port?: number,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = (() => {
    try {
      return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
      return null;
    }
  })()
): boolean {
  const hash = locationHash.startsWith('#') ? locationHash.slice(1) : locationHash;
  const params = hash ? new URLSearchParams(hash) : null;
  const hashToken = params?.get('backendToken');

  let token: string | null = null;
  let fromHash = false;

  // Validate token from URL fragment if present
  if (hashToken && hashToken.trim().length > 0) {
    token = hashToken;
    fromHash = true;
    try {
      storage?.setItem(HEADLESS_BACKEND_TOKEN_STORAGE_KEY, hashToken);
    } catch {
      // sessionStorage unavailable (e.g. private browsing with strict settings)
    }
  } else {
    // Attempt recovery from sessionStorage on page reload
    try {
      const storedToken = storage?.getItem(HEADLESS_BACKEND_TOKEN_STORAGE_KEY);
      if (storedToken && storedToken.trim().length > 0) {
        token = storedToken;
      }
    } catch {
      // sessionStorage unavailable
    }
  }

  if (!token) {
    return false;
  }

  // Determine the backend port from window.location or explicit parameter
  let backendPort = port;
  if (backendPort === undefined && typeof window !== 'undefined') {
    try {
      if (window.location?.port) {
        const parsedPort = parseInt(window.location.port, 10);
        if (!Number.isNaN(parsedPort)) {
          backendPort = parsedPort;
        }
      } else if (window.location?.protocol === 'https:') {
        backendPort = 443;
      } else if (window.location?.protocol === 'http:') {
        backendPort = 80;
      }
    } catch {
      // window.location access restricted
    }
  }

  if (typeof window !== 'undefined' && backendPort !== undefined) {
    window.headlampBackendPort = backendPort;
  }

  // Install the authenticated fetch wrapper before publishing the token so no
  // fetch call can slip through unauthenticated between these two steps.
  installBackendTokenFetch();
  setBackendToken(token);

  // If token was present in the URL fragment, strip it immediately so it does not
  // appear in browser history, bookmarks, or referrer headers on subsequent navigations.
  if (fromHash && params) {
    params.delete('backendToken');
    const remainingHash = params.toString();
    const newHash = remainingHash ? `#${remainingHash}` : '';
    const pathname =
      typeof window !== 'undefined' && window.location ? window.location.pathname : '';
    const search = typeof window !== 'undefined' && window.location ? window.location.search : '';
    const newUrl = `${pathname}${search}${newHash}`;
    replaceState(null, '', newUrl);
  }

  return true;
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

  /** Subscribes to notification that the desktop backend connection is no longer valid. */
  receive(channel: 'backend-unavailable', callback: () => void): (() => void) | undefined;
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
 * @param onUnavailable - Called when the backend exits after becoming ready.
 * @returns A function that removes the token and port subscriptions.
 */
export function initializeDesktopBackend(
  api: DesktopBackendApi,
  onReady: () => void,
  onUnavailable: () => void = () => {}
): () => void {
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
  const unsubscribeUnavailable = api.receive('backend-unavailable', () => {
    backendPort = undefined;
    backendToken = undefined;
    backendReady = false;
    window.headlampBackendPort = undefined;
    setBackendToken(null);
    onUnavailable();
  });
  api.send('request-backend-token');
  api.send('request-backend-port');

  return () => {
    unsubscribeToken?.();
    unsubscribePort?.();
    unsubscribeUnavailable?.();
  };
}
