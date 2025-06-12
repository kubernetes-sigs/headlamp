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
});
