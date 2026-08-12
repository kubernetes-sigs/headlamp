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

import { expect, test } from '@playwright/test';

function findStaticScriptPath(html: string): string {
  // Use a script URL from the live HTML so the test remains stable with hashed
  // asset names.
  const matches = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi));

  for (const match of matches) {
    const raw = match[1];
    if (
      !raw ||
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:')
    ) {
      continue;
    }

    if (raw.startsWith('/')) {
      return raw;
    }

    return `/${raw.replace(/^\.\//, '')}`;
  }

  throw new Error('Could not find a local static script path in app HTML');
}

test('static asset is served as brotli when client requests br', async ({ request }) => {
  const shellResponse = await request.get('/');
  expect(shellResponse.ok()).toBeTruthy();

  const shellHtml = await shellResponse.text();
  const scriptPath = findStaticScriptPath(shellHtml);

  const brResponse = await request.get(scriptPath, {
    headers: {
      'Accept-Encoding': 'br',
    },
  });
  expect(brResponse.ok()).toBeTruthy();

  const brHeaders = brResponse.headers();
  expect(brHeaders['content-encoding']).toBe('br');
  expect((brHeaders['vary'] || '').toLowerCase()).toContain('accept-encoding');

  const gzipOnlyResponse = await request.get(scriptPath, {
    headers: {
      'Accept-Encoding': 'gzip',
    },
  });
  expect(gzipOnlyResponse.ok()).toBeTruthy();

  const gzipOnlyContentEncoding = (
    gzipOnlyResponse.headers()['content-encoding'] || ''
  ).toLowerCase();
  expect(gzipOnlyContentEncoding).not.toBe('br');
});
