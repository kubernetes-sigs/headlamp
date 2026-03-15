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

import type { SettingSource } from '../redux/adminSettingsSlice';
import store from '../redux/stores/store';
import { getNestedValue, resolveSettingValue } from './settingsResolution';

/**
 * Plugin settings API exposed via window.pluginLib.Settings.
 * Provides access to admin-defined and cluster-defined settings for plugins.
 */
export const PluginSettingsAPI = {
  /**
   * Get the effective setting value for a plugin, respecting the full hierarchy
   * (admin defaults, cluster settings, user overrides, display modes).
   */
  get(pluginName: string, key: string, clusterName?: string): any {
    const state = store.getState();
    const adminSettings = state.adminSettings;
    const path = `plugins.${pluginName}.${key}`;

    const { value } = resolveSettingValue(path, undefined, undefined, adminSettings, clusterName);
    return value;
  },

  /**
   * Check if a plugin setting is hidden by the admin.
   */
  isHidden(pluginName: string, key: string): boolean {
    const state = store.getState();
    const path = `plugins.${pluginName}.${key}`;
    return state.adminSettings.display[path] === 'hidden';
  },

  /**
   * Check if a plugin setting is disabled by the admin.
   */
  isDisabled(pluginName: string, key: string): boolean {
    const state = store.getState();
    const path = `plugins.${pluginName}.${key}`;
    return state.adminSettings.display[path] === 'disabled';
  },

  /**
   * Get the source of the effective value for a plugin setting.
   */
  getSource(pluginName: string, key: string, clusterName?: string): SettingSource {
    const state = store.getState();
    const adminSettings = state.adminSettings;
    const path = `plugins.${pluginName}.${key}`;

    const { source } = resolveSettingValue(path, undefined, undefined, adminSettings, clusterName);
    return source;
  },

  /**
   * Get the admin default value for a plugin setting (if any).
   */
  getAdminDefault(pluginName: string, key: string): any {
    const state = store.getState();
    if (!state.adminSettings.defaults) return undefined;
    return getNestedValue(state.adminSettings.defaults, `plugins.${pluginName}.${key}`);
  },

  /**
   * Get the cluster-provided value for a plugin setting (if any).
   */
  getClusterSetting(pluginName: string, key: string, clusterName: string): any {
    const state = store.getState();
    const clusterData = state.adminSettings.clusterSettings[clusterName];
    if (!clusterData) return undefined;
    return getNestedValue(clusterData, `plugins.${pluginName}.${key}`);
  },
};
