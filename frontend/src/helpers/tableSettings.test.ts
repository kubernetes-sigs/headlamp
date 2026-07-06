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

import { loadTableSettings, storeTableSettings } from './tableSettings';

describe('tableSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('storeTableSettings', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('stores column visibility settings in localStorage', () => {
      const columns = [
        { id: 'name', show: true },
        { id: 'status', show: false },
      ];

      storeTableSettings('test-table', columns);

      const stored = JSON.parse(localStorage.getItem('table_settings.test-table') || '[]');
      expect(stored).toEqual([
        { id: 'name', show: true },
        { id: 'status', show: false },
      ]);
    });

    it('assigns numeric IDs to columns without IDs', () => {
      const columns = [{ show: true }, { show: false }];

      storeTableSettings('test-table', columns);

      const stored = JSON.parse(localStorage.getItem('table_settings.test-table') || '[]');
      expect(stored).toEqual([
        { id: '0', show: true },
        { id: '1', show: false },
      ]);
    });

    it('removes the entry when columns array is empty', () => {
      localStorage.setItem('table_settings.test-table', JSON.stringify([{ id: '0', show: true }]));

      storeTableSettings('test-table', []);

      expect(localStorage.getItem('table_settings.test-table')).toBeNull();
    });

    it('does nothing when tableId is empty', () => {
      storeTableSettings('', [{ id: 'name', show: true }]);

      // No key should have been written for an empty tableId
      expect(localStorage.getItem('table_settings.')).toBeNull();
    });

    it('catches and logs errors when localStorage.setItem throws', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      storeTableSettings('test-table', [{ id: 'name', show: true }]);

      expect(spyError).toHaveBeenCalledWith(
        'Error occurred while updating table_settings.test-table in local storage:',
        expect.any(Error)
      );
    });

    it('catches and logs errors when localStorage.removeItem throws', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('Security error');
      });

      storeTableSettings('test-table', []);

      expect(spyError).toHaveBeenCalledWith(
        'Error occurred while updating table_settings.test-table in local storage:',
        expect.any(Error)
      );
    });
  });

  describe('loadTableSettings', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns stored settings', () => {
      const settings = [
        { id: 'name', show: true },
        { id: 'status', show: false },
      ];
      localStorage.setItem('table_settings.test-table', JSON.stringify(settings));

      const result = loadTableSettings('test-table');

      expect(result).toEqual(settings);
    });

    it('returns empty array when no settings exist', () => {
      const result = loadTableSettings('nonexistent-table');

      expect(result).toEqual([]);
    });

    it('returns empty array when tableId is empty', () => {
      const result = loadTableSettings('');

      expect(result).toEqual([]);
    });

    it('returns empty array and logs warning if JSON is malformed', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('table_settings.test-table', '{ malformed json ]');

      const result = loadTableSettings('test-table');

      expect(result).toEqual([]);
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to read table_settings.test-table from local storage, falling back to empty array:',
        expect.any(Error)
      );
    });

    it('returns empty array and logs warning if localStorage.getItem throws', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('Security error');
      });

      const result = loadTableSettings('test-table');

      expect(result).toEqual([]);
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to read table_settings.test-table from local storage, falling back to empty array:',
        expect.any(Error)
      );
    });

    it('returns empty array and logs warning if parsed JSON is not an array', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('table_settings.test-table', JSON.stringify({ name: 'not-an-array' }));

      const result = loadTableSettings('test-table');

      expect(result).toEqual([]);
      expect(spyWarn).toHaveBeenCalledWith(
        'table_settings.test-table is not an array, falling back to empty array.'
      );
    });

    it('returns empty array and logs warning if parsed JSON array contains invalid entries', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('table_settings.test-table', JSON.stringify([null, {}]));

      const result = loadTableSettings('test-table');

      expect(result).toEqual([]);
      expect(spyWarn).toHaveBeenCalledWith(
        'table_settings.test-table has invalid entries, falling back to empty array.'
      );
    });
  });
});
