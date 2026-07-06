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
  });

  describe('loadTableSettings', () => {
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
  });
});
