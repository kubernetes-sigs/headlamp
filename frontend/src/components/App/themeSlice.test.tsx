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
import { AppLogoProps, AppLogoType } from './AppLogo';
import { darkTheme } from './defaultAppThemes';
import themeReducer, {
  applyBackendThemeConfig,
  initialState,
  setBrandingAppLogoComponent,
  setPluginDefaultTheme,
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
    const themeName = darkTheme.name;
    const actual = themeReducer(initialState, setTheme(themeName));
    expect(actual.name).toEqual(themeName);
  });

  describe('applyBackendThemeConfig', () => {
    beforeEach(() => {
      localStorage.clear();
      // The mock's clear() only resets store; setTheme() writes localStorage.headlampThemePreference
      // as a direct property that survives clear(). Delete it explicitly so tests start clean.
      delete (localStorage as any).headlampThemePreference;
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
        applyBackendThemeConfig({ defaultLightTheme: 'solarized-light' })
      );
      expect(actual.name).toEqual('solarized-light');
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
});
