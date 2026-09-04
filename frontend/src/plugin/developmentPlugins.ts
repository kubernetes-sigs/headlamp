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

import { isDevMode } from '../helpers/isDevMode';
import { isElectron } from '../helpers/isElectron';

/** Minimum inventory metadata needed to apply the development-plugin loading policy. */
export interface PluginSourceMetadata {
  /** Resolved inventory type after managed-plugin migration rules are applied. */
  type: 'development' | 'user' | 'shipped';
}

/**
 * Removes development plugins when a packaged desktop user has not enabled them.
 *
 * Browser and Electron development builds retain every plugin. Packaged desktop builds fail closed
 * when the preload query is absent or rejects, while preserving managed plugins whose resolved
 * type is `user` even when their files still reside in the development inventory.
 *
 * @param plugins - Discovered plugin metadata to filter before package or bundle fetches occur.
 * @returns The original list when development loading is allowed, otherwise a list without
 * development plugins.
 */
export async function filterDisabledDevelopmentPlugins<T extends PluginSourceMetadata>(
  plugins: T[]
): Promise<T[]> {
  if (!isElectron() || isDevMode()) {
    return plugins;
  }

  let enabled = false;
  try {
    enabled = (await window.desktopApi?.getDevelopmentPluginsEnabled?.()) === true;
  } catch {
    enabled = false;
  }
  return enabled ? plugins : plugins.filter(plugin => plugin.type !== 'development');
}
