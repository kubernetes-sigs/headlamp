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
import { vi } from 'vitest';
import {
  AUTOMATIC_THEME_PREFERENCE_KEY,
  getThemeName,
  PREFERRED_DARK_THEME_KEY,
  PREFERRED_LIGHT_THEME_KEY,
} from '../../lib/themes';
import { AppLogoProps, AppLogoType } from './AppLogo';
import { darkTheme } from './defaultAppThemes';
import themeReducer, {
  applyBackendThemeConfig,
  applySystemTheme,
  ensureValidThemeName,
  initialState,
  reapplyThemePreferences,
  setBrandingAppLogoComponent,
  setPluginDefaultTheme,
  setTheme,
  themeSlice,
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
    const themeName = darkTheme.name;
    const actual = themeReducer(initialState, setTheme(themeName));
    expect(actual.name).toEqual(themeName);
  });

  describe('applySystemTheme', () => {
    const ready = { ...initialState, backendConfigReady: true };
    const configured = { defaultLightTheme: 'Monochrome Light', defaultDarkTheme: 'Dark' };

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('sets the theme without recording it as an explicit choice', () => {
      const actual = themeReducer(ready, applySystemTheme('Lights Out'));

      expect(actual.name).toEqual('Lights Out');
      expect(localStorage.getItem(AUTOMATIC_THEME_PREFERENCE_KEY)).toEqual('Lights Out');
    });

    it('keeps the theme across backend config refreshes', () => {
      const applied = themeReducer(ready, applySystemTheme('Lights Out'));
      const actual = themeReducer(applied, applyBackendThemeConfig(configured));

      expect(actual.name).toEqual('Lights Out');
      expect(getThemeName(configured)).toEqual('Lights Out');
    });

    it('lets a forced theme take precedence', () => {
      const applied = themeReducer(ready, applySystemTheme('Lights Out'));
      const actual = themeReducer(
        applied,
        applyBackendThemeConfig({ ...configured, forceTheme: 'corporate' })
      );

      expect(actual.name).toEqual('corporate');
    });

    it('gives way to changed quick swap themes', () => {
      const applied = themeReducer(ready, applySystemTheme('Lights Out'));
      // Saved for both modes so the result doesn't depend on the OS color scheme.
      localStorage.setItem(PREFERRED_LIGHT_THEME_KEY, 'Monochrome Light');
      localStorage.setItem(PREFERRED_DARK_THEME_KEY, 'Monochrome Light');
      const actual = themeReducer(applied, reapplyThemePreferences(configured));

      expect(actual.name).toEqual('Monochrome Light');
    });
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

    it('should preserve localStorage preference when forced theme is applied', () => {
      localStorage.setItem('headlampThemePreference', 'dark');
      const state = { ...initialState, name: 'light' };
      themeReducer(state, applyBackendThemeConfig({ forceTheme: 'corporate' }));
      expect(localStorage.getItem('headlampThemePreference')).toEqual('dark');
    });

    it('should not update state if theme has not changed', () => {
      const state = { ...initialState, name: 'corporate' };
      const actual = themeReducer(state, applyBackendThemeConfig({ forceTheme: 'corporate' }));
      expect(actual.name).toEqual('corporate');
    });

    it('should not store a backend default as a user preference', () => {
      // setupTests defines matchMedia with writable:true so direct assignment works;
      // Object.defineProperty with configurable:true would throw on a non-configurable property.
      (window as any).matchMedia = vi.fn((query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
      }));
      const state = { ...initialState, name: 'old-theme' };
      const actual = themeReducer(
        state,
        applyBackendThemeConfig({ defaultLightTheme: 'Monochrome Light' })
      );
      expect(actual.name).toEqual('Monochrome Light');
      expect(localStorage.headlampThemePreference).toBeUndefined();
    });

    it('should prefer a pending plugin default over a backend default', () => {
      (window as any).matchMedia = vi.fn((query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
      }));
      const pending = themeReducer(initialState, setPluginDefaultTheme('product'));
      const actual = themeReducer(
        pending,
        applyBackendThemeConfig({ defaultLightTheme: 'backend' })
      );

      expect(actual.name).toEqual('product');
      expect(localStorage.headlampThemePreference).toEqual('product');
    });

    it('should prefer a forced theme over a pending plugin default', () => {
      const pending = themeReducer(initialState, setPluginDefaultTheme('product'));
      const actual = themeReducer(pending, applyBackendThemeConfig({ forceTheme: 'corporate' }));

      expect(actual.name).toEqual('corporate');
      expect(localStorage.headlampThemePreference).toBeUndefined();
    });
  });

  describe('themes saved for quick swap', () => {
    const configured = { defaultLightTheme: 'Monochrome Light', defaultDarkTheme: 'Lights Out' };

    beforeEach(() => {
      localStorage.clear();
      (window as any).matchMedia = vi.fn((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
      }));
    });

    it('applies the saved dark theme instead of the backend default', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const actual = themeReducer(initialState, applyBackendThemeConfig(configured));
      expect(actual.name).toEqual('Dark');
    });

    it('applies the saved dark theme instead of a pending plugin default', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const pending = themeReducer(initialState, setPluginDefaultTheme('product'));
      const actual = themeReducer(pending, applyBackendThemeConfig(configured));
      expect(actual.name).toEqual('Dark');
    });

    it('does not let a plugin default replace the saved theme after config loads', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const configuredState = themeReducer(initialState, applyBackendThemeConfig(configured));
      const actual = themeReducer(configuredState, setPluginDefaultTheme('product'));
      expect(actual.name).toEqual('Dark');
      expect(localStorage.headlampThemePreference).toBeUndefined();
    });

    it('uses the backend default while the saved theme is not registered', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Plugin Dark');
      const actual = themeReducer(initialState, applyBackendThemeConfig(configured));
      expect(actual.name).toEqual('Lights Out');
    });

    it('re-applies a newly saved theme only after the backend config is applied', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const beforeConfig = themeReducer(
        { ...initialState, name: 'Light' },
        reapplyThemePreferences(configured)
      );
      expect(beforeConfig.name).toEqual('Light');
      expect(beforeConfig.backendConfigReady).toBe(false);

      localStorage.removeItem('headlampPreferredDarkTheme');
      const configuredState = themeReducer(initialState, applyBackendThemeConfig(configured));
      expect(configuredState.name).toEqual('Lights Out');

      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const actual = themeReducer(configuredState, reapplyThemePreferences(configured));
      expect(actual.name).toEqual('Dark');
    });

    it('keeps a forced theme when re-applying saved themes', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const forced = themeReducer(
        initialState,
        applyBackendThemeConfig({ ...configured, forceTheme: 'corporate' })
      );
      const actual = themeReducer(forced, reapplyThemePreferences(configured));
      expect(actual.name).toEqual('corporate');
      expect(actual.forceTheme).toEqual('corporate');
    });

    it('falls back to a built-in theme when the active and saved themes are missing', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Plugin Dark');
      const state = { ...initialState, name: 'Plugin Dark' };
      const actual = themeReducer(state, ensureValidThemeName());
      expect(actual.name).toEqual('Dark');
    });

    it('applies a dropdown choice made after a plugin default is applied', () => {
      const configuredState = themeReducer(initialState, applyBackendThemeConfig(configured));
      const withDefault = themeReducer(configuredState, setPluginDefaultTheme('product'));
      expect(withDefault.name).toEqual('product');

      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const actual = themeReducer(withDefault, reapplyThemePreferences(configured));

      expect(actual.name).toEqual('Dark');
      expect(getThemeName(configured, actual.appThemes)).toEqual('Dark');
    });

    it('applies a saved theme that registers after the plugin default', () => {
      localStorage.setItem('headlampPreferredDarkTheme', 'Plugin Dark');
      const configuredState = themeReducer(initialState, applyBackendThemeConfig(configured));
      const withDefault = themeReducer(configuredState, setPluginDefaultTheme('product'));
      expect(withDefault.name).toEqual('product');

      const registered = themeReducer(
        withDefault,
        themeSlice.actions.addCustomAppTheme({ name: 'Plugin Dark', base: 'dark' })
      );
      const actual = themeReducer(registered, applyBackendThemeConfig(configured));

      expect(actual.name).toEqual('Plugin Dark');
      expect(getThemeName(configured, actual.appThemes)).toEqual('Plugin Dark');
    });

    it('keeps an explicitly selected theme that matches the plugin default', () => {
      const selected = themeReducer(initialState, setTheme('product'));
      const withDefault = themeReducer(selected, setPluginDefaultTheme('product'));
      const configuredState = themeReducer(withDefault, applyBackendThemeConfig(configured));

      localStorage.setItem('headlampPreferredDarkTheme', 'Dark');
      const actual = themeReducer(configuredState, reapplyThemePreferences(configured));

      expect(actual.name).toEqual('product');
      expect(getThemeName(configured, actual.appThemes)).toEqual('product');
    });

    it('does not keep a fallback for a missing theme as the user selection', () => {
      localStorage.setItem('headlampThemePreference', 'Removed Plugin Theme');
      const state = { ...initialState, name: 'Removed Plugin Theme', backendConfigReady: true };
      const fallback = themeReducer(state, ensureValidThemeName());
      expect(fallback.name).toEqual('Dark');

      localStorage.setItem('headlampPreferredDarkTheme', 'Lights Out');
      const actual = themeReducer(fallback, reapplyThemePreferences({}));

      expect(actual.name).toEqual('Lights Out');
    });
  });
});
