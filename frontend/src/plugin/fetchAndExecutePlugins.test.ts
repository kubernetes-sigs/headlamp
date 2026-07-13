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

import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchAndExecutePlugins } from './index';

describe('fetchAndExecutePlugins — main.js response handling', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('rejects instead of treating a non-ok main.js response as plugin source', async () => {
    const pluginMetadata = [{ path: 'plugins/broken-plugin', type: 'user', name: 'broken-plugin' }];

    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const urlStr = String(url);

      if (urlStr.endsWith('/plugins')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(pluginMetadata),
        } as Response);
      }

      if (urlStr.includes('/main.js')) {
        // Simulate the backend returning an error page instead of the file.
        return Promise.resolve({
          ok: false,
          status: 502,
          text: () => Promise.resolve('<html><body>502 Bad Gateway</body></html>'),
        } as Response);
      }

      if (urlStr.includes('/package.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ name: 'broken-plugin', version: '1.0.0' }),
        } as Response);
      }

      return Promise.reject(new Error(`Unexpected fetch to ${urlStr}`));
    }) as typeof fetch;

    // Before the fix, this would resolve successfully with the HTML error
    // page as the plugin's source, which then got executed as JavaScript.
    // Now it should reject, so the caller (Plugins.tsx) can show a proper
    // "failed to load plugins" error instead of a confusing SyntaxError.
    await expect(
      fetchAndExecutePlugins(
        [],
        () => {},
        () => {}
      )
    ).rejects.toThrow(/Failed to fetch plugin main\.js/);
  });
});
