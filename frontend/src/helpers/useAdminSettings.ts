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

import { useMemo } from 'react';
import type { SettingSource } from '../redux/adminSettingsSlice';
import { useTypedSelector } from '../redux/hooks';
import { resolveSettingValue } from './settingsResolution';

/**
 * Hook that resolves a setting value using the full admin settings hierarchy.
 *
 * @param path - Dotted path to the setting (e.g. "timezone", "useEvict", "plugins.myPlugin.key")
 * @param userValue - The user's localStorage value (or undefined)
 * @param builtInDefault - The application's built-in default
 * @param clusterName - Optional cluster name for cluster-scoped resolution
 * @returns Object with resolved value and its source
 */
export function useResolvedSetting<T>(
  path: string,
  userValue: T | undefined,
  builtInDefault: T,
  clusterName?: string
): { value: T; source: SettingSource } {
  const adminSettings = useTypedSelector(state => state.adminSettings);

  return useMemo(
    () => resolveSettingValue(path, userValue, builtInDefault, adminSettings, clusterName),
    [path, userValue, builtInDefault, adminSettings, clusterName]
  );
}

/**
 * Hook that checks if a setting is hidden by the admin.
 */
export function useIsSettingHidden(path: string): boolean {
  const display = useTypedSelector(state => state.adminSettings.display);
  return display[path] === 'hidden';
}

/**
 * Hook that checks if a setting is disabled by the admin.
 */
export function useIsSettingDisabled(path: string): boolean {
  const display = useTypedSelector(state => state.adminSettings.display);
  return display[path] === 'disabled';
}
