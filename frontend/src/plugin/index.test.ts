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
import { beforePluginStartupDeadline, initializePluginsI18n } from './index';
import { initializePluginI18n } from './pluginI18n';
import type { PluginInfo } from './pluginsSlice';

// Keep the real exports (index.ts re-exports useTranslation from this module)
// and replace only the function whose scheduling is under test.
vi.mock('./pluginI18n', async importOriginal => ({
  ...(await importOriginal<typeof import('./pluginI18n')>()),
  initializePluginI18n: vi.fn(),
}));

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

describe('initializePluginsI18n', () => {
  // Paths of the plugins whose i18n init has started, in start order.
  let started: string[];
  // Resolvers for the init calls that are still pending, in start order.
  let releases: Array<() => void>;

  beforeEach(() => {
    started = [];
    releases = [];
    vi.mocked(initializePluginI18n).mockImplementation(
      (_name, _packageInfo, pluginPath) =>
        new Promise<void>(resolve => {
          started.push(pluginPath);
          releases.push(resolve);
        })
    );
  });

  afterEach(() => {
    vi.mocked(initializePluginI18n).mockReset();
  });

  it('starts distinct plugins concurrently', async () => {
    const done = initializePluginsI18n(
      [{ name: 'a' }, { name: 'b' }] as PluginInfo[],
      ['/plugins/a', '/plugins/b'],
      Date.now() + 5000
    );

    // Both must be in flight before either has resolved.
    await vi.waitFor(() => expect(started).toEqual(['/plugins/a', '/plugins/b']));

    releases.forEach(release => release());
    await done;
  });

  it('keeps entries that share a package name sequential, in their original order', async () => {
    const done = initializePluginsI18n(
      [
        { name: 'a', type: 'development' },
        { name: 'a', type: 'shipped' },
        { name: 'b' },
      ] as PluginInfo[],
      ['/plugins/a-dev', '/plugins/a-shipped', '/plugins/b'],
      Date.now() + 5000
    );

    // Different names run together, but the second 'a' must wait for the first.
    await vi.waitFor(() => expect(started).toEqual(['/plugins/a-dev', '/plugins/b']));
    expect(started).not.toContain('/plugins/a-shipped');

    // Finishing the first 'a' is what lets the second one start.
    releases[0]();
    await vi.waitFor(() =>
      expect(started).toEqual(['/plugins/a-dev', '/plugins/b', '/plugins/a-shipped'])
    );

    releases.slice(1).forEach(release => release());
    await done;
  });

  it('passes each plugin its own package info and path', async () => {
    const packageInfos = [{ name: 'a' }, { name: 'b' }] as PluginInfo[];
    const done = initializePluginsI18n(
      packageInfos,
      ['/plugins/a', '/plugins/b'],
      Date.now() + 5000
    );

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(initializePluginI18n).toHaveBeenCalledWith('a', packageInfos[0], '/plugins/a');
    expect(initializePluginI18n).toHaveBeenCalledWith('b', packageInfos[1], '/plugins/b');

    releases.forEach(release => release());
    await done;
  });

  it('rejects when plugin i18n does not finish before the startup deadline', async () => {
    // The mocked init never resolves, so only the deadline can end the call.
    await expect(
      initializePluginsI18n([{ name: 'a' }] as PluginInfo[], ['/plugins/a'], Date.now() + 50)
    ).rejects.toThrow('Plugin startup timed out');
  });
});
