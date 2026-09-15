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
import { useEffect } from 'react';
import { useLocalStorageState } from './useLocalStorageState';

let nextStorageKey = 0;

describe('useLocalStorageState', () => {
  let storageKey: string;

  beforeEach(() => {
    storageKey = `test-key-${nextStorageKey++}`;
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('returns defaultValue when key does not exist in localStorage', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'default'));

      expect(result.current[0]).toBe('default');
    });

    it('returns cloned defaultValue when key does not exist in localStorage', () => {
      const defaultValue = [{ a: 1 }];
      const { result } = renderHook(() => useLocalStorageState(storageKey, defaultValue));

      act(() => {
        result.current[0].push({ a: 2 });
      });

      // Check that the passed value is not changed
      expect(defaultValue).toEqual([{ a: 1 }]);
      // Check that deep clone is performed
      expect(result.current[0][0]).toEqual(defaultValue[0]);
      expect(result.current[0][0]).not.toBe(defaultValue[0]);
    });

    it('returns parsed localStorage value when key exists', () => {
      localStorage.setItem(storageKey, JSON.stringify('stored-value'));

      const { result } = renderHook(() => useLocalStorageState(storageKey, 'default'));

      expect(result.current[0]).toBe('stored-value');
    });

    it('returns parsed object from localStorage', () => {
      const stored = { name: 'test', count: 42 };
      localStorage.setItem(storageKey, JSON.stringify(stored));

      const { result } = renderHook(() => useLocalStorageState(storageKey, { name: '', count: 0 }));

      expect(result.current[0]).toEqual(stored);
    });

    it('keeps a returned complex object stable across rerenders', () => {
      const { result, rerender } = renderHook(() =>
        useLocalStorageState(storageKey, {
          filters: [{ name: 'namespace', values: ['default'] }],
        })
      );
      const value = result.current[0];

      rerender();

      expect(result.current[0]).toBe(value);
    });

    it('returns defaultValue and logs warning when localStorage contains malformed JSON', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(storageKey, '{ malformed json ]');

      const { result } = renderHook(() => useLocalStorageState(storageKey, 'default'));

      expect(result.current[0]).toBe('default');
      expect(spyWarn).toHaveBeenCalledWith(
        `Failed to parse ${storageKey} from local storage, falling back to default value:`,
        expect.any(Error)
      );
    });

    it('returns parsed boolean false correctly from localStorage', () => {
      localStorage.setItem(storageKey, JSON.stringify(false));

      const { result } = renderHook(() => useLocalStorageState(storageKey, true));

      expect(result.current[0]).toBe(false);
    });

    it('returns defaultValue and logs warning when localStorage.getItem throws', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage disabled');
      });

      const { result } = renderHook(() => useLocalStorageState(storageKey, 'default'));

      expect(result.current[0]).toBe('default');
      expect(spyWarn).toHaveBeenCalledWith(
        `Failed to read ${storageKey} from local storage, falling back to default value:`,
        expect.any(Error)
      );
    });
  });

  describe('set', () => {
    it('updates state and writes to localStorage', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      act(() => {
        result.current[1](() => 'updated');
      });

      expect(result.current[0]).toBe('updated');
      expect(JSON.parse(localStorage.getItem(storageKey) || '""')).toBe('updated');
    });

    it('accepts a direct value instead of an updater function', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      act(() => {
        result.current[1]('direct-update');
      });

      expect(result.current[0]).toBe('direct-update');
      expect(JSON.parse(localStorage.getItem(storageKey) || '""')).toBe('direct-update');
    });

    it('composes consecutive updates using a retained setter', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 0));
      const set = result.current[1];

      act(() => {
        set(old => old + 1);
        set(old => old + 1);
      });

      expect(result.current[0]).toBe(2);
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toBe(2);
      expect(result.current[1]).toBe(set);
    });

    it('keeps the setter stable so effects depending on it do not loop', () => {
      let effectRuns = 0;

      const { result, rerender } = renderHook(() => {
        const [value, setValue] = useLocalStorageState(storageKey, 0);

        useEffect(() => {
          effectRuns += 1;
          setValue(old => old + 1);
        }, [setValue]);

        return [value, setValue] as const;
      });

      const set = result.current[1];

      expect(result.current[0]).toBe(1);
      expect(effectRuns).toBe(1);

      rerender();

      expect(result.current[0]).toBe(1);
      expect(result.current[1]).toBe(set);
      expect(effectRuns).toBe(1);
    });

    it('catches and logs errors when localStorage.setItem throws', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      act(() => {
        result.current[1](() => 'updated');
      });

      // State should still update even if localStorage write fails
      expect(result.current[0]).toBe('updated');
      expect(spyError).toHaveBeenCalledWith(
        `Error occurred while setting ${storageKey} in local storage:`,
        expect.any(Error)
      );
    });

    it('composes consecutive updates when localStorage.setItem throws', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useLocalStorageState(storageKey, 0));
      const set = result.current[1];

      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      act(() => {
        set(old => old + 1);
        set(old => old + 1);
      });

      expect(result.current[0]).toBe(2);
      expect(result.current[1]).toBe(set);
    });

    it('updates all hook instances using the same key', () => {
      const first = renderHook(() => useLocalStorageState(storageKey, 'initial'));
      const second = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      act(() => {
        first.result.current[1](() => 'updated');
      });

      expect(first.result.current[0]).toBe('updated');
      expect(second.result.current[0]).toBe('updated');
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toBe('updated');
    });

    it('applies retained setters to the latest value from another hook instance', () => {
      const first = renderHook(() => useLocalStorageState(storageKey, 0));
      const second = renderHook(() => useLocalStorageState(storageKey, 0));
      const firstSet = first.result.current[1];

      act(() => {
        second.result.current[1](() => 10);
        firstSet(old => old + 1);
      });

      expect(first.result.current[0]).toBe(11);
      expect(second.result.current[0]).toBe(11);
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toBe(11);
    });

    it('switches reads and writes when the key changes', () => {
      const firstKey = `${storageKey}-first`;
      const secondKey = `${storageKey}-second`;
      localStorage.setItem(firstKey, JSON.stringify('first'));
      localStorage.setItem(secondKey, JSON.stringify('second'));
      const { result, rerender } = renderHook(
        ({ storageKey }) => useLocalStorageState(storageKey, 'default'),
        { initialProps: { storageKey: firstKey } }
      );

      expect(result.current[0]).toBe('first');

      rerender({ storageKey: secondKey });

      expect(result.current[0]).toBe('second');

      act(() => {
        result.current[1](() => 'updated');
      });

      expect(JSON.parse(localStorage.getItem(firstKey)!)).toBe('first');
      expect(JSON.parse(localStorage.getItem(secondKey)!)).toBe('updated');
    });
  });

  describe('cross-tab synchronization', () => {
    it('updates state when another tab modifies localStorage', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      act(() => {
        localStorage.setItem(storageKey, JSON.stringify('from-another-tab'));
        const event = new Event('storage') as any;
        event.key = storageKey;
        event.newValue = JSON.stringify('from-another-tab');
        event.storageArea = window.localStorage;
        window.dispatchEvent(event);
      });

      expect(result.current[0]).toBe('from-another-tab');
    });

    it('ignores sessionStorage events', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      act(() => {
        const event = new Event('storage') as any;
        event.key = storageKey;
        event.newValue = JSON.stringify('from-session-storage');
        event.storageArea = window.sessionStorage;
        window.dispatchEvent(event);
      });

      expect(result.current[0]).toBe('initial');
    });

    it('falls back to default value on localStorage.clear()', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      act(() => {
        result.current[1]('changed');
      });
      expect(result.current[0]).toBe('changed');

      act(() => {
        const event = new Event('storage') as any;
        event.key = null;
        event.storageArea = window.localStorage;
        window.dispatchEvent(event);
      });

      expect(result.current[0]).toBe('initial');
    });

    it('falls back to default value on localStorage.removeItem()', () => {
      const { result } = renderHook(() => useLocalStorageState(storageKey, 'initial'));

      act(() => {
        result.current[1]('changed');
      });
      expect(result.current[0]).toBe('changed');

      act(() => {
        const event = new Event('storage') as any;
        event.key = storageKey;
        event.newValue = null;
        event.storageArea = window.localStorage;
        window.dispatchEvent(event);
      });

      expect(result.current[0]).toBe('initial');
    });
  });
});
