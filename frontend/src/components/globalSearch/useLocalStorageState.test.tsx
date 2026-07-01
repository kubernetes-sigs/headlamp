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

import { act, renderHook } from '@testing-library/react';
import { useLocalStorageState } from './useLocalStorageState';

describe('useLocalStorageState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('returns defaultValue when key does not exist in localStorage', () => {
      const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));

      expect(result.current[0]).toBe('default');
    });

    it('returns parsed localStorage value when key exists', () => {
      localStorage.setItem('test-key', JSON.stringify('stored-value'));

      const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));

      expect(result.current[0]).toBe('stored-value');
    });

    it('returns parsed object from localStorage', () => {
      const stored = { name: 'test', count: 42 };
      localStorage.setItem('test-key', JSON.stringify(stored));

      const { result } = renderHook(() => useLocalStorageState('test-key', { name: '', count: 0 }));

      expect(result.current[0]).toEqual(stored);
    });

    it('returns defaultValue and logs warning when localStorage contains malformed JSON', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('test-key', '{ malformed json ]');

      const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));

      expect(result.current[0]).toBe('default');
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to parse test-key from local storage, falling back to default value:',
        expect.any(Error)
      );
    });

    it('returns parsed boolean false correctly from localStorage', () => {
      localStorage.setItem('test-key', JSON.stringify(false));

      const { result } = renderHook(() => useLocalStorageState('test-key', true));

      expect(result.current[0]).toBe(false);
    });

    it('returns defaultValue and logs warning when localStorage.getItem throws', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage disabled');
      });

      const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));

      expect(result.current[0]).toBe('default');
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to read test-key from local storage, falling back to default value:',
        expect.any(Error)
      );
    });
  });

  describe('set', () => {
    it('updates state and writes to localStorage', () => {
      const { result } = renderHook(() => useLocalStorageState('test-key', 'initial'));

      act(() => {
        result.current[1](() => 'updated');
      });

      expect(result.current[0]).toBe('updated');
      expect(JSON.parse(localStorage.getItem('test-key') || '""')).toBe('updated');
    });

    it('catches and logs errors when localStorage.setItem throws', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useLocalStorageState('test-key', 'initial'));

      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      act(() => {
        result.current[1](() => 'updated');
      });

      // State should still update even if localStorage write fails
      expect(result.current[0]).toBe('updated');
      expect(spyError).toHaveBeenCalledWith(
        'Error occurred while setting test-key in local storage:',
        expect.any(Error)
      );
    });
  });
});
