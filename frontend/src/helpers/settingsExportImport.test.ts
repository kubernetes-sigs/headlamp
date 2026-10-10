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

import { getExportSettings, importSettings } from './settingsExportImport';

describe('settingsExportImport', () => {
  beforeEach(() => {
    localStorage.clear();

    const mockStorage: Record<string, string> = {};
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);

    vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
      mockStorage[k] = String(v);
      originalSetItem(k, v);
    });

    vi.spyOn(localStorage, 'removeItem').mockImplementation(k => {
      delete mockStorage[k];
      originalRemoveItem(k);
    });

    Object.defineProperty(localStorage, 'length', {
      get: () => Object.keys(mockStorage).length,
      configurable: true,
    });
    localStorage.key = (i: number) => Object.keys(mockStorage)[i] || null;
  });

  describe('getExportSettings', () => {
    it('exports allowed keys including theme and namespace preferences', () => {
      localStorage.setItem('settings', '{"theme":"dark"}');
      localStorage.setItem('sidebar', '{"shrink":true}');
      localStorage.setItem('cluster_settings.minikube', '{"namespace":"default"}');
      localStorage.setItem('headlampThemePreference', 'light');
      localStorage.setItem('cached-current-theme', 'custom-theme-name');
      localStorage.setItem('headlamp-selected-namespace_minikube', 'kube-system');

      const exported = getExportSettings();
      expect(exported.version).toBe(1);
      expect(exported.data['settings']).toBe('{"theme":"dark"}');
      expect(exported.data['sidebar']).toBe('{"shrink":true}');
      expect(exported.data['cluster_settings.minikube']).toBe('{"namespace":"default"}');
      expect(exported.data['headlampThemePreference']).toBe('light');
      expect(exported.data['cached-current-theme']).toBe('custom-theme-name');
      expect(exported.data['headlamp-selected-namespace_minikube']).toBe('kube-system');
    });

    it('ignores non-allowed keys and pluginConfigs', () => {
      localStorage.setItem('settings', '{"theme":"dark"}');
      localStorage.setItem('headlamp-userId', 'user123');
      localStorage.setItem('random-key', 'random-value');
      localStorage.setItem('pluginConfigs', '{"secretToken":"12345"}');

      const exported = getExportSettings();
      expect(exported.data['settings']).toBe('{"theme":"dark"}');
      expect(exported.data['headlamp-userId']).toBeUndefined();
      expect(exported.data['random-key']).toBeUndefined();
      expect(exported.data['pluginConfigs']).toBeUndefined();
    });
  });

  describe('importSettings', () => {
    it('imports allowed keys and ignores non-allowed keys', () => {
      const payload = {
        version: 1,
        data: {
          settings: '{"theme":"light"}',
          'cluster_settings.prod': '{"namespace":"kube-system"}',
          'random-key': 'value',
        },
      };

      const result = importSettings(payload);
      expect(result).toBe(true);

      expect(localStorage.getItem('settings')).toBe('{"theme":"light"}');
      expect(localStorage.getItem('cluster_settings.prod')).toBe('{"namespace":"kube-system"}');
      expect(localStorage.getItem('random-key')).toBeNull();
    });

    it('replaces existing allowlisted keys not present in import', () => {
      // Pre-populate with some allowlisted keys
      localStorage.setItem('settings', '{"theme":"dark"}');
      localStorage.setItem('sidebar', '{"shrink":true}');
      localStorage.setItem('filter', '{"namespace":"default"}');

      // Import with only 'settings' - sidebar and filter should be removed
      const payload = {
        version: 1,
        data: {
          settings: '{"theme":"light"}',
        },
      };

      const result = importSettings(payload);
      expect(result).toBe(true);

      expect(localStorage.getItem('settings')).toBe('{"theme":"light"}');
      expect(localStorage.getItem('sidebar')).toBeNull();
      expect(localStorage.getItem('filter')).toBeNull();
    });

    it('preserves non-allowlisted keys during import', () => {
      // Pre-populate with a non-allowlisted key
      localStorage.setItem('headlamp-userId', 'user123');
      localStorage.setItem('settings', '{"theme":"dark"}');

      const payload = {
        version: 1,
        data: {
          settings: '{"theme":"light"}',
        },
      };

      importSettings(payload);

      // Non-allowlisted key should remain untouched
      expect(localStorage.getItem('headlamp-userId')).toBe('user123');
      expect(localStorage.getItem('settings')).toBe('{"theme":"light"}');
    });

    it('round-trips theme preferences', () => {
      localStorage.setItem('headlampThemePreference', 'dark');
      localStorage.setItem('cached-current-theme', 'my-custom-theme');

      const exported = getExportSettings();

      // Clear and reimport
      localStorage.clear();
      const result = importSettings(exported);
      expect(result).toBe(true);

      expect(localStorage.getItem('headlampThemePreference')).toBe('dark');
      expect(localStorage.getItem('cached-current-theme')).toBe('my-custom-theme');
    });

    it('rolls back to previous state if setItem throws an error', () => {
      // Setup initial state
      localStorage.setItem('settings', '{"theme":"dark"}');
      localStorage.setItem('filter', 'my-filter');

      const payload = {
        version: 1,
        data: {
          settings: '{"theme":"light"}',
          filter: 'new-filter',
          sidebar: 'collapsed',
        },
      };

      // Mock setItem to throw when setting 'sidebar'
      const originalSetItem = localStorage.setItem.bind(localStorage);
      const writtenKeys: string[] = [];
      const setItemMock = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === 'sidebar') {
          throw new Error('Quota exceeded');
        }
        writtenKeys.push(key);
        originalSetItem(key, value);
      });

      expect(() => importSettings(payload)).toThrowError('Quota exceeded');

      // Verify the new keys were not persisted (or were removed)
      expect(localStorage.getItem('sidebar')).toBeNull();

      // Verify rollback to the initial state
      expect(localStorage.getItem('settings')).toBe('{"theme":"dark"}');
      expect(localStorage.getItem('filter')).toBe('my-filter');

      setItemMock.mockRestore();
    });

    it('returns false for invalid payload', () => {
      expect(importSettings(null as any)).toBe(false);
      expect(importSettings({ version: 2, data: {} } as any)).toBe(false);
      expect(importSettings({ version: 1, data: 'string' } as any)).toBe(false);
    });

    it('rejects data: null', () => {
      expect(importSettings({ version: 1, data: null } as any)).toBe(false);
    });

    it('rejects data as an array', () => {
      expect(importSettings({ version: 1, data: ['a', 'b'] } as any)).toBe(false);
    });

    it('rejects data with non-string values', () => {
      expect(importSettings({ version: 1, data: { settings: 123 } } as any)).toBe(false);
      expect(importSettings({ version: 1, data: { settings: true } } as any)).toBe(false);
      expect(importSettings({ version: 1, data: { settings: { nested: 'obj' } } } as any)).toBe(
        false
      );
    });
  });
});
