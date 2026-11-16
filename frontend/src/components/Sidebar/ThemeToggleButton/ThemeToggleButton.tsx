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
import {
  FOLLOW_SYSTEM_APPEARANCE_KEY,
  PREFERRED_DARK_THEME_KEY,
  PREFERRED_LIGHT_THEME_KEY,
  QUICK_SWAP_ENABLED_KEY,
  REMEMBER_THEME_CHOICES_KEY,
} from '../../../lib/themes';
import { useTypedSelector } from '../../../redux/hooks';
import { setTheme, useAppThemes } from '../../App/themeSlice';
import ActionButton from '../../common/ActionButton';

/** Fired whenever any quick-swap setting is written, so subscribers can re-render. */
export const QUICK_SWAP_EVENT = 'headlamp:quick-swap-settings-changed';

function notifyQuickSwapChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(QUICK_SWAP_EVENT));
  }
}

/** Fallback names used when the user hasn't picked a preferred theme and none is configured. */
export const DEFAULT_LIGHT_THEME_NAME = 'Light';
export const DEFAULT_DARK_THEME_NAME = 'Dark';

/** Theme registered by AKS desktop; always light, and the default light choice when present. */
export const AZURE_THEME_NAME = 'Azure Theme';

/**
 * A theme is treated as dark only when it explicitly declares `base: 'dark'`.
 * The Azure theme is always treated as light.
 */
export function isDarkTheme(theme: AppTheme): boolean {
  if (theme.name === AZURE_THEME_NAME) {
    return false;
  }
  return theme.base === 'dark';
}

export function isLightTheme(theme: AppTheme): boolean {
  return !isDarkTheme(theme);
}

/** Default light theme: the Azure theme when registered, otherwise the built-in Light theme. */
export function getDefaultLightThemeName(themes: AppTheme[] = []): string {
  return themes.some(t => t.name === AZURE_THEME_NAME)
    ? AZURE_THEME_NAME
    : DEFAULT_LIGHT_THEME_NAME;
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
 * Whether the active theme follows the system's light/dark appearance, using the quick swap
 * light and dark themes. Works independently of the quick swap switch. Defaults to false.
 */
export function getFollowSystemAppearance(): boolean {
  return localStorage.getItem(FOLLOW_SYSTEM_APPEARANCE_KEY) === 'true';
}

export function setFollowSystemAppearance(value: boolean): void {
  localStorage.setItem(FOLLOW_SYSTEM_APPEARANCE_KEY, String(value));
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
    const storageHandler = (event: StorageEvent) => {
      const quickSwapKeys = [
        PREFERRED_LIGHT_THEME_KEY,
        PREFERRED_DARK_THEME_KEY,
        REMEMBER_THEME_CHOICES_KEY,
        QUICK_SWAP_ENABLED_KEY,
        FOLLOW_SYSTEM_APPEARANCE_KEY,
      ];
      if (
        event.storageArea === window.localStorage &&
        (event.key === null || quickSwapKeys.includes(event.key))
      ) {
        handler();
      }
    };
    window.addEventListener(QUICK_SWAP_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(QUICK_SWAP_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);
  return revision;
}

/** Reactive read of the master quick-swap flag. */
export function useQuickSwapEnabled(): boolean {
  // Re-render on every quick-swap change, then read the current flag fresh.
  useQuickSwapSettingsRevision();
  return getQuickSwapEnabled();
}

/** Reactive read of the "Follow system appearance" flag. */
export function useFollowSystemAppearance(): boolean {
  useQuickSwapSettingsRevision();
  return getFollowSystemAppearance();
}

/**
 * Persists the theme as the preferred choice for its base when the "remember" mode is active,
 * or when following the system appearance (where the light/dark pair is what gets shown).
 * Call this alongside `dispatch(setTheme(...))` from any theme-picker UI.
 */
export function rememberThemeChoiceIfEnabled(theme: AppTheme): void {
  const remember = getQuickSwapEnabled() && getRememberThemeChoices();
  if (!remember && !getFollowSystemAppearance()) {
    return;
  }
  if (isDarkTheme(theme)) {
    setPreferredDarkThemeName(theme.name);
  } else {
    setPreferredLightThemeName(theme.name);
  }
}

/**
 * Returns the first candidate that is registered with the right base, falling back
 * to any theme of that base, and finally to the last (built-in) candidate.
 */
function resolvePreferredThemeName(
  themes: AppTheme[],
  wantDark: boolean,
  candidates: Array<string | null | undefined>
): string {
  const names = candidates.filter((name): name is string => !!name);
  for (const name of names) {
    const match = themes.find(t => t.name === name && isDarkTheme(t) === wantDark);
    if (match) {
      return match.name;
    }
  }
  const anyOfKind = themes.find(t => isDarkTheme(t) === wantDark);
  return anyOfKind?.name ?? names[names.length - 1];
}

/**
 * The light theme quick swap will switch to: the user's stored preference, then the
 * configured default (`--default-light-theme`), then the built-in default. The stored
 * preference is never overwritten here, so a plugin theme that registers later is
 * picked up again.
 */
export function resolvePreferredLightThemeName(
  themes: AppTheme[],
  configuredDefault?: string
): string {
  return resolvePreferredThemeName(themes, false, [
    localStorage.getItem(PREFERRED_LIGHT_THEME_KEY),
    configuredDefault,
    getDefaultLightThemeName(themes),
  ]);
}

/**
 * The dark theme quick swap will switch to; see `resolvePreferredLightThemeName`.
 * The configured default comes from `--default-dark-theme`.
 */
export function resolvePreferredDarkThemeName(
  themes: AppTheme[],
  configuredDefault?: string
): string {
  return resolvePreferredThemeName(themes, true, [
    localStorage.getItem(PREFERRED_DARK_THEME_KEY),
    configuredDefault,
    DEFAULT_DARK_THEME_NAME,
  ]);
}

/**
 * Sidebar button that flips between the user's preferred light and dark themes.
 */
export default function ThemeToggleButton() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const appThemes = useAppThemes();
  const currentThemeName = useTypedSelector(state => state.theme.name);
  const forceTheme = useTypedSelector(state => state.config.forceTheme);
  const configuredLight = useTypedSelector(state => state.config.defaultLightTheme);
  const configuredDark = useTypedSelector(state => state.config.defaultDarkTheme);
  const quickSwapEnabled = useQuickSwapEnabled();
  const followSystemAppearance = useFollowSystemAppearance();
  const { t } = useTranslation();

  // While following the system appearance, the OS setting picks light or dark instead.
  if (forceTheme || !quickSwapEnabled || followSystemAppearance) {
    return null;
  }

  const currentAppTheme = appThemes.find(t => t.name === currentThemeName);
  const isDark = currentAppTheme ? isDarkTheme(currentAppTheme) : theme.palette.mode === 'dark';
  const nextThemeName = isDark
    ? resolvePreferredLightThemeName(appThemes, configuredLight)
    : resolvePreferredDarkThemeName(appThemes, configuredDark);

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
