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

import { describe, expect, it, vi } from 'vitest';
import { AppTheme } from './AppTheme';
import { createMuiTheme, getThemeName, setTheme } from './themes';

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
  });

  describe('getThemeName', () => {
    it('should return light theme by default', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      });

      expect(getThemeName()).toBe('light');
    });

    it('should return dark theme if user prefers dark mode', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
        clear: vi.fn(),
      });
      vi.stubGlobal('window', {
        matchMedia: vi.fn(query => ({
          matches: query === '(prefers-color-scheme: dark)',
        })),
      });

      expect(getThemeName()).toBe('dark');
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

      expect(getThemeName(backendConfig)).toBe('dark');
    });

    it('should handle both default themes with OS preference selection', () => {
      vi.stubGlobal('localStorage', {
        headlampThemePreference: null,
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
});
