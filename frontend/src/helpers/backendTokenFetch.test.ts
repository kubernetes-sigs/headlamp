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

import { createBackendTokenFetch } from './backendTokenFetch';

describe('createBackendTokenFetch', () => {
  const response = new Response();

  it('adds the backend token to local backend requests', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({ 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' }),
      () => 4466
    );

    await backendFetch('http://localhost:4466/externalproxy', {
      headers: { 'Forward-To': 'https://artifacthub.io/api/v1/packages/search' },
    });

    const headers = new Headers(fetchImplementation.mock.calls[0][1]?.headers);
    expect(headers.get('Forward-To')).toBe('https://artifacthub.io/api/v1/packages/search');
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
  });

  it('replaces stale tokens on Request objects', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({ 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' }),
      () => 4466
    );
    const request = new Request('http://localhost:4466/config', {
      headers: { 'X-HEADLAMP_BACKEND-TOKEN': 'stale-token' },
    });

    await backendFetch(request);

    const headers = new Headers(fetchImplementation.mock.calls[0][1]?.headers);
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
  });

  it('does not expose the token to other origins or ports', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({ 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' }),
      () => 4466
    );

    await backendFetch('https://artifacthub.io/api/v1/packages/search');
    await backendFetch('http://localhost:4467/config');

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://artifacthub.io/api/v1/packages/search',
      undefined
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4467/config',
      undefined
    );
  });

  it('leaves requests unchanged until the backend token is available', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({}),
      () => 4466
    );

    await backendFetch('http://localhost:4466/config');

    expect(fetchImplementation).toHaveBeenCalledWith('http://localhost:4466/config', undefined);
  });
});
