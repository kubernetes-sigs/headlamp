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

import { getBackstageToken } from './backstageMessageReceiver';

/**
 * Adds backstage authentication token to headers if available
 *
 * @param headers - optional existing headers to add the token to
 * @returns headers with backstage token if available
 */
export function addBackstageAuthHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getBackstageToken();

  if (!token) {
    return headers;
  }

  // If headers is already a Headers object, create a new one and copy all headers
  if (headers instanceof Headers) {
    const newHeaders = new Headers(headers);
    newHeaders.set('X-BACKSTAGE-TOKEN', token);
    return newHeaders;
  }

  // If headers is a plain object or array, spread it and add the token
  if (typeof headers === 'object' && headers !== null) {
    return {
      ...headers,
      'X-BACKSTAGE-TOKEN': token,
    };
  }

  // If headers is undefined/null/empty, just return the token header
  return {
    'X-BACKSTAGE-TOKEN': token,
  };
}
