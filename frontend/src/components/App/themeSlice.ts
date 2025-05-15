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
import { getThemeName, setTheme as setAppTheme } from '../../lib/themes';
import { AppLogoType } from './AppLogo';

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
}

const headlampClassicLightTheme: AppTheme = {
  name: 'Headlamp Classic',
  primary: '#222',
  secondary: '#eaeaea',
  sidebar: {
    background: '#242424',
    color: '#FFF',
    selectedBackground: '#ebe811',
    selectedColor: '#ebe811',
    actionBackground: '#605e5c',
  },
  navbar: {
    background: '#FFF',
    color: '#202020',
  },
  radius: 4,
};

export const darkTheme: AppTheme = {
  name: 'dark',
  base: 'dark',
  primary: '#ffffff',
  secondary: '#1b1a19',
  text: {
    primary: '#faf9f8',
  },
  background: {
    default: '#292827',
    surface: '#313131',
    muted: '#333333',
  },
  navbar: {
    background: '#252423',
    color: '#faf9f8',
  },
  sidebar: {
    background: '#252423',
    color: '#cdcdcd',
    selectedBackground: '#f2e600',
    selectedColor: '#f2e600',
    actionBackground: '#1b1a19',
  },
  buttonTextTransform: 'none',
  radius: 6,
};

export const lightTheme: AppTheme = {
  name: 'light',
  primary: '#414141',
  secondary: '#eff2f5',
  text: {
    primary: '#44444f',
  },
  background: {
    muted: '#f5f5f5',
  },
  sidebar: {
    background: '#f0f0f0',
    color: '#605e5c',
    selectedBackground: '#f2e600',
    selectedColor: '#292827',
    actionBackground: '#414141',
  },
  navbar: {
    background: '#f0f0f0',
    color: '#292827',
  },
  buttonTextTransform: 'none',
  radius: 6,
};

const defaultAppThemes = [lightTheme, darkTheme, headlampClassicLightTheme];

export const initialState: ThemeState = {
  logo: null,
  name: getThemeName(),
  appThemes: defaultAppThemes,
};

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
    addCustomAppTheme(state, action: PayloadAction<AppTheme>) {
      state.appThemes = state.appThemes.filter(it => it.name !== action.payload.name);
      state.appThemes.push(action.payload);
    },
    /** Checks if the selected theme name doesn't exist anymore and sets a fallback */
    ensureValidThemeName(state) {
      const existingTheme = state.appThemes.find(it => it.name === state.name);
      if (!existingTheme) {
        // Remove cached theme name so that getThemeName returns theme that
        // preferred by OS and not the cached name
        setAppTheme('');
        const defaultThemeName = getThemeName();
        state.name = defaultThemeName;
        setAppTheme(defaultThemeName);
      }
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
    try {
      const cachedTheme = JSON.parse(localStorage.getItem(currentThemeCacheKey) ?? '') as
        | AppTheme
        | undefined;

      if (cachedTheme && cachedTheme?.name === themeName) {
        currentTheme = cachedTheme;
      }
    } catch (e) {}
  }

  return currentTheme ?? defaultAppThemes[0];
};

export const { setBrandingAppLogoComponent, setTheme } = themeSlice.actions;
export { themeSlice };
export default themeSlice.reducer;
