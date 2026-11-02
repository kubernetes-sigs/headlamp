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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import { AppTheme } from '../../lib/AppTheme';
import {
  clearSystemTheme,
  getThemeName,
  getUserSelectedThemeName,
  setAutomaticTheme,
  setSystemTheme,
  setTheme as setAppTheme,
} from '../../lib/themes';
import { AppLogoType } from './AppLogo';
import defaultAppThemes from './defaultAppThemes';
export interface ThemeState {
  /**
   * The logo component to use for the app.
   */
  logo: AppLogoType;
  /**
   * The name of the active theme.
   */
  name: string;
  /** List of all custom App Themes */
  appThemes: AppTheme[];
  pluginDefault?: string;
  backendConfigReady: boolean;
  forceTheme?: string;
}

export const initialState: ThemeState = {
  logo: null,
  name: getThemeName(),
  appThemes: defaultAppThemes,
  backendConfigReady: false,
};

interface BackendThemeConfig {
  defaultLightTheme?: string;
  defaultDarkTheme?: string;
  forceTheme?: string;
}

/** Picks the active theme from the forced theme, user choices, plugin default and config. */
function updateThemeName(state: ThemeState, backendConfig: BackendThemeConfig) {
  const pluginDefault =
    !backendConfig.forceTheme && !getUserSelectedThemeName(state.appThemes)
      ? state.pluginDefault
      : undefined;
  const registeredDefault = (name?: string) =>
    state.appThemes.some(theme => theme.name === name) ? name : undefined;
  const newThemeName =
    pluginDefault ||
    getThemeName(
      {
        ...backendConfig,
        defaultLightTheme: registeredDefault(backendConfig.defaultLightTheme),
        defaultDarkTheme: registeredDefault(backendConfig.defaultDarkTheme),
      },
      state.appThemes
    );

  if (pluginDefault) {
    setAutomaticTheme(pluginDefault);
  }

  // Only update if theme has changed
  if (newThemeName !== state.name) {
    state.name = newThemeName;
  }
}

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    /**
     * Sets the logo component to use for the app.
     */
    setBrandingAppLogoComponent(state, action: PayloadAction<AppLogoType>) {
      state.logo = action.payload;
    },
    /**
     * Sets the theme name of the application.
     */
    setTheme(state, action: PayloadAction<string>) {
      state.name = action.payload;
      setAppTheme(state.name);
    },
    /**
     * Sets a theme chosen by the system (such as following the OS appearance) rather than by
     * the user. It isn't recorded as an explicit choice, so later quick swap choices still
     * apply, but it is kept across config refreshes once following is turned off.
     */
    applySystemTheme(state, action: PayloadAction<string>) {
      state.name = action.payload;
      setSystemTheme(action.payload);
    },
    addCustomAppTheme(state, action: PayloadAction<AppTheme>) {
      state.appThemes = state.appThemes.filter(it => it.name !== action.payload.name);
      state.appThemes.push(action.payload);
    },
    setPluginDefaultTheme(state, action: PayloadAction<string>) {
      if (state.pluginDefault) {
        return;
      }

      state.pluginDefault = action.payload;
      if (
        state.backendConfigReady &&
        !state.forceTheme &&
        !getUserSelectedThemeName(state.appThemes)
      ) {
        state.name = action.payload;
        setAutomaticTheme(action.payload);
      }
    },
    /** Checks if the selected theme name doesn't exist anymore and sets a fallback */
    ensureValidThemeName(state) {
      const existingTheme = state.appThemes.find(it => it.name === state.name);
      if (!existingTheme) {
        // Remove cached theme name so that getThemeName returns theme that
        // preferred by OS and not the cached name
        setAppTheme('');
        const defaultThemeName = getThemeName(undefined, state.appThemes);
        state.name = defaultThemeName;
        setAutomaticTheme(defaultThemeName);
      }
    },
    /**
     * Applies backend theme configuration if set.
     * Should be called after config is loaded from backend.
     */
    applyBackendThemeConfig(state, action: PayloadAction<BackendThemeConfig>) {
      const backendConfig = action.payload;
      state.backendConfigReady = true;
      state.forceTheme = backendConfig.forceTheme;
      updateThemeName(state, backendConfig);
    },
    /**
     * Re-evaluates the active theme after the user's saved theme choices change (for example
     * the quick swap light/dark themes), using the backend configuration already applied.
     * A theme kept from following the system appearance gives way to the changed choices.
     * Only re-evaluates once the backend configuration has been applied.
     */
    reapplyThemePreferences(state, action: PayloadAction<Omit<BackendThemeConfig, 'forceTheme'>>) {
      clearSystemTheme();
      if (!state.backendConfigReady) {
        return;
      }
      updateThemeName(state, { ...action.payload, forceTheme: state.forceTheme });
    },
  },
});

export const useAppThemes = (): AppTheme[] => {
  return useSelector((state: any) => state.theme.appThemes);
};

const currentThemeCacheKey = 'cached-current-theme';

export const useCurrentAppTheme = () => {
  let themeName = useSelector((state: any) => state.theme.name);
  if (!themeName) {
    themeName = getThemeName();
  }
  const allThemes = useAppThemes();

  let currentTheme = allThemes.find(it => it.name === themeName);

  if (currentTheme) {
    localStorage.setItem(currentThemeCacheKey, JSON.stringify(currentTheme));
  } else {
    // Try to load cached theme
    const cachedThemeRaw = localStorage.getItem(currentThemeCacheKey);
    if (cachedThemeRaw) {
      try {
        const cachedTheme = JSON.parse(cachedThemeRaw) as AppTheme | undefined;

        if (cachedTheme && cachedTheme?.name === themeName) {
          currentTheme = cachedTheme;
        }
      } catch (e) {
        console.debug('Failed to parse cached theme from localStorage:', e);
      }
    }
  }

  return currentTheme ?? defaultAppThemes[0];
};

export const {
  setBrandingAppLogoComponent,
  setTheme,
  applySystemTheme,
  applyBackendThemeConfig,
  reapplyThemePreferences,
  ensureValidThemeName,
  setPluginDefaultTheme,
} = themeSlice.actions;
export { themeSlice };
export default themeSlice.reducer;
