/*
 * Copyright 2026 The Kubernetes Authors
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

import { createSelector } from '@reduxjs/toolkit';
import { useMemo, useSyncExternalStore } from 'react';
import { loadClusterSettings, subscribeToClusterSettings } from '../helpers/clusterSettings';
import type { ConfigState } from '../redux/configSlice';
import { builtInSettings } from '../redux/configSlice';
import { useTypedSelector } from '../redux/hooks';
import type { RootState } from '../redux/stores/store';
import {
  getDisplayMode,
  getNestedValue,
  resolveSettingValue,
  stripClusterPrefix,
} from './settingsResolution';

const noUserSettings: Partial<ConfigState['settings']> = {};

/**
 * Selects the effective app settings: each built-in setting resolved through
 * the admin settings hierarchy. Read app settings through this, not through
 * `state.config.settings`, which does not know about admin settings.
 */
export const selectEffectiveSettings = createSelector(
  [
    (state: RootState) => state.config.userSettings ?? noUserSettings,
    (state: RootState) => state.adminSettings,
  ],
  (userSettings, adminSettings): ConfigState['settings'] =>
    Object.fromEntries(
      Object.keys(builtInSettings).map(key => [
        key,
        resolveSettingValue(key, userSettings[key], builtInSettings[key], adminSettings).value,
      ])
    ) as ConfigState['settings']
);

/**
 * Hook that resolves a single setting through the admin settings hierarchy
 * and returns its effective value along with display mode.
 *
 * Resolution order (normal mode): user localStorage > cluster > admin default > built-in
 * When hidden/disabled: cluster > admin default > built-in (user ignored)
 *
 * The returned `value` can be `undefined` for paths without a built-in default
 * (e.g. plugin or cluster-scoped settings), so callers should provide their own
 * fallback when a defined value is required.
 */
export function useSetting<T = any>(
  path: string,
  clusterName?: string
): { value: T | undefined; hidden: boolean; disabled: boolean } {
  const adminSettings = useTypedSelector(state => state.adminSettings ?? null);
  const userValue = useTypedSelector(state => state.config?.userSettings?.[path]);
  const builtInDefault = builtInSettings[path];
  const localClusterSnapshot = useSyncExternalStore(
    subscribeToClusterSettings,
    () => {
      if (!clusterName) {
        return '';
      }
      const clusterSettings = loadClusterSettings(clusterName);
      const clusterPath = stripClusterPrefix(path, clusterName);
      const val = getNestedValue(clusterSettings, clusterPath);
      return val === undefined ? '' : JSON.stringify(val) ?? '';
    },
    () => ''
  );

  return useMemo(() => {
    if (clusterName) {
      const isClusterScopedPath = stripClusterPrefix(path, clusterName) !== path;
      const rawUserValue = localClusterSnapshot ? JSON.parse(localClusterSnapshot) : undefined;
      const localUserValue =
        rawUserValue === '' || (Array.isArray(rawUserValue) && rawUserValue.length === 0)
          ? undefined
          : (rawUserValue as T | undefined);
      const { value } = resolveSettingValue<T | undefined>(
        path,
        isClusterScopedPath ? localUserValue : userValue,
        isClusterScopedPath ? undefined : builtInDefault,
        adminSettings,
        clusterName
      );
      const mode = getDisplayMode(adminSettings, path, clusterName);
      return {
        value,
        hidden: mode === 'hidden',
        disabled: mode === 'disabled',
      };
    }
    const { value } = resolveSettingValue(path, userValue, builtInDefault, adminSettings);
    const mode = getDisplayMode(adminSettings, path);
    return {
      value: value as T | undefined,
      hidden: mode === 'hidden',
      disabled: mode === 'disabled',
    };
  }, [path, userValue, builtInDefault, adminSettings, clusterName, localClusterSnapshot]);
}
