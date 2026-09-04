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

import { afterEach, expect, test, vi } from 'vitest';
import * as devModeHelpers from '../helpers/isDevMode';
import * as electronHelpers from '../helpers/isElectron';
import { filterDisabledDevelopmentPlugins } from './developmentPlugins';

const plugins = [
  { name: 'local', source: 'development' as const, type: 'development' as const },
  { name: 'migrated', source: 'development' as const, type: 'user' as const },
  { name: 'managed', source: 'user' as const, type: 'user' as const },
  { name: 'bundled', source: 'shipped' as const, type: 'shipped' as const },
];

afterEach(() => {
  vi.restoreAllMocks();
});

test('filters every plugin served from the development source when disabled', async () => {
  vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
  vi.spyOn(devModeHelpers, 'isDevMode').mockReturnValue(false);
  window.desktopApi = {
    getDevelopmentPluginsEnabled: vi.fn().mockResolvedValue(false),
  } as any;

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toEqual([
    { name: 'migrated', source: 'development', type: 'user' },
    { name: 'managed', source: 'user', type: 'user' },
    { name: 'bundled', source: 'shipped', type: 'shipped' },
  ]);
});

test('keeps development plugins in Electron development builds', async () => {
  vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
  vi.spyOn(devModeHelpers, 'isDevMode').mockReturnValue(true);

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toBe(plugins);
});

test('keeps development plugins when packaged users enable them', async () => {
  vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
  vi.spyOn(devModeHelpers, 'isDevMode').mockReturnValue(false);
  window.desktopApi = {
    getDevelopmentPluginsEnabled: vi.fn().mockResolvedValue(true),
  } as any;

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toBe(plugins);
});

test('fails closed for development plugins when the setting cannot be read', async () => {
  vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
  vi.spyOn(devModeHelpers, 'isDevMode').mockReturnValue(false);
  window.desktopApi = {
    getDevelopmentPluginsEnabled: vi.fn().mockRejectedValue(new Error('IPC unavailable')),
  } as any;

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toEqual([
    { name: 'migrated', source: 'development', type: 'user' },
    { name: 'managed', source: 'user', type: 'user' },
    { name: 'bundled', source: 'shipped', type: 'shipped' },
  ]);
});
