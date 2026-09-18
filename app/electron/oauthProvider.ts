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

const VALID_PROVIDER_ID = /^[a-z0-9][a-z0-9._-]*$/i;
const VALID_HOSTNAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;
const VALID_PATHNAME = /^\/[A-Za-z0-9/._~-]*$/;
const MAX_PROVIDER_ID_LENGTH = 128;

/** Identifies the protocol route owned by an OAuth provider. */
export interface OAuthProviderCallback {
  /** Case-insensitive hostname expected in the provider callback URL. */
  hostname: string;
  /** Case-sensitive absolute path expected in the provider callback URL. */
  pathname: string;
}

/** Describes an OAuth provider that can receive desktop protocol callbacks. */
export interface OAuthProviderRegistration {
  /** Stable identifier used to attribute callback failures. */
  id: string;
  /** Protocol route owned by the provider. */
  callback: OAuthProviderCallback;
  /**
   * Handles a callback claimed by this provider.
   *
   * The registry validates only the URL scheme and registered route. Providers
   * must independently validate attacker-controlled query parameters such as
   * OAuth state, authorization codes, and PKCE values.
   *
   * @param url Route-matched callback URL with untrusted query parameters.
   * @returns Nothing, or a promise that settles after callback handling completes.
   */
  handleCallback(url: URL): void | Promise<void>;
}

/**
 * Internal registry record giving every registration call its own identity, so a
 * cleanup callback can only remove the registration it was issued for.
 */
interface RegistryEntry {
  /** Provider registration supplied by the caller. */
  registration: OAuthProviderRegistration;
}

const providersByCallback = new Map<string, RegistryEntry>();

/** Reports a provider callback failure to the desktop integration layer. */
export type OAuthCallbackErrorReporter = (providerId: string, error: unknown) => void;

/**
 * Creates a lookup key with a normalized hostname and exact pathname.
 *
 * @param hostname Callback URL hostname.
 * @param pathname Callback URL pathname.
 * @returns A registry key with a lowercase hostname and case-sensitive pathname.
 */
function callbackKey(hostname: string, pathname: string): string {
  return `${hostname.toLowerCase()}\n${pathname}`;
}

/**
 * Checks whether a callback pathname is absolute and contains no traversal segments.
 *
 * @param pathname Callback pathname to validate.
 * @returns Whether the pathname is safe for exact route matching.
 */
function isValidPathname(pathname: string): boolean {
  return (
    VALID_PATHNAME.test(pathname) &&
    pathname.split('/').every(segment => segment !== '.' && segment !== '..')
  );
}

/**
 * Validates an OAuth provider registration before storing it.
 *
 * @param registration Candidate provider registration to validate.
 * @returns Whether every registration field is valid.
 */
function isValidRegistration(registration: unknown): registration is OAuthProviderRegistration {
  if (typeof registration !== 'object' || registration === null) {
    return false;
  }

  const candidate = registration as Partial<OAuthProviderRegistration>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length <= MAX_PROVIDER_ID_LENGTH &&
    VALID_PROVIDER_ID.test(candidate.id) &&
    typeof candidate.callback?.hostname === 'string' &&
    VALID_HOSTNAME.test(candidate.callback.hostname) &&
    typeof candidate.callback?.pathname === 'string' &&
    isValidPathname(candidate.callback.pathname) &&
    typeof candidate.handleCallback === 'function'
  );
}

/**
 * Registers an OAuth provider as the exclusive owner of a callback route.
 *
 * Providers that need launch-time callbacks must register before the protocol
 * handler becomes ready; callbacks are drained once and are not replayed to
 * providers registered later.
 *
 * @param registration Provider callback registration.
 * @returns A function that unregisters this provider without affecting replacements.
 * @throws When the registration is invalid or its callback route is already owned.
 */
export function registerOAuthProvider(registration: OAuthProviderRegistration): () => void {
  if (!isValidRegistration(registration)) {
    throw new Error('Invalid OAuth provider registration');
  }
  const key = callbackKey(registration.callback.hostname, registration.callback.pathname);
  if (providersByCallback.has(key)) {
    throw new Error('OAuth callback is already registered');
  }
  // A fresh entry per call, so a stale cleanup callback never matches a later
  // registration even when the caller re-registers the same registration object.
  const entry: RegistryEntry = { registration };
  providersByCallback.set(key, entry);

  return () => {
    if (providersByCallback.get(key) === entry) {
      providersByCallback.delete(key);
    }
  };
}

/**
 * Dispatches a product protocol URL to its registered OAuth provider.
 *
 * Provider failures are reported asynchronously and do not release ownership of
 * the callback URL to other protocol handlers.
 *
 * @param url Candidate OAuth callback URL.
 * @param protocolScheme Product protocol scheme accepted by this application.
 * @param reportError Optional reporter used to surface provider failures to the user.
 * @returns Whether a provider claimed the callback URL.
 */
export function dispatchOAuthCallback(
  url: URL,
  protocolScheme: string,
  reportError?: OAuthCallbackErrorReporter
): boolean {
  if (url.protocol !== `${protocolScheme}:`) {
    return false;
  }
  const entry = providersByCallback.get(callbackKey(url.hostname, url.pathname));
  if (!entry) {
    return false;
  }
  const provider = entry.registration;

  try {
    Promise.resolve(provider.handleCallback(url)).catch(error => {
      reportCallbackError(provider.id, error, reportError);
    });
  } catch (error) {
    reportCallbackError(provider.id, error, reportError);
  }
  return true;
}

/** Logs and forwards a provider callback failure without releasing route ownership. */
function reportCallbackError(
  providerId: string,
  error: unknown,
  reportError?: OAuthCallbackErrorReporter
): void {
  console.error(`OAuth callback failed for provider ${providerId}:`, error);
  reportError?.(providerId, error);
}
