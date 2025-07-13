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

beforeEach(() => {
  // Clears the database and adds some testing data.
  // Jest will wait for this promise to resolve before running tests.
  localStorage.clear();
});
