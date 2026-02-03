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

import React from 'react';
import { AppLogoProps, AppLogoType } from './AppLogo';
import themeReducer, {
  applyBackendThemeConfig,
  initialState,
  setBrandingAppLogoComponent,
  setTheme,
} from './themeSlice';

describe('themeSlice', () => {
  it('should handle initial state', () => {
    expect(themeReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('should handle setBrandingAppLogoComponent', () => {
    const MockComponent: React.ComponentType<AppLogoProps> = (props: AppLogoProps) => (
      <div {...props} />
    );
    const logo: AppLogoType = MockComponent;
    const actual = themeReducer(initialState, setBrandingAppLogoComponent(logo));
    expect(actual.logo).toEqual(logo);
  });

  it('should handle setTheme', () => {
    const themeName = 'dark';
    const actual = themeReducer(initialState, setTheme(themeName));
    expect(actual.name).toEqual(themeName);
  });

  describe('applyBackendThemeConfig', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should apply forced theme and override current theme', () => {
      const state = { ...initialState, name: 'light' };
      const actual = themeReducer(state, applyBackendThemeConfig({ forceTheme: 'corporate' }));
      expect(actual.name).toEqual('corporate');
    });

    it('should clear localStorage preference when forced theme is applied', () => {
      localStorage.setItem('headlampThemePreference', 'dark');
      const state = { ...initialState, name: 'light' };
      themeReducer(state, applyBackendThemeConfig({ forceTheme: 'corporate' }));
      expect(localStorage.getItem('headlampThemePreference')).toBeNull();
    });

    it('should not update state if theme has not changed', () => {
      const state = { ...initialState, name: 'corporate' };
      const actual = themeReducer(state, applyBackendThemeConfig({ forceTheme: 'corporate' }));
      expect(actual.name).toEqual('corporate');
    });

    it('should persist to localStorage when theme is not forced', () => {
      const state = { ...initialState, name: 'old-theme' };
      const config = { defaultLightTheme: 'solarized-light' };
      const actual = themeReducer(state, applyBackendThemeConfig(config));
      // Theme changed, so it should be persisted via setTheme (property assignment)
      if (actual.name !== state.name) {
        expect(localStorage.headlampThemePreference).toEqual(actual.name);
      }
    });
  });
});
