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

import {
  createBackendTokenFetch,
  DesktopBackendApi,
  initializeDesktopBackend,
  initializeHeadlessBackend,
} from './backendTokenFetch';
import { getHeadlampAPIHeaders, setBackendToken } from './getHeadlampAPIHeaders';

describe('createBackendTokenFetch', () => {
  const response = new Response();

  it('adds the backend token to local backend requests', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({ 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' }),
      () => 4466
    );

    await backendFetch('http://127.0.0.1:4466/externalproxy', {
      headers: { 'Forward-To': 'https://artifacthub.io/api/v1/packages/search' },
    });

    const headers = new Headers(fetchImplementation.mock.calls[0][1]?.headers);
    expect(fetchImplementation.mock.calls[0][0]).toBe('http://127.0.0.1:4466/externalproxy');
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
    const request = new Request('http://127.0.0.1:4466/config', {
      headers: { 'X-HEADLAMP_BACKEND-TOKEN': 'stale-token' },
    });

    await backendFetch(request);

    const headers = new Headers(fetchImplementation.mock.calls[0][1]?.headers);
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
  });

  it('rewrites legacy loopback requests without exposing the token to other origins or ports', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({ 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' }),
      () => 4466
    );

    await backendFetch('https://artifacthub.io/api/v1/packages/search');
    await backendFetch('http://localhost:4466/config');
    await backendFetch('http://[::1]:4466/config');
    await backendFetch('http://localhost:4467/config');
    await backendFetch('http://[::1]:4467/config');

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://artifacthub.io/api/v1/packages/search',
      undefined
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:4466/config',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:4466/config',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      4,
      'http://localhost:4467/config',
      undefined
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(5, 'http://[::1]:4467/config', undefined);
  });

  it('authenticates local backend requests using default port 80', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({ 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' }),
      () => 80
    );

    await backendFetch('http://127.0.0.1/config');

    const headers = new Headers(fetchImplementation.mock.calls[0][1]?.headers);
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
  });

  it('leaves requests unchanged until the backend token is available', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({}),
      () => 4466
    );

    await backendFetch('http://127.0.0.1:4466/config');

    expect(fetchImplementation).toHaveBeenCalledWith('http://127.0.0.1:4466/config', undefined);
  });

  it('does not expose a token before the selected backend port is available', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
    const backendFetch = createBackendTokenFetch(
      fetchImplementation,
      () => ({ 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' }),
      () => undefined
    );

    await backendFetch('http://127.0.0.1:4466/config');

    expect(fetchImplementation).toHaveBeenCalledWith('http://127.0.0.1:4466/config', undefined);
  });
});

describe('initializeDesktopBackend', () => {
  it('waits for both the selected port and token before allowing backend requests', () => {
    const callbacks: Record<string, (value: string | number) => void> = {};
    const unsubscribers = [vi.fn(), vi.fn(), vi.fn()];
    const api = {
      send: vi.fn(),
      receive: vi.fn((channel: string, callback: (value: string | number) => void) => {
        callbacks[channel] = callback;
        return unsubscribers[Object.keys(callbacks).length - 1];
      }),
    };
    const onReady = vi.fn();
    const onUnavailable = vi.fn();
    window.headlampBackendPort = 4466;
    setBackendToken('stale-token');

    const cleanup = initializeDesktopBackend(
      api as unknown as DesktopBackendApi,
      onReady,
      onUnavailable
    );
    callbacks['backend-token']('desktop-token');

    expect(onReady).not.toHaveBeenCalled();
    expect(window.headlampBackendPort).toBeUndefined();
    expect(getHeadlampAPIHeaders()).toEqual({});

    callbacks['backend-port'](4467);

    expect(window.headlampBackendPort).toBe(4467);
    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token',
    });
    expect(onReady).toHaveBeenCalledOnce();
    expect(api.send.mock.calls).toEqual([['request-backend-token'], ['request-backend-port']]);

    callbacks['backend-unavailable'](undefined as never);

    expect(window.headlampBackendPort).toBeUndefined();
    expect(getHeadlampAPIHeaders()).toEqual({});
    expect(onUnavailable).toHaveBeenCalledOnce();

    cleanup();
    expect(unsubscribers[0]).toHaveBeenCalledOnce();
    expect(unsubscribers[1]).toHaveBeenCalledOnce();
    expect(unsubscribers[2]).toHaveBeenCalledOnce();
    setBackendToken(null);
  });
});

describe('initializeHeadlessBackend', () => {
  const validToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    sessionStorage.clear();
    setBackendToken(null);
    window.headlampBackendPort = undefined;
  });

  afterEach(() => {
    sessionStorage.clear();
    setBackendToken(null);
    window.headlampBackendPort = undefined;
  });

  it('reads #backendToken from the URL fragment, sets the token and port, and strips the token from the fragment', () => {
    const replaceState = vi.fn();
    const result = initializeHeadlessBackend(`#backendToken=${validToken}`, replaceState, 4466);

    expect(result).toBe(true);
    expect(window.headlampBackendPort).toBe(4466);
    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': validToken,
    });
    // The token fragment must be stripped from the URL to prevent it from
    // appearing in browser history, bookmarks, or referrer headers.
    expect(replaceState).toHaveBeenCalledOnce();
    const [, , replacedUrl] = replaceState.mock.calls[0];
    expect(replacedUrl).not.toContain('backendToken');
    expect(replacedUrl).not.toContain(validToken);
  });

  it('preserves other hash parameters when stripping #backendToken', () => {
    const replaceState = vi.fn();
    initializeHeadlessBackend(`#foo=bar&backendToken=${validToken}&baz=qux`, replaceState, 4466);

    const [, , replacedUrl] = replaceState.mock.calls[0];
    expect(replacedUrl).toContain('foo=bar');
    expect(replacedUrl).toContain('baz=qux');
    expect(replacedUrl).not.toContain('backendToken');
    expect(replacedUrl).not.toContain(validToken);
  });

  it('accepts configured development tokens as well as generated 64-hex tokens', () => {
    const replaceState = vi.fn();
    const result = initializeHeadlessBackend('#backendToken=headlamp', replaceState, 4466);

    expect(result).toBe(true);
    expect(window.headlampBackendPort).toBe(4466);
    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': 'headlamp',
    });
    expect(replaceState).toHaveBeenCalledOnce();
  });

  it('rejects empty or whitespace-only tokens in the URL fragment', () => {
    const replaceState = vi.fn();
    const result = initializeHeadlessBackend('#backendToken=   ', replaceState, 4466);

    expect(result).toBe(false);
    expect(window.headlampBackendPort).toBeUndefined();
    expect(getHeadlampAPIHeaders()).toEqual({});
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does nothing when #backendToken is absent from the URL fragment', () => {
    const replaceState = vi.fn();
    const result = initializeHeadlessBackend('#other=param', replaceState, 4466);

    expect(result).toBe(false);
    expect(window.headlampBackendPort).toBeUndefined();
    expect(getHeadlampAPIHeaders()).toEqual({});
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does nothing when the URL has no hash fragment', () => {
    const replaceState = vi.fn();
    const result = initializeHeadlessBackend('', replaceState, 4466);

    expect(result).toBe(false);
    expect(window.headlampBackendPort).toBeUndefined();
    expect(getHeadlampAPIHeaders()).toEqual({});
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('saves the token to sessionStorage during initial bootstrap and strips the fragment', () => {
    const replaceState = vi.fn();
    const mockStorage: Record<string, string> = {};
    const storage = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
    };

    const result = initializeHeadlessBackend(
      `#backendToken=${validToken}`,
      replaceState,
      4466,
      storage
    );

    expect(result).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith('headlamp_headless_backend_token', validToken);
    expect(window.headlampBackendPort).toBe(4466);
    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': validToken,
    });
  });

  it('recovers the token from sessionStorage on page reload when the URL has no hash fragment', () => {
    const replaceState = vi.fn();
    const storage = {
      getItem: vi.fn((key: string) =>
        key === 'headlamp_headless_backend_token' ? validToken : null
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    const result = initializeHeadlessBackend('', replaceState, 4466, storage);

    expect(result).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith('headlamp_headless_backend_token');
    expect(window.headlampBackendPort).toBe(4466);
    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': validToken,
    });
    // No replaceState needed when recovering from storage without hash
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('authenticates requests (like /config) after recovering token from sessionStorage on reload', async () => {
    const replaceState = vi.fn();
    const storage = {
      getItem: vi.fn((key: string) =>
        key === 'headlamp_headless_backend_token' ? validToken : null
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    initializeHeadlessBackend('', replaceState, 4466, storage);

    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    const backendFetch = createBackendTokenFetch(
      mockFetch,
      getHeadlampAPIHeaders,
      () => window.headlampBackendPort
    );

    await backendFetch('http://localhost:4466/config');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('http://127.0.0.1:4466/config');
    const headers = new Headers(calledInit?.headers);
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe(validToken);
  });

  it('falls back gracefully when storage throws a SecurityError on access or mutation', () => {
    const replaceState = vi.fn();
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError: access denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('SecurityError: access denied');
      }),
      removeItem: vi.fn(() => {
        throw new Error('SecurityError: access denied');
      }),
    };

    const result = initializeHeadlessBackend(
      `#backendToken=${validToken}`,
      replaceState,
      4466,
      throwingStorage
    );

    expect(result).toBe(true);
    expect(window.headlampBackendPort).toBe(4466);
    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': validToken,
    });
    expect(replaceState).toHaveBeenCalledOnce();
  });
});
