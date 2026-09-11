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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tests for pluginConfigSlice per-entry sanitization and dangerous-key filtering.
// Basic module-load fallbacks (invalid JSON, non-object, SecurityError) are
// already covered in pluginStorage.test.ts.
describe('pluginConfigSlice load path', () => {
  const PLUGIN_CONFIG_KEY = 'pluginConfigs';

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load empty object when localStorage is empty', async () => {
    const { pluginConfigSlice } = await import('./pluginConfigSlice');
    expect(pluginConfigSlice.getInitialState()).toEqual({});
  });

  it('should load parsed config when localStorage has valid data', async () => {
    localStorage.setItem(PLUGIN_CONFIG_KEY, JSON.stringify({ 'my-plugin': { foo: 'bar' } }));
    const { pluginConfigSlice } = await import('./pluginConfigSlice');
    expect(pluginConfigSlice.getInitialState()).toEqual({ 'my-plugin': { foo: 'bar' } });
  });

  it('should discard invalid non-object entries from valid JSON', async () => {
    // Valid JSON top-level, but some entries are invalid (null, array)
    localStorage.setItem(
      PLUGIN_CONFIG_KEY,
      JSON.stringify({
        'good-plugin': { a: 1 },
        'bad-plugin-null': null,
        'bad-plugin-array': [],
        'bad-plugin-string': 'hello',
      })
    );
    const { pluginConfigSlice } = await import('./pluginConfigSlice');
    // Only 'good-plugin' should survive
    expect(pluginConfigSlice.getInitialState()).toEqual({ 'good-plugin': { a: 1 } });
    expect(console.warn).toHaveBeenCalled();
  });

  it('should ignore dangerous keys like __proto__ when loading from localStorage', async () => {
    localStorage.setItem(
      PLUGIN_CONFIG_KEY,
      '{"__proto__":{"polluted":true},"good-plugin":{"a":1}}'
    );
    const { pluginConfigSlice } = await import('./pluginConfigSlice');
    const state = pluginConfigSlice.getInitialState() as Record<string, unknown>;
    expect(state).toEqual({ 'good-plugin': { a: 1 } });
    expect('polluted' in state === false || state['polluted'] === undefined).toBe(true);
    expect(console.warn).toHaveBeenCalled();
  });
});
