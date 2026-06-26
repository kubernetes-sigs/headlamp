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

import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getLastThemeForMode, getThemeName } from '../../lib/themes';
import { useTypedSelector } from '../../redux/hooks';
import ActionButton from '../common/ActionButton';
import { setTheme, useAppThemes } from './themeSlice';

/**
 * Quick light/dark theme toggle for the top bar. Flips between a light and a
 * dark theme by dispatching `setTheme`, so it stays in sync with the Settings
 * theme picker (both read/write the same `theme` slice).
 */
export default function ThemeToggleButton() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const appThemes = useAppThemes();
  const themeName = useTypedSelector(state => state.theme.name) || getThemeName();
  // When the backend forces a theme, switching is disabled (mirrors Settings).
  const forceTheme = useTypedSelector(state => state.config.forceTheme);

  if (forceTheme) {
    return null;
  }

  const currentTheme = appThemes.find(it => it.name === themeName);
  const isDark = (currentTheme?.base ?? 'light') === 'dark';
  const targetMode = isDark ? 'light' : 'dark';

  // Prefer the user's most recently selected theme of the target mode, then the
  // built-in "light"/"dark" themes, then any available theme of that mode.
  const remembered = getLastThemeForMode(targetMode);
  const defaultName = targetMode;
  const targetTheme =
    (remembered ? appThemes.find(it => it.name === remembered) : undefined) ??
    appThemes.find(it => it.name === defaultName) ??
    appThemes.find(it => (it.base ?? 'light') === targetMode);

  if (!targetTheme) {
    return null;
  }

  return (
    <ActionButton
      icon={isDark ? 'mdi:weather-sunny' : 'mdi:weather-night'}
      description={isDark ? t('Switch to light theme') : t('Switch to dark theme')}
      iconButtonProps={{ color: 'inherit' }}
      onClick={() => dispatch(setTheme(targetTheme.name))}
    />
  );
}
