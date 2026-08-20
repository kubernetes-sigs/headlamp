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

import { getHeadlampAPIHeaders } from './getHeadlampAPIHeaders';

const BACKEND_TOKEN_HEADER = 'X-HEADLAMP_BACKEND-TOKEN';
let installed = false;

export function createBackendTokenFetch(
  fetchImplementation: typeof fetch,
  getHeaders: () => Record<string, string>,
  getBackendPort: () => number
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

export function installBackendTokenFetch(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }

  window.fetch = createBackendTokenFetch(
    window.fetch.bind(window),
    getHeadlampAPIHeaders,
    () => window.headlampBackendPort ?? 4466
  );
  installed = true;
}
