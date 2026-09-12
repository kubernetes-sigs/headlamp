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

import { isElectron } from '../helpers/isElectron';
import type { PluginInfo } from './pluginsSlice';

/** Minimum inventory metadata needed to apply the development-plugin loading policy. */
export interface PluginSourceMetadata {
  /** Inventory folder name used to associate an entry with persisted settings. */
  name: string;
  /** Inventory directory where Headlamp discovered the plugin. */
  source: 'development' | 'user' | 'shipped';
  /** Resolved plugin type used to associate inventory with legacy settings. */
  type?: PluginInfo['type'];
}

/**
 * Keeps settings for development plugins that are present but currently blocked from loading.
 *
 * @param discoveredPlugins - Complete trusted backend inventory.
 * @param loadablePlugins - Inventory entries allowed to fetch and execute.
 * @param settingsPlugins - Persisted plugin preferences from previous loads.
 * @returns Existing settings for currently blocked development inventory entries.
 */
export function getDormantDevelopmentPluginSettings<T extends PluginSourceMetadata>(
  discoveredPlugins: T[],
  loadablePlugins: T[],
  settingsPlugins: PluginInfo[]
): PluginInfo[] {
  const loadableDevelopmentFolders = new Set(
    loadablePlugins.filter(plugin => plugin.source === 'development').map(plugin => plugin.name)
  );
  const dormantDevelopmentPlugins = discoveredPlugins.filter(
    plugin => plugin.source === 'development' && !loadableDevelopmentFolders.has(plugin.name)
  );

  return settingsPlugins
    .filter(plugin => {
      if (typeof plugin.folderName !== 'string') {
        return false;
      }

      return dormantDevelopmentPlugins.some(
        dormantPlugin =>
          dormantPlugin.name === plugin.folderName &&
          dormantPlugin.type === plugin.type &&
          (plugin.source === 'development' || plugin.source === undefined)
      );
    })
    .map(plugin => ({
      ...plugin,
      isLoaded: false,
      isDevelopmentModeBlocked: true,
      isCompatible: undefined,
      overriddenBy: undefined,
    }));
}

/**
 * Removes development plugins when a packaged desktop user has not enabled them.
 *
 * Browser and Electron development builds retain every plugin. Packaged desktop builds fail closed
 * when the preload query is absent or rejects. The inventory source remains authoritative even
 * when plugin-controlled package metadata causes the resolved type to claim `user`.
 *
 * @param plugins - Discovered plugin metadata to filter before package or bundle fetches occur.
 * @returns The original list when development loading is allowed, otherwise a list without
 * development plugins.
 */
export async function filterDisabledDevelopmentPlugins<T extends PluginSourceMetadata>(
  plugins: T[]
): Promise<T[]> {
  if (!isElectron() || window.desktopApi?.isDevelopment === true) {
    return plugins;
  }

  let enabled = false;
  try {
    enabled = (await window.desktopApi?.getDevelopmentPluginsEnabled?.()) === true;
  } catch {
    enabled = false;
  }
  return enabled ? plugins : plugins.filter(plugin => plugin.source !== 'development');
}
