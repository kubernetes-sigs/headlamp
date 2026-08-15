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

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchOAuthCallback,
  OAuthProviderRegistration,
  registerOAuthProvider,
} from './oauthProvider';

const unregisterProviders: Array<() => void> = [];

/**
 * Creates and tracks a valid OAuth provider registration for a test.
 *
 * @param overrides Registration fields to replace.
 * @returns A valid provider registration.
 */
function registration(
  overrides: Partial<OAuthProviderRegistration> = {}
): OAuthProviderRegistration {
  return {
    id: 'example',
    callback: { hostname: 'oauth', pathname: '/callback' },
    handleCallback: vi.fn(),
    ...overrides,
  };
}

/**
 * Registers a provider and tracks its cleanup callback.
 *
 * @param provider Provider registration to add.
 * @returns The provider cleanup callback.
 */
function register(provider: OAuthProviderRegistration): () => void {
  const unregister = registerOAuthProvider(provider);
  unregisterProviders.push(unregister);
  return unregister;
}

afterEach(() => {
  for (const unregister of unregisterProviders.splice(0)) {
    unregister();
  }
  vi.restoreAllMocks();
});

describe('registerOAuthProvider', () => {
  it.each([null, undefined])('rejects a missing registration: %s', value => {
    expect(() => registerOAuthProvider(value as never)).toThrow(
      'Invalid OAuth provider registration'
    );
  });

  it.each([
    { label: 'non-string id', overrides: { id: 1 } },
    { label: 'empty id', overrides: { id: '' } },
    { label: 'long id', overrides: { id: 'a'.repeat(129) } },
    { label: 'invalid id', overrides: { id: '../example' } },
    { label: 'missing callback', overrides: { callback: undefined } },
    {
      label: 'non-string hostname',
      overrides: { callback: { hostname: 1, pathname: '/callback' } },
    },
    {
      label: 'invalid hostname',
      overrides: { callback: { hostname: '../oauth', pathname: '/callback' } },
    },
    {
      label: 'non-string pathname',
      overrides: { callback: { hostname: 'oauth', pathname: 1 } },
    },
    {
      label: 'relative pathname',
      overrides: { callback: { hostname: 'oauth', pathname: 'callback' } },
    },
    {
      label: 'invalid pathname',
      overrides: { callback: { hostname: 'oauth', pathname: '/../callback' } },
    },
    { label: 'non-function handler', overrides: { handleCallback: 'callback' } },
  ])('rejects a malformed registration with $label', ({ overrides }) => {
    expect(() =>
      registerOAuthProvider(registration(overrides as Partial<OAuthProviderRegistration>))
    ).toThrow('Invalid OAuth provider registration');
  });

  it('rejects duplicate callback ownership', () => {
    register(registration());

    expect(() => registerOAuthProvider(registration({ id: 'other' }))).toThrow(
      'OAuth callback is already registered'
    );
  });

  it('does not let stale cleanup remove a replacement provider', () => {
    const firstUnregister = register(registration());
    firstUnregister();
    const replacementHandler = vi.fn();
    register(registration({ id: 'replacement', handleCallback: replacementHandler }));

    firstUnregister();

    expect(dispatchOAuthCallback(new URL('headlamp://oauth/callback'), 'headlamp')).toBe(true);
    expect(replacementHandler).toHaveBeenCalledOnce();
  });
});

describe('dispatchOAuthCallback', () => {
  it('dispatches an exact callback with its query parameters', () => {
    const handleCallback = vi.fn();
    register(
      registration({
        callback: { hostname: 'OAuth.Example', pathname: '/callback' },
        handleCallback,
      })
    );
    const url = new URL('headlamp://oauth.example/callback?code=code&state=state');

    expect(dispatchOAuthCallback(url, 'headlamp')).toBe(true);
    expect(handleCallback).toHaveBeenCalledWith(url);
  });

  it.each([
    { url: 'headlamp://oauth/callback', scheme: 'aks-desktop' },
    { url: 'headlamp://other/callback', scheme: 'headlamp' },
    { url: 'headlamp://oauth/other', scheme: 'headlamp' },
    { url: 'headlamp://oauth/callback/extra', scheme: 'headlamp' },
  ])('does not dispatch an unregistered callback: $url', ({ url, scheme }) => {
    const handleCallback = vi.fn();
    register(registration({ handleCallback }));

    expect(dispatchOAuthCallback(new URL(url), scheme)).toBe(false);
    expect(handleCallback).not.toHaveBeenCalled();
  });

  it('reports a synchronous provider failure after claiming the callback', () => {
    const error = new Error('sync failure');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    register(
      registration({
        handleCallback: () => {
          throw error;
        },
      })
    );

    expect(dispatchOAuthCallback(new URL('headlamp://oauth/callback'), 'headlamp')).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('OAuth callback failed for provider example:', error);
  });

  it('reports an asynchronous provider failure after claiming the callback', async () => {
    const error = new Error('async failure');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    register(registration({ handleCallback: () => Promise.reject(error) }));

    expect(dispatchOAuthCallback(new URL('headlamp://oauth/callback'), 'headlamp')).toBe(true);
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'OAuth callback failed for provider example:',
        error
      );
    });
  });
});
