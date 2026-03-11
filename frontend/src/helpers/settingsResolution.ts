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

import type { AdminSettingsState, DisplayMode, SettingSource } from '../redux/adminSettingsSlice';

/**
 * Retrieves a value from a nested object using a dotted path.
 */
export function getNestedValue(obj: Record<string, any> | null | undefined, path: string): any {
  if (!obj) return undefined;

  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Checks if a cluster is allowed to define a given setting path.
 */
function isSettingClusterDefined(
  adminSettings: AdminSettingsState,
  path: string,
  clusterName: string
): boolean {
  // Check per-setting override first
  const perSetting = adminSettings.clusterDefined[path];
  if (perSetting !== undefined) {
    return matchesClusterList(perSetting, clusterName);
  }

  // Fall back to global clusterDefinedSettings
  return isClusterInGlobalAllowList(adminSettings.clusterDefinedSettings, clusterName);
}

function matchesClusterList(clusters: string[], clusterName: string): boolean {
  return clusters.some(c => c === '*' || c === clusterName);
}

function isClusterInGlobalAllowList(clusterDefinedSettings: any, clusterName: string): boolean {
  if (!clusterDefinedSettings) return false;

  // Short form: array of cluster names
  if (Array.isArray(clusterDefinedSettings)) {
    return matchesClusterList(clusterDefinedSettings, clusterName);
  }

  // Long form: object with cluster names as keys
  if (typeof clusterDefinedSettings === 'object') {
    if ('*' in clusterDefinedSettings) return true;
    return clusterName in clusterDefinedSettings;
  }

  return false;
}

/**
 * Gets the display mode for a setting path.
 */
export function getDisplayMode(
  adminSettings: AdminSettingsState | null,
  path: string
): DisplayMode | undefined {
  if (!adminSettings) return undefined;
  return adminSettings.display[path];
}

/**
 * Resolves the effective value for a setting according to the admin settings hierarchy.
 *
 * Resolution order:
 * - Hidden/Disabled: cluster settings (if allowed) > admin default (user localStorage ignored)
 * - Normal: user localStorage > cluster settings (if allowed) > admin default > built-in default
 */
export function resolveSettingValue<T>(
  path: string,
  userValue: T | undefined,
  builtInDefault: T,
  adminSettings: AdminSettingsState | null,
  clusterName?: string
): { value: T; source: SettingSource } {
  if (!adminSettings || adminSettings.defaults === null) {
    // No admin settings configured - use user value or built-in
    if (userValue !== undefined) {
      return { value: userValue, source: 'user' };
    }
    return { value: builtInDefault, source: 'built-in' };
  }

  const displayMode = adminSettings.display[path];
  const adminDefault = getNestedValue(adminSettings.defaults, path);
  const isHiddenOrDisabled = displayMode === 'hidden' || displayMode === 'disabled';

  // Try to get cluster value if a cluster is specified
  let clusterValue: T | undefined;
  if (clusterName && isSettingClusterDefined(adminSettings, path, clusterName)) {
    const clusterData = adminSettings.clusterSettings[clusterName];
    if (clusterData) {
      const val = getNestedValue(clusterData, path);
      if (val !== undefined) {
        clusterValue = val as T;
      }
    }
  }

  if (isHiddenOrDisabled) {
    // User localStorage is ignored
    if (clusterValue !== undefined) {
      return { value: clusterValue, source: displayMode as SettingSource };
    }
    if (adminDefault !== undefined) {
      return { value: adminDefault as T, source: displayMode as SettingSource };
    }
    return { value: builtInDefault, source: displayMode as SettingSource };
  }

  // Normal: user > cluster > admin > built-in
  if (userValue !== undefined) {
    return { value: userValue, source: 'user' };
  }
  if (clusterValue !== undefined) {
    return { value: clusterValue, source: 'cluster' };
  }
  if (adminDefault !== undefined) {
    return { value: adminDefault as T, source: 'default' };
  }
  return { value: builtInDefault, source: 'built-in' };
}
