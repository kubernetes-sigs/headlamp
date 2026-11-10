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
import * as electronHelpers from '../helpers/isElectron';
import {
  filterDisabledDevelopmentPlugins,
  getDormantDevelopmentPluginSettings,
} from './developmentPlugins';

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
  window.desktopApi = {
    isDevelopment: false,
    getDevelopmentPluginsEnabled: vi.fn().mockResolvedValue(false),
  } as any;

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toEqual([
    { name: 'managed', source: 'user', type: 'user' },
    { name: 'bundled', source: 'shipped', type: 'shipped' },
  ]);
});

test('keeps development plugins for a built renderer launched in Electron development mode', async () => {
  vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
  window.desktopApi = { isDevelopment: true } as any;

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toBe(plugins);
});

test('keeps development plugins when packaged users enable them', async () => {
  vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
  window.desktopApi = {
    isDevelopment: false,
    getDevelopmentPluginsEnabled: vi.fn().mockResolvedValue(true),
  } as any;

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toBe(plugins);
});

test('fails closed for development plugins when the setting cannot be read', async () => {
  vi.spyOn(electronHelpers, 'isElectron').mockReturnValue(true);
  window.desktopApi = {
    isDevelopment: false,
    getDevelopmentPluginsEnabled: vi.fn().mockRejectedValue(new Error('IPC unavailable')),
  } as any;

  await expect(filterDisabledDevelopmentPlugins(plugins)).resolves.toEqual([
    { name: 'managed', source: 'user', type: 'user' },
    { name: 'bundled', source: 'shipped', type: 'shipped' },
  ]);
});

test('preserves disabled preferences only for present dormant development plugins', () => {
  const settings = [
    {
      name: 'local-package',
      folderName: 'local',
      type: 'development' as const,
      description: 'Local plugin',
      homepage: '',
      isEnabled: false,
      isLoaded: true,
      isCompatible: true,
      overriddenBy: 'user' as const,
    },
    {
      name: 'removed-package',
      folderName: 'removed',
      source: 'development' as const,
      type: 'development' as const,
      description: 'Removed plugin',
      homepage: '',
      isEnabled: false,
    },
    {
      name: 'migrated-package',
      folderName: 'migrated',
      type: 'user' as const,
      description: 'Migrated plugin',
      homepage: '',
      isEnabled: false,
    },
    {
      name: 'managed-package',
      folderName: 'managed',
      source: 'user' as const,
      type: 'user' as const,
      description: 'Managed plugin',
      homepage: '',
      isEnabled: false,
    },
  ];

  expect(getDormantDevelopmentPluginSettings(plugins, plugins.slice(2), settings)).toEqual([
    {
      ...settings[0],
      isLoaded: false,
      isDevelopmentModeBlocked: true,
      isCompatible: undefined,
      overriddenBy: undefined,
    },
    {
      ...settings[2],
      isLoaded: false,
      isDevelopmentModeBlocked: true,
      isCompatible: undefined,
      overriddenBy: undefined,
    },
  ]);
  expect(getDormantDevelopmentPluginSettings(plugins, plugins, settings)).toEqual([]);
});
