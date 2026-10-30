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

import { useLayoutEffect } from 'react';
import { useDispatch } from 'react-redux';
import { usePrefersColorScheme } from '../../../lib/themes';
import { useTypedSelector } from '../../../redux/hooks';
import { applySystemTheme, useAppThemes } from '../../App/themeSlice';
import {
  resolvePreferredDarkThemeName,
  resolvePreferredLightThemeName,
  useFollowSystemAppearance,
} from './ThemeToggleButton';

/**
 * While "Follow system appearance" is on, keeps the active theme set to the quick swap light or
 * dark theme that matches the system's color scheme, switching as soon as the system changes.
 * Renders nothing; mount it once near the app root.
 */
export function SystemAppearanceSync() {
  const dispatch = useDispatch();
  // Also re-renders on any quick swap setting change, so edits to the light/dark pair apply.
  const following = useFollowSystemAppearance();
  const scheme = usePrefersColorScheme();
  const appThemes = useAppThemes();
  const currentThemeName = useTypedSelector(state => state.theme.name);
  const forceTheme = useTypedSelector(state => state.config.forceTheme);
  const configuredLight = useTypedSelector(state => state.config.defaultLightTheme);
  const configuredDark = useTypedSelector(state => state.config.defaultDarkTheme);

  const backendConfigReady = useTypedSelector(state => state.theme.backendConfigReady);
  let targetThemeName: string | undefined;
  if (backendConfigReady && following && !forceTheme) {
    targetThemeName =
      scheme === 'dark'
        ? resolvePreferredDarkThemeName(appThemes, configuredDark)
        : resolvePreferredLightThemeName(appThemes, configuredLight);
  }

  // A layout effect applies the switch before paint, so the previous theme doesn't flash.
  // The switch is system-driven, so it isn't saved as the user's own theme choice.
  useLayoutEffect(() => {
    if (targetThemeName) {
      dispatch(applySystemTheme(targetThemeName));
    }
  }, [dispatch, targetThemeName, currentThemeName]);

  return null;
}
