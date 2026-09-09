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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializePlugins } from './index';
import { Headlamp } from './lib';
import Registry from './registry';

describe('Plugin Registry and Initialization', () => {
  beforeEach(() => {
    // Reset the window objects for test isolation
    window.Headlamp = window.Headlamp || {};
    window.Headlamp.plugins = {};
    (window as any).plugins = {}; // Mock old plugins path
  });

  it('should register a plugin to window.Headlamp.plugins and initialize it', async () => {
    const mockInitialize = vi.fn();
    const pluginObj = {
      initialize: mockInitialize,
    };

    const pluginId = 'test-plugin';
    Headlamp.registerPlugin(pluginId, pluginObj as any);

    // Assert it appears under window.Headlamp.plugins and not window.plugins
    expect(window.Headlamp.plugins[pluginId]).toBe(pluginObj);
    expect((window as any).plugins[pluginId]).toBeUndefined();

    // Verify initializePlugins() invokes it
    await initializePlugins();

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledWith(expect.any(Registry));
  });
});
