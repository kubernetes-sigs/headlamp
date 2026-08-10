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

import { applyPluginPriority, updateSettingsPackages } from './index';
import { PluginInfo } from './pluginsSlice';

describe('updateSettingsPackages tests', () => {
  test('when sources is empty, it also returns an empty array', () => {
    const plugins = updateSettingsPackages([], []);
    expect(plugins.length).toBe(0);
  });

  test('when there are new backend plugins and no settings plugins', () => {
    const backendPlugins: PluginInfo[] = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
      },
    ];
    const settingsPlugins: PluginInfo[] = [];
    const updatedSettingsPlugins = updateSettingsPackages(backendPlugins, settingsPlugins);
    expect(updatedSettingsPlugins.length).toBe(1);
    expect(updatedSettingsPlugins[0].isEnabled).toBe(true);
  });

  test('when there is an existing setting already turned to true by user', () => {
    const backendPlugins: PluginInfo[] = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
      },
    ];
    const settingsPlugins: PluginInfo[] = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        isEnabled: true,
      },
      {
        name: 'ourplugin2',
        description: 'package description2',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author2',
        isEnabled: true,
      },
    ];
    const updatedSettingsPlugins = updateSettingsPackages(backendPlugins, settingsPlugins);
    expect(updatedSettingsPlugins.length).toBe(1);
    expect(updatedSettingsPlugins[0].isEnabled).toBe(true);
    expect(updatedSettingsPlugins[0].name).toBe('ourplugin1');
  });

  test('when a setting exists, but then is removed from the backend', () => {
    const backendPlugins: PluginInfo[] = [];
    const settingsPlugins: PluginInfo[] = [
      {
        name: 'ourplugin1',
        description: 'package description1',
        homepage: 'https://example.com/1',
        version: '1.0.0',
        author: 'author1',
        isEnabled: true,
      },
    ];
    const updatedSettingsPlugins = updateSettingsPackages(backendPlugins, settingsPlugins);
    expect(updatedSettingsPlugins.length).toBe(0);
  });
});

function makePlugin(name: string, type: PluginInfo['type'], isEnabled = true): PluginInfo {
  return {
    name,
    description: `description for ${name}`,
    homepage: `https://example.com/${name}`,
    version: '1.0.0',
    type,
    isEnabled,
  };
}

function findPlugin(plugins: PluginInfo[], name: string, type: PluginInfo['type']) {
  return plugins.find(plugin => plugin.name === name && plugin.type === type);
}

describe('applyPluginPriority tests', () => {
  test('a single plugin is loaded when enabled', () => {
    const result = applyPluginPriority([makePlugin('app-catalog', 'user')]);
    expect(result[0].isLoaded).toBe(true);
  });

  test('a single plugin is not loaded when disabled', () => {
    const result = applyPluginPriority([makePlugin('app-catalog', 'user', false)]);
    expect(result[0].isLoaded).toBe(false);
  });

  test('development takes priority over user and shipped', () => {
    const result = applyPluginPriority([
      makePlugin('@headlamp-k8s/app-catalog', 'shipped'),
      makePlugin('@headlamp-k8s/app-catalog', 'development'),
      makePlugin('@headlamp-k8s/app-catalog', 'user'),
    ]);

    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'development')?.isLoaded).toBe(true);
    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'user')?.isLoaded).toBe(false);
    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'shipped')?.isLoaded).toBe(false);
  });

  test('the next enabled version is loaded when the highest priority one is disabled', () => {
    const result = applyPluginPriority([
      makePlugin('@headlamp-k8s/app-catalog', 'development', false),
      makePlugin('@headlamp-k8s/app-catalog', 'user'),
    ]);

    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'user')?.isLoaded).toBe(true);
    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'development')?.isLoaded).toBe(false);
  });

  test('the scoped plugin is loaded instead of the old unscoped one', () => {
    const result = applyPluginPriority([
      makePlugin('app-catalog', 'user'),
      makePlugin('@headlamp-k8s/app-catalog', 'shipped'),
    ]);

    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'shipped')?.isLoaded).toBe(true);

    const unscoped = findPlugin(result, 'app-catalog', 'user');
    expect(unscoped?.isLoaded).toBe(false);
    expect(unscoped?.overriddenBy).toBe('shipped');
  });

  test('the scoped plugin is loaded when both are in the same location', () => {
    const result = applyPluginPriority([
      makePlugin('app-catalog', 'user'),
      makePlugin('@headlamp-k8s/app-catalog', 'user'),
    ]);

    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'user')?.isLoaded).toBe(true);
    expect(findPlugin(result, 'app-catalog', 'user')?.isLoaded).toBe(false);
  });

  test('the old unscoped plugin is not loaded when the scoped one is disabled', () => {
    const result = applyPluginPriority([
      makePlugin('app-catalog', 'user'),
      makePlugin('@headlamp-k8s/app-catalog', 'shipped', false),
    ]);

    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'shipped')?.isLoaded).toBe(false);

    const unscoped = findPlugin(result, 'app-catalog', 'user');
    expect(unscoped?.isLoaded).toBe(false);
    expect(unscoped?.overriddenBy).toBe('shipped');
  });

  test('a disabled scoped plugin falls back to another scoped one, not to the old name', () => {
    const result = applyPluginPriority([
      makePlugin('app-catalog', 'user'),
      makePlugin('@headlamp-k8s/app-catalog', 'development', false),
      makePlugin('@headlamp-k8s/app-catalog', 'shipped'),
    ]);

    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'shipped')?.isLoaded).toBe(true);
    expect(findPlugin(result, '@headlamp-k8s/app-catalog', 'development')?.isLoaded).toBe(false);
    expect(findPlugin(result, 'app-catalog', 'user')?.isLoaded).toBe(false);
  });

  test('an unscoped plugin is still loaded when there is no scoped one', () => {
    const result = applyPluginPriority([makePlugin('app-catalog', 'user')]);

    expect(result[0].isLoaded).toBe(true);
    expect(result[0].overriddenBy).toBeUndefined();
  });

  test('plugins in other scopes are not treated as the same plugin', () => {
    const result = applyPluginPriority([
      makePlugin('app-catalog', 'user'),
      makePlugin('@someone-else/app-catalog', 'user'),
    ]);

    expect(result.length).toBe(2);
    expect(result.every(plugin => plugin.isLoaded)).toBe(true);
  });
});
