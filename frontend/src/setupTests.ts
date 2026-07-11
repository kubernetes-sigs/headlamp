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

/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
import indexeddb from 'fake-indexeddb';

// nock v14 uses @mswjs/interceptors, which calls `new Request(url, init)` internally when
// intercepting a fetch. In jsdom v24+, globalThis.Request wraps undici's native Request,
// whose WebIDL validator requires init.signal to be an instance of undici's own AbortSignal.
// jsdom installs its own AbortController (via vitest's populateGlobal), so signals created
// with `new AbortController()` in test code are jsdom AbortSignals that fail that check.
// This Proxy wraps Request construction: if the call fails with an AbortSignal type error,
// it retries without the signal so nock can normalise the request. All other behaviour is
// unchanged. setupFiles run before test-file imports, so this patch is in place before nock
// patches globalThis.fetch.
if (typeof Request !== 'undefined') {
  const OriginalRequest = globalThis.Request;
  globalThis.Request = new Proxy(OriginalRequest, {
    construct(target, args, newTarget) {
      const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
      if (init?.signal) {
        try {
          return Reflect.construct(target, args, newTarget);
        } catch (e: unknown) {
          if (e instanceof TypeError && (e as TypeError).message.includes('AbortSignal')) {
            return Reflect.construct(
              target,
              [input, { ...init, signal: undefined }, ...args.slice(2)],
              newTarget
            );
          }
          throw e;
        }
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
}

globalThis.indexedDB = indexeddb;

if (typeof TextDecoder === 'undefined' && typeof require !== 'undefined') {
  (global as any).TextDecoder = require('util').TextDecoder;
}
if (typeof TextEncoder === 'undefined' && typeof require !== 'undefined') {
  (global as any).TextEncoder = require('util').TextEncoder;
}
if (typeof ResizeObserver === 'undefined' && typeof require !== 'undefined') {
  (global as any).ResizeObserver = require('resize-observer-polyfill');
}

globalThis.Worker = class {
  postMessage() {}
} as any;

if (globalThis.window) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // Deprecated
      removeListener: vi.fn(), // Deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

if (globalThis.window) {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  // Clears the database and adds some testing data.
  // Jest will wait for this promise to resolve before running tests.
  localStorage.clear();
});
