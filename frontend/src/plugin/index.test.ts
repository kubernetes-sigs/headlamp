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

import { initializePlugins } from './index';

describe('initializePlugins', () => {
  let originalPlugins: any;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalPlugins = window.plugins;
    window.plugins = {};
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    window.plugins = originalPlugins;
    consoleErrorSpy.mockRestore();
  });

  it('collects failing plugins and continues initializing others', async () => {
    const successPlugin1 = {
      initialize: vi.fn(),
    };
    const failingPlugin = {
      initialize: vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      }),
    };
    const successPlugin2 = {
      initialize: vi.fn(),
    };

    window.plugins = {
      success1: successPlugin1,
      failing: failingPlugin,
      success2: successPlugin2,
    };

    const failedPlugins = await initializePlugins();

    // Verify it collected the failing plugin
    expect(failedPlugins).toEqual(['failing']);

    // Verify it attempted to initialize all plugins
    expect(successPlugin1.initialize).toHaveBeenCalled();
    expect(failingPlugin.initialize).toHaveBeenCalled();
    expect(successPlugin2.initialize).toHaveBeenCalled();

    // Verify console.error was called for the failing plugin
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Plugin initialize() error in failing:',
      expect.any(Error)
    );
  });
});
