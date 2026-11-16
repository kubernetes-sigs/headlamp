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

import {
  applyPluginPriority,
  beforePluginStartupDeadline,
  fetchAndExecutePlugins,
  initializePlugins,
  permissionSecretsFromApp,
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
