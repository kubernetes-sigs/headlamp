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

import type { PluginInfo } from './pluginsSlice';

/** The npm scope Headlamp controls, see https://github.com/kubernetes-sigs/headlamp/issues/2597 */
const OFFICIAL_PLUGIN_PREFIX = '@headlamp-k8s/';

/**
 * Strips the official scope, so that a renamed plugin and its old unscoped name, like
 * "@headlamp-k8s/app-catalog" and "app-catalog", are treated as one plugin. Other scopes
 * are returned unchanged.
 *
 * @param name the plugin name, as found in its package.json.
 * @returns the name without the official scope prefix.
 */
export function getPluginBaseName(name: string): string {
  return name.startsWith(OFFICIAL_PLUGIN_PREFIX) ? name.slice(OFFICIAL_PLUGIN_PREFIX.length) : name;
}

/**
 * @param plugin the plugin to check.
 * @returns true if the plugin is published under the scope Headlamp controls.
 */
export function isOfficiallyScoped(plugin: Pick<PluginInfo, 'name'>): boolean {
  return plugin.name.startsWith(OFFICIAL_PLUGIN_PREFIX);
}

/**
 * @param plugin the plugin to check.
 * @param plugins all installed plugins.
 * @returns true if an @headlamp-k8s version of this plugin is installed, which stops it loading.
 */
export function isBlockedByOfficialPlugin(
  plugin: Pick<PluginInfo, 'name'>,
  plugins: Pick<PluginInfo, 'name'>[]
): boolean {
  return (
    !isOfficiallyScoped(plugin) &&
    plugins.some(p => isOfficiallyScoped(p) && getPluginBaseName(p.name) === plugin.name)
  );
}
