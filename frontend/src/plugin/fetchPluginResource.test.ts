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

import { afterEach, expect, it, vi } from 'vitest';
import { fetchPluginResource } from './fetchPluginResource';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('aborts a stalled plugin resource request after the timeout', async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  });

  const request = fetchPluginResource(
    '/plugins/stalled/main.js',
    {},
    response => response.text(),
    100
  );
  const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(100);

  await rejection;
});

it('clears the timeout after a plugin resource loads', async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('plugin source'));

  await expect(
    fetchPluginResource('/plugins/ready/main.js', {}, response => response.text(), 100)
  ).resolves.toBe('plugin source');
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts when response headers arrive but the body stalls', async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
    const body = new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () =>
          controller.error(new DOMException('Aborted', 'AbortError'))
        );
      },
    });
    return Promise.resolve(new Response(body));
  });

  const request = fetchPluginResource(
    '/plugins/stalled/package.json',
    {},
    response => response.json(),
    100
  );
  const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(100);

  await rejection;
});
