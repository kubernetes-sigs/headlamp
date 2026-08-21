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

import { exportConfig, importConfig } from './configExportImport';

describe('configExportImport', () => {
  beforeEach(() => {
    localStorage.clear();
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
  });

  describe('exportConfig', () => {
    it('should export all items from localStorage', () => {
      localStorage.setItem('key1', 'value1');
      localStorage.setItem('key2', 'value2');

      const clickMock = vi.fn();
      const appendChildMock = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {
        return null as any;
      });
      const removeChildMock = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {
        return null as any;
      });
      const createElementMock = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tagName: string) => {
          if (tagName === 'a') {
            return {
              click: clickMock,
              href: '',
              download: '',
            } as any;
          }
          return document.createElement(tagName);
        });

      exportConfig();

      expect(createElementMock).toHaveBeenCalledWith('a');
      expect(appendChildMock).toHaveBeenCalled();
      expect(clickMock).toHaveBeenCalled();
      expect(removeChildMock).toHaveBeenCalled();

      createElementMock.mockRestore();
      appendChildMock.mockRestore();
      removeChildMock.mockRestore();
    });
  });

  describe('importConfig', () => {
    it('should reject invalid JSON', () => {
      expect(importConfig('{invalid json}')).toBe(false);
    });

    it('should reject arrays', () => {
      expect(importConfig('["value1", "value2"]')).toBe(false);
    });

    it('should reject non-object JSON', () => {
      expect(importConfig('"string"')).toBe(false);
      expect(importConfig('123')).toBe(false);
    });

    it('should reject if values are not strings', () => {
      // E.g., nested objects or arrays or numbers instead of strings
      const payload = {
        key1: 'value1',
        key2: { nested: 'value' },
      };
      expect(importConfig(JSON.stringify(payload))).toBe(false);
    });

    it('should import valid configuration, clear stale keys, and set in localStorage', () => {
      // Simulate a stale pre-existing key
      localStorage.setItem('stale_key', 'old_value');
      localStorage.setItem('headlamp-userId', 'should_be_kept');

      const payload = {
        key1: 'value1',
        key2: 'value2',
      };
      expect(importConfig(JSON.stringify(payload))).toBe(true);
      expect(localStorage.getItem('key1')).toBe('value1');
      expect(localStorage.getItem('key2')).toBe('value2');
      expect(localStorage.getItem('stale_key')).toBeNull(); // It should be cleared
      expect(localStorage.getItem('headlamp-userId')).toBe('should_be_kept'); // Runtime ID should be kept
    });
  });
});
