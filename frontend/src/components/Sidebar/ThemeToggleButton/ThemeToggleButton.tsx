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

import { useTheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { AppTheme } from '../../../lib/AppTheme';
import { useTypedSelector } from '../../../redux/hooks';
import { setTheme, useAppThemes } from '../../App/themeSlice';
import ActionButton from '../../common/ActionButton';

const PREFERRED_LIGHT_THEME_KEY = 'headlampPreferredLightTheme';
const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';
const QUICK_SWAP_ENABLED_KEY = 'headlampQuickSwapEnabled';

/** Fired whenever any quick-swap setting is written, so subscribers can re-render. */
export const QUICK_SWAP_EVENT = 'headlamp:quick-swap-settings-changed';

function notifyQuickSwapChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(QUICK_SWAP_EVENT));
  }
}

/** Fallback names used when the user hasn't picked a preferred theme yet. */
export const DEFAULT_LIGHT_THEME_NAME = 'Light';
export const DEFAULT_DARK_THEME_NAME = 'Dark';

/** A theme is treated as dark only when it explicitly declares `base: 'dark'`. */
export function isDarkTheme(theme: AppTheme): boolean {
  return theme.base === 'dark';
}

export function isLightTheme(theme: AppTheme): boolean {
  return !isDarkTheme(theme);
}

export function getPreferredLightThemeName(): string {
  return localStorage.getItem(PREFERRED_LIGHT_THEME_KEY) ?? DEFAULT_LIGHT_THEME_NAME;
}

export function getPreferredDarkThemeName(): string {
  return localStorage.getItem(PREFERRED_DARK_THEME_KEY) ?? DEFAULT_DARK_THEME_NAME;
}

export function setPreferredLightThemeName(name: string): void {
  localStorage.setItem(PREFERRED_LIGHT_THEME_KEY, name);
  notifyQuickSwapChanged();
}

export function setPreferredDarkThemeName(name: string): void {
  localStorage.setItem(PREFERRED_DARK_THEME_KEY, name);
  notifyQuickSwapChanged();
}

/** Whether the sidebar toggle should learn from recent picks instead of fixed choices. Defaults to true. */
export function getRememberThemeChoices(): boolean {
  const stored = localStorage.getItem(REMEMBER_THEME_CHOICES_KEY);
  return stored === null ? true : stored === 'true';
}

export function setRememberThemeChoices(value: boolean): void {
  localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, String(value));
  notifyQuickSwapChanged();
}

/** Master switch for the quick-swap feature. Defaults to true. */
export function getQuickSwapEnabled(): boolean {
  const stored = localStorage.getItem(QUICK_SWAP_ENABLED_KEY);
  return stored === null ? true : stored === 'true';
}

export function setQuickSwapEnabled(value: boolean): void {
  localStorage.setItem(QUICK_SWAP_ENABLED_KEY, String(value));
  notifyQuickSwapChanged();
}

/**
 * Re-renders the calling component whenever any quick-swap setting changes.
 *
 * A monotonically increasing revision is used instead of tracking a specific
 * value so that every quick-swap event forces a render, even when a single
 * tracked value (such as the enabled flag) stays the same. This lets consumers
 * re-read derived values (e.g. preferred theme names) on any change.
 */
export function useQuickSwapSettingsRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const handler = () => setRevision(r => r + 1);
    window.addEventListener(QUICK_SWAP_EVENT, handler);
    return () => window.removeEventListener(QUICK_SWAP_EVENT, handler);
  }, []);
  return revision;
}

/** Reactive read of the master quick-swap flag. */
export function useQuickSwapEnabled(): boolean {
  // Re-render on every quick-swap change, then read the current flag fresh.
  useQuickSwapSettingsRevision();
  return getQuickSwapEnabled();
}

/**
 * Persists the theme as the preferred choice for its base when the "remember" mode is active.
 * Call this alongside `dispatch(setTheme(...))` from any theme-picker UI.
 */
export function rememberThemeChoiceIfEnabled(theme: AppTheme): void {
  if (!getQuickSwapEnabled() || !getRememberThemeChoices()) {
    return;
  }
  if (isDarkTheme(theme)) {
    setPreferredDarkThemeName(theme.name);
  } else {
    setPreferredLightThemeName(theme.name);
  }
}

/**
 * Picks a preferred theme name, falling back to any theme with the right base
 * if the stored preference is missing or no longer registered.
 */
function resolvePreferredThemeName(
  themes: AppTheme[],
  storedName: string,
  wantDark: boolean,
  fallbackDefault: string
): string {
  const match = themes.find(t => t.name === storedName && isDarkTheme(t) === wantDark);
  if (match) {
    return match.name;
  }
  const anyOfKind = themes.find(t => isDarkTheme(t) === wantDark);
  return anyOfKind?.name ?? fallbackDefault;
}

/**
 * Sidebar button that flips between the user's preferred light and dark themes.
 */
export default function ThemeToggleButton() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const appThemes = useAppThemes();
  const forceTheme = useTypedSelector(state => state.config.forceTheme);
  const quickSwapEnabled = useQuickSwapEnabled();
  const { t } = useTranslation();

  if (forceTheme || !quickSwapEnabled) {
    return null;
  }

  const isDark = theme.palette.mode === 'dark';
  const nextThemeName = isDark
    ? resolvePreferredThemeName(
        appThemes,
        getPreferredLightThemeName(),
        false,
        DEFAULT_LIGHT_THEME_NAME
      )
    : resolvePreferredThemeName(
        appThemes,
        getPreferredDarkThemeName(),
        true,
        DEFAULT_DARK_THEME_NAME
      );

  const description = isDark
    ? t('translation|Switch to light mode')
    : t('translation|Switch to dark mode');

  return (
    <ActionButton
      iconButtonProps={{
        size: 'small',
        sx: t => ({
          color: t.palette.sidebar.color,
        }),
      }}
      onClick={() => {
        dispatch(setTheme(nextThemeName));
      }}
      icon="mdi:theme-light-dark"
      description={description}
    />
  );
}
