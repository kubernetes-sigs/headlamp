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
import { createRouteURL } from './createRouteURL';

vi.mock('./getRoute', () => ({
  getRoute: vi.fn((name?: string) => {
    if (name === 'pluginParameterizedRoute') {
      return { path: '/plugin/:namespace/:name', useClusterURL: false };
    }
    if (name === 'pluginSimpleRoute') {
      return { path: '/plugin', useClusterURL: false };
    }
    return undefined;
  }),
}));

vi.mock('./getRoutePath', () => ({
  getRoutePath: vi.fn((route: { path: string }) => route.path),
}));

vi.mock('./getRouteUseClusterURL', () => ({
  getRouteUseClusterURL: vi.fn((route: { useClusterURL?: boolean }) => !!route.useClusterURL),
}));

describe('createRouteURL', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty string when no route name is provided', () => {
    expect(createRouteURL()).toBe('');
  });

  it('returns an empty string when the route name is unknown', () => {
    expect(createRouteURL('does-not-exist')).toBe('');
  });

  it('returns the generated URL when all required params are provided', () => {
    expect(createRouteURL('pluginParameterizedRoute', { namespace: 'default', name: 'foo' })).toBe(
      '/plugin/default/foo'
    );
  });

  it('returns the URL as-is for non-parameterized routes', () => {
    expect(createRouteURL('pluginSimpleRoute')).toBe('/plugin');
  });

  it('returns an empty string instead of throwing when required params are missing (#4863)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => createRouteURL('pluginParameterizedRoute')).not.toThrow();
    expect(createRouteURL('pluginParameterizedRoute')).toBe('');

    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('pluginParameterizedRoute');
    expect(message).toContain('/plugin/:namespace/:name');
  });
});
