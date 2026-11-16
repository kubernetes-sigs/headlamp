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

import * as electronHelpers from '../helpers/isElectron';
import { beforePluginStartupDeadline, fetchAndExecutePlugins } from './index';
import { PluginInfo } from './pluginsSlice';

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
});

describe('fetchAndExecutePlugins with development plugins turned off', () => {
  const originalDesktopApi = window.desktopApi;

  /**
   * Serves a development plugin and an old unscoped user plugin with the same folder name.
   *
   * @param developmentPluginName the package name of the development plugin.
   * @returns the mocked fetch.
   */
  function servePlugins(developmentPluginName: string) {
    const files: Record<string, unknown> = {
      plugins: [
        {
          path: 'plugins/app-catalog',
          type: 'development',
          source: 'development',
          name: 'app-catalog',
        },
        { path: 'user-plugins/app-catalog', type: 'user', source: 'user', name: 'app-catalog' },
      ],
      'plugins/app-catalog/package.json': { name: developmentPluginName },
      'user-plugins/app-catalog/package.json': { name: 'app-catalog' },
      'user-plugins/app-catalog/main.js': '',
    };

    return vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      const file = Object.keys(files).find(path => url.endsWith(`/${path}`));
      if (!file) {
        return new Response('', { status: 404 });
      }
      const body = files[file];
      return new Response(typeof body === 'string' ? body : JSON.stringify(body));
    });
  }

  async function loadPlugins() {
    const onSettingsChange = vi.fn();
    await fetchAndExecutePlugins([], onSettingsChange, () => {});
    const settings: PluginInfo[] = onSettingsChange.mock.calls[0][0];
    return settings.find(plugin => plugin.name === 'app-catalog' && plugin.type === 'user');
  }

  beforeEach(() => {
    vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
    window.desktopApi = {
      isDevelopment: false,
      getDevelopmentPluginsEnabled: vi.fn().mockResolvedValue(false),
      send: vi.fn(),
      receive: (_channel: string, callback: (secrets: Record<string, number>) => void) =>
        callback({}),
    } as any;
  });

  afterEach(() => {
    window.desktopApi = originalDesktopApi;
    vi.restoreAllMocks();
  });

  it('does not load the old name while its scoped development copy is installed', async () => {
    const fetchMock = servePlugins('@headlamp-k8s/app-catalog');

    const legacy = await loadPlugins();

    expect(legacy?.isLoaded).toBe(false);
    // The blocked development plugin's code is never fetched
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.filter(url => url.endsWith('/plugins/app-catalog/package.json'))).toHaveLength(1);
    expect(urls.filter(url => url.endsWith('/plugins/app-catalog/main.js'))).toHaveLength(0);
  });

  it('still loads the old name when the development copy is not scoped', async () => {
    servePlugins('app-catalog');

    const legacy = await loadPlugins();

    expect(legacy?.isLoaded).toBe(true);
  });
});
