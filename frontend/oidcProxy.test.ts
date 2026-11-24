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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(['', '/headlamp/'])('OIDC development proxy with base %s', base => {
  it('keeps Rsbuild login landing pages outside the backend proxy', async () => {
    vi.stubEnv('PUBLIC_URL', base);
    vi.stubEnv('BASE_URL', '');
    vi.resetModules();
    const { default: config } = await import('./rsbuild.config');
    const proxies = config.server?.proxy;
    if (!Array.isArray(proxies)) {
      throw new Error('Expected the configured Rsbuild proxies');
    }
    const filters = proxies.map(proxy => proxy.pathFilter);
    const filter = filters.find(
      filter => Array.isArray(filter) && filter.some(path => path.includes('encoded-clusters'))
    );
    if (!Array.isArray(filter)) throw new Error('Expected encoded-cluster proxy filters');
    const endpoints = [
      '/encoded-clusters/*/oidc-logout',
      '/encoded-clusters/*/oidc-logout/redirect',
      '/encoded-clusters/*/clear-token',
    ];
    expect(filter.filter(path => path.includes('encoded-clusters'))).toEqual(
      base ? [...endpoints, ...endpoints.map(path => `/headlamp${path}`)] : endpoints
    );
  });

  it('keeps Vite login pages local and proxies only the three backend routes', async () => {
    vi.stubEnv('PUBLIC_URL', base);
    vi.resetModules();
    // The config loads esbuild, which needs Node's Uint8Array rather than jsdom's realm.
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(new TextEncoder().encode('')).constructor);
    const { default: config } = await import('./vite.config');
    const keys = Object.keys(config.server?.proxy ?? {});
    const matchesProxy = (path: string) =>
      keys.some(key => (key.startsWith('^') ? new RegExp(key).test(path) : path.startsWith(key)));
    const prefix = `${base.replace(/\/$/, '')}/encoded-clusters/bWFpbg`;
    for (const endpoint of ['oidc-logout', 'oidc-logout/redirect?state=signed', 'clear-token']) {
      expect(matchesProxy(`${prefix}/${endpoint}`)).toBe(true);
    }
    for (const endpoint of ['login', 'login?source=provider', 'oidc-logout-extra']) {
      expect(matchesProxy(`${prefix}/${endpoint}`)).toBe(false);
    }
  });
});
