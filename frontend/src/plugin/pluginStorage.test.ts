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

// These tests exercise the module-load path of the plugin slices: the initial
// state is computed when the module is first imported, so we seed localStorage
// (or remove it) and use a fresh module registry for each case.
describe('plugin slices module-load state', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pluginsSlice falls back to an empty array when stored settings are invalid JSON', async () => {
    localStorage.setItem('headlampPluginSettings', '{not valid json');

    const { default: reducer } = await import('./pluginsSlice');
    const state = reducer(undefined, { type: '@@INIT' });

    expect(state.pluginSettings).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('pluginsSlice falls back to an empty array when stored settings are not an array', async () => {
    localStorage.setItem('headlampPluginSettings', '{"not":"an array"}');

    const { default: reducer } = await import('./pluginsSlice');
    const state = reducer(undefined, { type: '@@INIT' });

    expect(state.pluginSettings).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('pluginConfigSlice falls back to an empty object when stored configs are invalid JSON', async () => {
    localStorage.setItem('pluginConfigs', '{not valid json');

    const { default: reducer } = await import('./pluginConfigSlice');
    const state = reducer(undefined, { type: '@@INIT' });

    expect(state).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('pluginConfigSlice falls back to an empty object when stored configs are not an object', async () => {
    localStorage.setItem('pluginConfigs', '["not","an object"]');

    const { default: reducer } = await import('./pluginConfigSlice');
    const state = reducer(undefined, { type: '@@INIT' });

    expect(state).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('pluginConfigSlice falls back to an empty object when stored configs are null', async () => {
    localStorage.setItem('pluginConfigs', 'null');

    const { default: reducer } = await import('./pluginConfigSlice');
    const state = reducer(undefined, { type: '@@INIT' });

    expect(state).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('slices fall back to defaults when localStorage is unavailable at import time', async () => {
    // Simulate a non-browser / pre-render environment where localStorage is missing.
    // Stubbing is more reliable than `delete` since jsdom's localStorage can be
    // non-configurable.
    vi.stubGlobal('localStorage', undefined);

    try {
      const { default: pluginsReducer } = await import('./pluginsSlice');
      const { default: pluginConfigReducer } = await import('./pluginConfigSlice');

      expect(pluginsReducer(undefined, { type: '@@INIT' }).pluginSettings).toEqual([]);
      expect(pluginConfigReducer(undefined, { type: '@@INIT' })).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
