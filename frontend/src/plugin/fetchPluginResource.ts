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

const PLUGIN_FETCH_TIMEOUT_MS = 30000;

/**
 * Fetch a plugin resource without allowing a stalled response to block startup indefinitely.
 *
 * @param url - Plugin resource URL.
 * @param headers - Headers to send with the request.
 * @param consume - Reads the response while the timeout remains active.
 * @param timeoutMs - Time after which the request is aborted.
 * @returns The consumed plugin resource.
 */
export async function fetchPluginResource<T>(
  url: string,
  headers: HeadersInit,
  consume: (response: Response) => Promise<T>,
  timeoutMs = PLUGIN_FETCH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { headers: new Headers(headers), signal: controller.signal });
    return await consume(response);
  } finally {
    clearTimeout(timeout);
  }
}
