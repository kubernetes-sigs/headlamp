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

import { useMemo } from 'react';
import { builtInSettings } from '../redux/configSlice';
import { useTypedSelector } from '../redux/hooks';
import { resolveSettingValue } from './settingsResolution';

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
  const userValue = useTypedSelector(state => state.config?.settings?.[path]);
  const builtInDefault = builtInSettings[path];

  return useMemo(() => {
    const { value } = resolveSettingValue(
      path,
      userValue,
      builtInDefault,
      adminSettings,
      clusterName
    );
    const mode = adminSettings?.display[path];
    return {
      value: value as T | undefined,
      hidden: mode === 'hidden',
      disabled: mode === 'disabled',
    };
  }, [path, userValue, builtInDefault, adminSettings, clusterName]);
}
