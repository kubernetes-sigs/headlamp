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

import { getHeadlampAPIHeaders } from '../../../../helpers/getHeadlampAPIHeaders';
import { request } from './clusterRequests';

/**
 * Deletes the plugin with the specified name from the system.
 *
 * This function sends a DELETE request to the server's plugin management
 * endpoint, targeting the plugin identified by its name and type.
 * The function handles the request asynchronously and returns a promise that
 * resolves when the deletion succeeds.
 *
 * @param name - The unique name of the plugin to delete.
 *  This identifier is used to construct the URL for the DELETE request.
 * @param type - Optional plugin type ('development' or 'user'). If specified,
 *  only that specific plugin location is checked. If omitted, the backend
 *  will check both locations in priority order.
 *
 * @returns Resolves to the parsed response body if present; otherwise `undefined`.
 * @throws {error} — If the response status is not ok.
 *
 * @example
 * // Call to delete a plugin named 'examplePlugin' from user-plugins
 * deletePlugin('examplePlugin', 'user')
 *   .then(response => console.log('Plugin deleted successfully', response))
 *   .catch(error => console.error('Failed to delete plugin', error));
 */
export async function deletePlugin(name: string, type?: 'development' | 'user') {
  const url = type ? `/plugins/${name}?type=${type}` : `/plugins/${name}`;
  const res = (await request(
    url,
    { method: 'DELETE', headers: { ...getHeadlampAPIHeaders() } },
    false,
    false
  )) as any;

  // Handle real fetch Response
  if (res && typeof res.ok === 'boolean' && typeof res.text === 'function') {
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(text.trim() || `HTTP ${res.status}`);
    }
    return text ? JSON.parse(text) : undefined;
  }

  // Otherwise request() already returned the parsed payload
  return res;
}
