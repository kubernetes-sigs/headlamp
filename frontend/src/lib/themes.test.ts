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

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  darkTheme as builtInDarkTheme,
  lightTheme as builtInLightTheme,
} from '../components/App/defaultAppThemes';
import { AppTheme } from './AppTheme';
import {
  AUTOMATIC_THEME_PREFERENCE_KEY,
  createMuiTheme,
  getThemeName,
  getUserSelectedThemeName,
  PREFERRED_DARK_THEME_KEY,
  PREFERRED_LIGHT_THEME_KEY,
  setTheme,
  SYSTEM_THEME_PREFERENCE_KEY,
  usePrefersColorScheme,
} from './themes';

describe('themes.ts', () => {
  describe('createMuiTheme', () => {
    it('should create a light theme when base is light', () => {
      const lightTheme: AppTheme = { base: 'light', name: 'Light Theme' };
      const theme = createMuiTheme(lightTheme);
      expect(theme.palette.mode).toBe('light');
      expect(theme.palette.background.default).toBe('#fff');
    });

    it('should create a dark theme when base is dark', () => {
      const darkTheme: AppTheme = { base: 'dark', name: 'Dark Theme' };
      const theme = createMuiTheme(darkTheme);
      expect(theme.palette.mode).toBe('dark');
      expect(theme.palette.background.default).toBe('#1f1f1f');
    });

    it('should keep warning alerts readable in the dark theme', () => {
      const theme = createMuiTheme({ base: 'dark', name: 'Dark Theme' });

      expect(theme.components?.MuiAlert?.styleOverrides?.standardWarning).toEqual({
        backgroundColor: 'rgba(255, 152, 0, 0.12)',
        color: '#fff3e0',
        '& .MuiAlert-icon': {
          color: '#ffb74d',
        },
      });
    });

    it('should set searchHint defaults for light and dark themes', () => {
      const lightTheme = createMuiTheme({ base: 'light', name: 'Light Theme' });
      const darkTheme = createMuiTheme({ base: 'dark', name: 'Dark Theme' });

      expect(lightTheme.palette.navbar.searchHint).toBe('#74747B');
      expect(darkTheme.palette.navbar.searchHint).toBe('rgba(255, 255, 255, 0.7)');
    });

    it('should allow navbar searchHint override from AppTheme', () => {
      const customTheme: AppTheme = {
        base: 'dark',
        name: 'Custom Theme',
        navbar: {
          searchHint: '#123456',
        },
      };
      const theme = createMuiTheme(customTheme);

      expect(theme.palette.navbar.searchHint).toBe('#123456');
    });

    it('should allow secondary contrast text override from AppTheme', () => {
      const theme = createMuiTheme({
        base: 'light',
        name: 'Custom Theme',
        secondary: '#123456',
        secondaryContrastText: '#ffffff',
      });

      expect(theme.palette.secondary.contrastText).toBe('#ffffff');
    });

    it('should allow secondary contrast text override for dark themes', () => {
      const theme = createMuiTheme({
        base: 'dark',
        name: 'Custom Dark Theme',
        secondary: '#123456',
        secondaryContrastText: '#ffffff',
      });

      expect(theme.palette.secondary.contrastText).toBe('#ffffff');
    });

    it('should use black contrast text by default for custom secondary colors', () => {
      const theme = createMuiTheme({
        base: 'light',
        name: 'Custom Theme',
        secondary: '#123456',
      });

      expect(theme.palette.secondary.contrastText).toBe('#000');
    });
  });

  describe('getThemeName', () => {
    it('should return light theme by default', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      });

      expect(getThemeName()).toBe(builtInLightTheme.name);
    });

    it('should return dark theme if user prefers dark mode', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: dark)',
        })),
      });

      expect(getThemeName()).toBe(builtInDarkTheme.name);
    });

    it('should return the theme stored in localStorage', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: 'dark',
        clear: vi.fn(),
      });
      expect(getThemeName()).toBe('dark');
    });
  });

  describe('setTheme', () => {
    it('should set the theme in localStorage', () => {
      const mockLocalStorage = { headlampThemePreference: null, clear: vi.fn() };
      vi.stubGlobal('localStorage', mockLocalStorage);

      setTheme('dark');
      expect(mockLocalStorage.headlampThemePreference).toBe('dark');
    });
  });

  describe('usePrefersColorScheme', () => {
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
      vi.unstubAllGlobals();
      originalMatchMedia = window.matchMedia;
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      Object.defineProperty(window, 'matchMedia', {
        value: originalMatchMedia,
        writable: true,
        configurable: true,
      });
    });

    it('should return light when matchMedia is not supported', () => {
      Object.defineProperty(window, 'matchMedia', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const { result } = renderHook(() => usePrefersColorScheme());
      expect(result.current).toBe('light');
    });

    it('should return light when system prefers light', () => {
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockReturnValue({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        writable: true,
        configurable: true,
      });
      const { result } = renderHook(() => usePrefersColorScheme());
      expect(result.current).toBe('light');
    });

    it('should return dark when system prefers dark', () => {
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        writable: true,
        configurable: true,
      });
      const { result } = renderHook(() => usePrefersColorScheme());
      expect(result.current).toBe('dark');
    });

    it('should register and clean up the media query listener', () => {
      const addEventListener = vi.fn();
      const removeEventListener = vi.fn();
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockReturnValue({ matches: false, addEventListener, removeEventListener }),
        writable: true,
        configurable: true,
      });
      const { unmount } = renderHook(() => usePrefersColorScheme());

      expect(addEventListener).toHaveBeenCalledTimes(1);
      expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

      const handler = addEventListener.mock.calls[0][1];

      unmount();

      expect(removeEventListener).toHaveBeenCalledTimes(1);
      expect(removeEventListener).toHaveBeenCalledWith('change', handler);
    });

    it('should register and clean up the media query listener using fallback methods when addEventListener is not defined', () => {
      const addListener = vi.fn();
      const removeListener = vi.fn();
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockReturnValue({ matches: false, addListener, removeListener }),
        writable: true,
        configurable: true,
      });
      const { unmount } = renderHook(() => usePrefersColorScheme());

      expect(addListener).toHaveBeenCalledTimes(1);
      expect(addListener).toHaveBeenCalledWith(expect.any(Function));

      const handler = addListener.mock.calls[0][0];

      unmount();

      expect(removeListener).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledWith(handler);
    });
  });

  describe('getThemeName with backend configuration', () => {
    it('should use force theme when provided', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: 'light',
        clear: vi.fn(),
      });

      const backendConfig = {
        forceTheme: 'corporate-branded',
      };

      expect(getThemeName(backendConfig)).toBe('corporate-branded');
    });

    it('should prefer localStorage over backend defaults', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: 'dark',
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: light)',
        })),
      });

      const backendConfig = {
        defaultLightTheme: 'corporate-light',
      };

      expect(getThemeName(backendConfig)).toBe('dark');
    });

    it('should use backend default light theme when OS prefers light', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: light)',
        })),
      });

      const backendConfig = {
        defaultLightTheme: 'corporate-light',
      };

      expect(getThemeName(backendConfig)).toBe('corporate-light');
    });

    it('should use backend default dark theme when OS prefers dark', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: dark)',
        })),
      });

      const backendConfig = {
        defaultDarkTheme: 'corporate-dark',
      };

      expect(getThemeName(backendConfig)).toBe('corporate-dark');
    });

    it('should fall back to OS preference when no backend default matches', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: dark)',
        })),
      });

      const backendConfig = {
        defaultLightTheme: 'corporate-light',
      };

      expect(getThemeName(backendConfig)).toBe(builtInDarkTheme.name);
    });

    it('should handle both default themes with OS preference selection', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: light)',
        })),
      });

      const backendConfig = {
        defaultLightTheme: 'corporate-light',
        defaultDarkTheme: 'corporate-dark',
      };

      expect(getThemeName(backendConfig)).toBe('corporate-light');
    });

    it('should use force theme even with other defaults set', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });

      const backendConfig = {
        defaultLightTheme: 'corporate-light',
        defaultDarkTheme: 'corporate-dark',
        forceTheme: 'forced-corporate',
      };

      expect(getThemeName(backendConfig)).toBe('forced-corporate');
    });

    it('should work with plugin-provided theme names', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        getItem: vi.fn(() => null),
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: light)',
        })),
      });

      const backendConfig = {
        defaultLightTheme: 'my-custom-plugin-theme',
      };

      expect(getThemeName(backendConfig)).toBe('my-custom-plugin-theme');
    });
  });

  describe('getThemeName with themes saved for quick swap', () => {
    const backendConfig = {
      defaultLightTheme: 'corporate-light',
      defaultDarkTheme: 'corporate-dark',
    };

    function stubStorage(items: Record<string, string>, themePreference: string | null = null) {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: themePreference,
        getItem: vi.fn((key: string) => items[key] ?? null),
        clear: vi.fn(),
      });
    }

    function stubOsScheme(scheme: 'light' | 'dark' | 'none') {
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === `(prefers-color-scheme: ${scheme})`,
        })),
      });
    }

    const saved = {
      [PREFERRED_LIGHT_THEME_KEY]: 'my-light',
      [PREFERRED_DARK_THEME_KEY]: 'my-dark',
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('uses the saved dark theme over the backend default when the OS prefers dark', () => {
      stubStorage(saved);
      stubOsScheme('dark');
      expect(getThemeName(backendConfig)).toBe('my-dark');
    });

    it('uses the saved light theme over the backend default when the OS prefers light', () => {
      stubStorage(saved);
      stubOsScheme('light');
      expect(getThemeName(backendConfig)).toBe('my-light');
    });

    it('uses the saved light theme when the OS reports no preference', () => {
      stubStorage(saved);
      stubOsScheme('none');
      expect(getThemeName(backendConfig)).toBe('my-light');
    });

    it('keeps the backend default for a mode with no saved theme', () => {
      stubStorage({ [PREFERRED_LIGHT_THEME_KEY]: 'my-light' });
      stubOsScheme('dark');
      expect(getThemeName(backendConfig)).toBe('corporate-dark');
    });

    it('prefers the last theme switched to over the saved quick swap theme', () => {
      stubStorage(saved, 'last-used');
      stubOsScheme('dark');
      expect(getThemeName(backendConfig)).toBe('last-used');
    });

    it('lets a forced theme override the saved quick swap theme', () => {
      stubStorage(saved);
      stubOsScheme('dark');
      expect(getThemeName({ ...backendConfig, forceTheme: 'forced' })).toBe('forced');
    });

    it('keeps a theme applied by following the system over the saved quick swap theme', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: 'followed',
        [AUTOMATIC_THEME_PREFERENCE_KEY]: 'followed',
        [SYSTEM_THEME_PREFERENCE_KEY]: 'followed',
        getItem: vi.fn((key: string) => (saved as Record<string, string>)[key] ?? null),
        clear: vi.fn(),
      });
      stubOsScheme('light');
      expect(getThemeName(backendConfig)).toBe('followed');
      expect(getThemeName({ ...backendConfig, forceTheme: 'forced' })).toBe('forced');
    });

    it('does not keep other automatically applied themes over the saved quick swap theme', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: 'plugin-default',
        [AUTOMATIC_THEME_PREFERENCE_KEY]: 'plugin-default',
        getItem: vi.fn((key: string) => (saved as Record<string, string>)[key] ?? null),
        clear: vi.fn(),
      });
      stubOsScheme('light');
      expect(getThemeName(backendConfig)).toBe('my-light');
    });

    it('ignores a saved quick swap theme that is not registered', () => {
      stubStorage(saved);
      stubOsScheme('dark');
      const registered: AppTheme[] = [{ name: 'corporate-dark', base: 'dark' }];
      expect(getThemeName(backendConfig, registered)).toBe('corporate-dark');
      expect(getUserSelectedThemeName(registered)).toBeUndefined();
      expect(getThemeName(backendConfig, [...registered, { name: 'my-dark', base: 'dark' }])).toBe(
        'my-dark'
      );
    });
  });
});
