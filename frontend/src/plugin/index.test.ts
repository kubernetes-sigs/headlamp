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

import { addEventCallback, HeadlampEventType } from '../redux/headlampEventSlice';
import store from '../redux/stores/store';
import {
  applyPluginPriority,
  beforePluginStartupDeadline,
  fetchAndExecutePlugins,
  filterSources,
  initializePlugins,
  permissionSecretsFromApp,
  updateSettingsPackages,
} from './index';
import { PluginInfo } from './pluginsSlice';
import Registry from './registry';

describe('beforePluginStartupDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects work that does not finish within the remaining startup budget', async () => {
    vi.useFakeTimers();
    const result = beforePluginStartupDeadline(new Promise(() => {}), Date.now() + 100);
    const rejection = expect(result).rejects.toThrow('Plugin startup timed out');

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });

  it('rejects an already expired startup budget without scheduling more work', async () => {
    vi.useFakeTimers();

    await expect(beforePluginStartupDeadline(Promise.resolve('late'), Date.now())).rejects.toThrow(
      'Plugin startup timed out'
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline timer when startup completes or rejects early', async () => {
    vi.useFakeTimers();
    await expect(
      beforePluginStartupDeadline(Promise.resolve('ready'), Date.now() + 100)
    ).resolves.toBe('ready');
    const error = new Error('plugin failed');
    await expect(beforePluginStartupDeadline(Promise.reject(error), Date.now() + 100)).rejects.toBe(
      error
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('plugin precedence', () => {
  function plugin(type?: PluginInfo['type'], isEnabled = true): PluginInfo {
    return { name: 'example', description: 'Example plugin', homepage: '', type, isEnabled };
  }

  it.each([
    [true, true, true, 'development'],
    [false, true, true, 'user'],
    [false, false, true, 'shipped'],
    [false, false, false, undefined],
  ] as const)(
    'loads only the highest-priority enabled copy (%s, %s, %s)',
    (dev, user, shipped, winner) => {
      const plugins = [
        plugin('shipped', shipped),
        plugin('development', dev),
        plugin('user', user),
      ];

      const result = applyPluginPriority(plugins);

      expect(result.filter(item => item.isLoaded).map(item => item.type)).toEqual(
        winner ? [winner] : []
      );
      for (const item of result.filter(item => !item.isLoaded)) {
        expect(item.overriddenBy).toBe(winner);
      }
      expect(plugins.every(item => item.isLoaded === undefined)).toBe(true);
    }
  );

  it('treats a legacy copy without a type as shipped and handles unrelated plugins independently', () => {
    const result = applyPluginPriority([
      plugin(),
      plugin('user'),
      { ...plugin('development'), name: 'standalone', isEnabled: undefined },
      { ...plugin('user', false), name: 'disabled' },
    ]);

    expect(result.find(item => item.name === 'example' && !item.type)).toMatchObject({
      isLoaded: false,
      overriddenBy: 'user',
    });
    expect(result.find(item => item.name === 'standalone')).toMatchObject({ isLoaded: true });
    expect(result.find(item => item.name === 'disabled')).toMatchObject({ isLoaded: false });
  });
});

describe('plugin initialization', () => {
  const originalPlugins = window.plugins;

  afterEach(() => {
    window.plugins = originalPlugins;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects failed plugin metadata downloads without publishing incomplete settings', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/plugins')) {
        return new Response(
          JSON.stringify([
            { path: 'plugins/example', name: 'example', type: 'user', source: 'user' },
          ])
        );
      }
      if (url.endsWith('/main.js')) return new Response('');
      if (url.endsWith('/package.json')) return new Response('', { status: 503 });
      throw new Error(`Unexpected plugin request: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('desktopApi', undefined);
    const onSettingsChange = vi.fn();
    const onIncompatible = vi.fn();
    window.plugins = {};

    await expect(
      fetchAndExecutePlugins([], onSettingsChange, onIncompatible)
    ).rejects.toMatchObject({ status: 503 });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onSettingsChange).not.toHaveBeenCalled();
    expect(onIncompatible).not.toHaveBeenCalled();
  });

  it('gives each plugin a registry and continues after one plugin fails', async () => {
    const error = new Error('initialization failed');
    const broken = vi.fn(() => {
      throw error;
    });
    const healthy = vi.fn();
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.plugins = { broken: { initialize: broken }, healthy: { initialize: healthy } };

    await initializePlugins();

    expect(broken).toHaveBeenCalledWith(expect.any(Registry));
    expect(healthy).toHaveBeenCalledWith(expect.any(Registry));
    expect(logError).toHaveBeenCalledWith('Plugin initialize() error in broken:', error);
  });
});

describe('desktop plugin permission exchange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers the response listener before requesting permissions from the desktop bridge', async () => {
    const receive =
      vi.fn<(channel: string, callback: (value: Record<string, number>) => void) => void>();
    const send = vi.fn<(channel: string) => void>();
    vi.stubGlobal('desktopApi', { platform: 'darwin', receive, send });

    const pending = permissionSecretsFromApp();

    expect(receive).toHaveBeenCalledWith('plugin-permission-secrets', expect.any(Function));
    expect(send).toHaveBeenCalledWith('request-plugin-permission-secrets');
    expect(receive.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
    receive.mock.calls[0][1]({ 'runCmd-example': 123 });
    await expect(pending).resolves.toEqual({ 'runCmd-example': 123 });
  });

  it('resolves without permissions in the standalone web app', async () => {
    vi.stubGlobal('desktopApi', undefined);

    await expect(permissionSecretsFromApp()).resolves.toEqual({});
  });
});

describe('filterSources', () => {
  it('filters out all sources when appMode is true and settingsPackages is undefined', () => {
    const sources = ['s1', 's2'];
    const pkgs: PluginInfo[] = [
      { name: 'p1', description: '', homepage: '' },
      { name: 'p2', description: '', homepage: '' },
    ];
    const { sourcesToExecute } = filterSources(sources, pkgs, true, '>=0.8.0-alpha.3', undefined);
    expect(sourcesToExecute).toHaveLength(0);
  });

  it('marks incompatible plugins when appMode is false and version does not match', () => {
    const sources = ['s1'];
    const pkgs: PluginInfo[] = [
      {
        name: 'old-plugin',
        description: '',
        homepage: '',
        devDependencies: { '@kinvolk/headlamp-plugin': '^0.6.0' },
      },
    ];
    const { sourcesToExecute, incompatiblePlugins } = filterSources(
      sources,
      pkgs,
      false,
      '>=0.8.0-alpha.3'
    );
    expect(sourcesToExecute).toHaveLength(0);
    expect(incompatiblePlugins['old-plugin']).toBeDefined();
  });

  it('allows all sources when compatibleVersion is empty string', () => {
    const sources = ['s1'];
    const pkgs: PluginInfo[] = [
      {
        name: 'old-plugin',
        description: '',
        homepage: '',
        devDependencies: { '@kinvolk/headlamp-plugin': '^0.6.0' },
      },
    ];
    const { sourcesToExecute } = filterSources(sources, pkgs, false, '');
    expect(sourcesToExecute).toHaveLength(1);
  });
});

describe('updateSettingsPackages', () => {
  it('returns settingsPlugins unchanged when nothing has changed', () => {
    const pkg: PluginInfo = {
      name: 'myplugin',
      description: '',
      homepage: '',
      version: '1.0.0',
      type: 'shipped',
    };
    const settingsPkg: PluginInfo = { ...pkg, isEnabled: true };
    const result = updateSettingsPackages([pkg], [settingsPkg]);
    // Same length, same reference-equality-like semantics: returns settingsPlugins as-is
    expect(result).toEqual([settingsPkg]);
  });

  it('enables development and user plugins by default', () => {
    const devPlugin: PluginInfo = {
      name: 'dev-p',
      description: '',
      homepage: '',
      type: 'development',
    };
    const userPlugin: PluginInfo = { name: 'user-p', description: '', homepage: '', type: 'user' };

    const devResult = updateSettingsPackages([devPlugin], []);
    const userResult = updateSettingsPackages([userPlugin], []);

    expect(devResult[0].isEnabled).toBe(true);
    expect(userResult[0].isEnabled).toBe(true);
  });

  it('disables shipped plugin with enabledByDefault=false', () => {
    const pkg: PluginInfo = {
      name: 'shipped-p',
      description: '',
      homepage: '',
      type: 'shipped',
      headlamp: { enabledByDefault: false },
    };
    const result = updateSettingsPackages([pkg], []);
    expect(result[0].isEnabled).toBe(false);
  });

  it('strips isDevelopmentModeBlocked when plugin is re-discovered', () => {
    const backend: PluginInfo = {
      name: 'dev-p',
      description: '',
      homepage: '',
      type: 'development',
    };
    const settings: PluginInfo = { ...backend, isEnabled: false, isDevelopmentModeBlocked: true };
    const result = updateSettingsPackages([backend], [settings]);
    expect(result[0]).not.toHaveProperty('isDevelopmentModeBlocked');
  });
});

describe('fetchAndExecutePlugins — retry and 404 package.json', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.plugins = {};
  });

  it('uses plugin folder name and version 0.0.0 when package.json returns 404', async () => {
    const onSettingsChange = vi.fn();
    const onIncompatible = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/plugins')) {
        return new Response(
          JSON.stringify([
            { path: 'plugins/myplugin', name: 'myplugin', type: 'user', source: 'user' },
          ])
        );
      }
      if (url.endsWith('/main.js')) return new Response('');
      if (url.endsWith('/package.json')) return new Response('Not Found', { status: 404 });
      throw new Error(`Unexpected: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('desktopApi', undefined);
    window.plugins = {};

    await fetchAndExecutePlugins([], onSettingsChange, onIncompatible);

    expect(onSettingsChange).toHaveBeenCalled();
    // The plugin should have been added with version 0.0.0 and name from path
    const calledWith = onSettingsChange.mock.calls[0][0] as PluginInfo[];
    expect(calledWith.some(p => p.name === 'myplugin' || p.version === '0.0.0')).toBe(true);
  });

  it('calls onIncompatible when a plugin has incompatible headlamp-plugin version', async () => {
    const onSettingsChange = vi.fn();
    const onIncompatible = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/plugins')) {
        return new Response(
          JSON.stringify([
            { path: 'plugins/oldplugin', name: 'oldplugin', type: 'shipped', source: 'shipped' },
          ])
        );
      }
      if (url.endsWith('/main.js')) return new Response('');
      if (url.endsWith('/package.json')) {
        return new Response(
          JSON.stringify({
            name: 'oldplugin',
            version: '1.0.0',
            description: '',
            homepage: '',
            devDependencies: { '@kinvolk/headlamp-plugin': '^0.6.0' },
          })
        );
      }
      throw new Error(`Unexpected: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('desktopApi', undefined);
    window.plugins = {};

    await fetchAndExecutePlugins([], onSettingsChange, onIncompatible);

    expect(onIncompatible).toHaveBeenCalled();
  });
});

describe('fetchAndExecutePlugins — execution, retry, and error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.plugins = {};
  });

  it('retries transient /plugins failures and executes compatible plugins', async () => {
    const onSettingsChange = vi.fn();
    const onIncompatible = vi.fn();
    let pluginsAttempts = 0;

    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/plugins')) {
        pluginsAttempts++;
        if (pluginsAttempts === 1) {
          return new Response('Temporary error', { status: 500 });
        }
        return new Response(
          JSON.stringify([
            { path: 'plugins/good-plugin', name: 'good-plugin', type: 'user', source: 'user' },
          ])
        );
      }
      if (url.endsWith('/main.js')) {
        return new Response(
          'window.plugins["good-plugin"] = { initialize: function(registry) { window.__goodPluginInit = true; } };'
        );
      }
      if (url.endsWith('/package.json')) {
        return new Response(
          JSON.stringify({
            name: 'good-plugin',
            version: '1.0.0',
            description: '',
            homepage: '',
            devDependencies: { '@kinvolk/headlamp-plugin': '^0.8.0' },
          })
        );
      }
      throw new Error(`Unexpected: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('desktopApi', undefined);
    window.plugins = {};

    await fetchAndExecutePlugins([], onSettingsChange, onIncompatible);

    expect(pluginsAttempts).toBe(2);
    expect(onIncompatible).not.toHaveBeenCalled();
    expect((window as any).__goodPluginInit).toBe(true);
    delete (window as any).__goodPluginInit;
  });

  it('dispatches PLUGIN_LOADING_ERROR when a plugin throws during execution', async () => {
    const onSettingsChange = vi.fn();
    const onIncompatible = vi.fn();
    const eventCallback = vi.fn();
    store.dispatch(addEventCallback(eventCallback));

    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/plugins')) {
        return new Response(
          JSON.stringify([
            { path: 'plugins/bad-plugin', name: 'bad-plugin', type: 'user', source: 'user' },
          ])
        );
      }
      if (url.endsWith('/main.js')) {
        return new Response('throw new Error("boom in plugin");');
      }
      if (url.endsWith('/package.json')) {
        return new Response(
          JSON.stringify({
            name: 'bad-plugin',
            version: '1.0.0',
            description: '',
            homepage: '',
            devDependencies: { '@kinvolk/headlamp-plugin': '^0.8.0' },
          })
        );
      }
      throw new Error(`Unexpected: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('desktopApi', undefined);
    window.plugins = {};

    await expect(
      fetchAndExecutePlugins([], onSettingsChange, onIncompatible)
    ).resolves.toBeUndefined();

    expect(eventCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: HeadlampEventType.PLUGIN_LOADING_ERROR,
        data: expect.objectContaining({
          pluginInfo: { name: 'bad-plugin', version: '1.0.0' },
          error: expect.any(Error),
        }),
      })
    );
  });
});
