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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { AppTheme } from '../../lib/AppTheme';
import { useTypedSelector } from '../../redux/hooks';
import { setTheme, useAppThemes } from '../App/themeSlice';
import ActionButton from '../common/ActionButton';

const PREFERRED_LIGHT_THEME_KEY = 'headlampPreferredLightTheme';
const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';
const QUICK_SWAP_ENABLED_KEY = 'headlampQuickSwapEnabled';

/** Fired whenever any quick-swap setting is written, so subscribers can re-render. */
const QUICK_SWAP_EVENT = 'headlamp:quick-swap-settings-changed';

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

/** Reactive read of the master quick-swap flag. */
export function useQuickSwapEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => getQuickSwapEnabled());
  useEffect(() => {
    const handler = () => setEnabled(getQuickSwapEnabled());
    window.addEventListener(QUICK_SWAP_EVENT, handler);
    return () => window.removeEventListener(QUICK_SWAP_EVENT, handler);
  }, []);
  return enabled;
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

/**
 * "Quick swap theme" settings block: master enable, remember-vs-custom mode toggles,
 * and preferred light/dark dropdowns used when custom mode is on.
 */
export function PreferredThemeSelectors() {
  const { t } = useTranslation(['translation']);
  const appThemes = useAppThemes();
  const forceTheme = useTypedSelector(state => state.config.forceTheme);
  const lightThemes = appThemes.filter(isLightTheme);
  const darkThemes = appThemes.filter(isDarkTheme);

  const [preferredLight, setPreferredLight] = useState<string>(() => getPreferredLightThemeName());
  const [preferredDark, setPreferredDark] = useState<string>(() => getPreferredDarkThemeName());
  const [rememberEnabled, setRememberEnabled] = useState<boolean>(() => getRememberThemeChoices());
  const [quickSwapOn, setQuickSwapOn] = useState<boolean>(() => getQuickSwapEnabled());

  // Fall back to a valid option if the stored preference no longer exists.
  useEffect(() => {
    if (lightThemes.length > 0 && !lightThemes.find(t => t.name === preferredLight)) {
      const fallback = lightThemes[0].name;
      setPreferredLight(fallback);
      setPreferredLightThemeName(fallback);
    }
  }, [lightThemes, preferredLight]);

  useEffect(() => {
    if (darkThemes.length > 0 && !darkThemes.find(t => t.name === preferredDark)) {
      const fallback = darkThemes[0].name;
      setPreferredDark(fallback);
      setPreferredDarkThemeName(fallback);
    }
  }, [darkThemes, preferredDark]);

  const handleLightChange = (event: SelectChangeEvent<string>) => {
    const name = event.target.value;
    setPreferredLight(name);
    setPreferredLightThemeName(name);
  };

  const handleDarkChange = (event: SelectChangeEvent<string>) => {
    const name = event.target.value;
    setPreferredDark(name);
    setPreferredDarkThemeName(name);
  };

  // The two modes are mutually exclusive; enabling one turns the other off.
  const setMode = (remember: boolean) => {
    setRememberEnabled(remember);
    setRememberThemeChoices(remember);
  };

  const disabled = !!forceTheme;
  const featureOff = disabled || !quickSwapOn;
  const customEnabled = !rememberEnabled;
  const lightLabelId = 'preferred-light-mode-label';
  const darkLabelId = 'preferred-dark-mode-label';
  const rememberLabelId = 'remember-theme-choices-label';
  const customLabelId = 'custom-quick-theme-choices-label';
  const quickSwapLabelId = 'quick-swap-theme-label';

  const handleQuickSwapToggle = (value: boolean) => {
    setQuickSwapOn(value);
    setQuickSwapEnabled(value);
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          {t('translation|Quick swap theme')}
        </Typography>
        <FormControlLabel
          sx={{ ml: 0 }}
          control={
            <Switch
              color="primary"
              checked={quickSwapOn}
              disabled={disabled}
              onChange={e => handleQuickSwapToggle(e.target.checked)}
              inputProps={{ 'aria-labelledby': quickSwapLabelId }}
            />
          }
          label={
            <span id={quickSwapLabelId}>
              {quickSwapOn ? t('translation|Enabled') : t('translation|Disabled')}
            </span>
          }
        />
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          opacity: featureOff || !rememberEnabled ? 0.6 : 1,
        }}
      >
        <FormControlLabel
          control={
            <Switch
              color="primary"
              checked={rememberEnabled}
              disabled={featureOff}
              onChange={() => setMode(true)}
              inputProps={{ 'aria-labelledby': rememberLabelId }}
            />
          }
          label={<span id={rememberLabelId}>{t('translation|Remember theme choices')}</span>}
        />
        <Tooltip
          title={t(
            'translation|Remember your choices for light and dark themes you used recently and allow swapping between those'
          )}
        >
          <Box
            component="span"
            sx={{ display: 'inline-flex', color: 'text.secondary' }}
            aria-label={t('translation|More info')}
          >
            <Icon icon="mdi:information-outline" width={18} />
          </Box>
        </Tooltip>
      </Box>

      <Box sx={{ opacity: featureOff || !customEnabled ? 0.6 : 1 }}>
        <FormControlLabel
          control={
            <Switch
              color="primary"
              checked={customEnabled}
              disabled={featureOff}
              onChange={() => setMode(false)}
              inputProps={{ 'aria-labelledby': customLabelId }}
            />
          }
          label={<span id={customLabelId}>{t('translation|Custom quick theme choices')}</span>}
        />
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            mt: 1,
            ml: 4,
          }}
        >
          <FormControl
            sx={{ minWidth: 220 }}
            size="small"
            disabled={featureOff || !customEnabled || lightThemes.length === 0}
          >
            <InputLabel id={lightLabelId}>{t('translation|Preferred Light mode')}</InputLabel>
            <Select
              labelId={lightLabelId}
              value={preferredLight}
              label={t('translation|Preferred Light mode')}
              onChange={handleLightChange}
            >
              {lightThemes.map(it => (
                <MenuItem key={it.name} value={it.name}>
                  {it.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl
            sx={{ minWidth: 220 }}
            size="small"
            disabled={featureOff || !customEnabled || darkThemes.length === 0}
          >
            <InputLabel id={darkLabelId}>{t('translation|Preferred Dark mode')}</InputLabel>
            <Select
              labelId={darkLabelId}
              value={preferredDark}
              label={t('translation|Preferred Dark mode')}
              onChange={handleDarkChange}
            >
              {darkThemes.map(it => (
                <MenuItem key={it.name} value={it.name}>
                  {it.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>
    </Box>
  );
}
