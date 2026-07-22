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

const TEST_KEY = 'test-key';

// localStorage is cleared globally in frontend/src/setupTests.ts.

describe('useLocalStorageState', () => {
  it('returns the default value when localStorage has no entry', () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));
    expect(result.current[0]).toBe(0);
  });

  it('returns the persisted value when localStorage already has an entry', () => {
    localStorage.setItem(TEST_KEY, JSON.stringify(42));
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));
    expect(result.current[0]).toBe(42);
  });

  it('returns the default value when localStorage.getItem throws', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));
    expect(result.current[0]).toBe(0);
    spy.mockRestore();
  });

  it('returns the default value when the stored JSON is malformed', () => {
    localStorage.setItem(TEST_KEY, 'not-valid-json{{{');
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));
    expect(result.current[0]).toBe(0);
  });

  it('updates state and persists the new value to localStorage', () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));

    act(() => {
      result.current[1](() => 99);
    });

    expect(result.current[0]).toBe(99);
    expect(JSON.parse(localStorage.getItem(TEST_KEY)!)).toBe(99);
  });

  /**
   * Regression test for the stale-closure bug.
   *
   * Before the fix, `set` closed over the `state` variable directly:
   *   const set = (updater) => { const newValue = updater(state); ... }
   *
   * Calling set() twice in the same render cycle meant both calls captured
   * the same stale `state` (e.g. 0), so the second call would produce
   * updater(0) = 1 instead of the expected updater(1) = 2, and the final
   * value would be 1 rather than 2.
   *
   * After the fix, set() reads from a mutable ref (stateRef) that is eagerly
   * updated on every call, so consecutive synchronous calls correctly
   * accumulate even within a single batched render.
   */
  it('accumulates consecutive set() calls without stale closure (regression)', () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));

    act(() => {
      // Two increments fired synchronously — must produce 2, not 1.
      result.current[1](old => old + 1);
      result.current[1](old => old + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(JSON.parse(localStorage.getItem(TEST_KEY)!)).toBe(2);
  });

  it('propagates updates via useLocalStorageState.update across hook instances', () => {
    const { result: a } = renderHook(() => useLocalStorageState(TEST_KEY, 0));
    const { result: b } = renderHook(() => useLocalStorageState(TEST_KEY, 0));

    // Force a re-render of one hook instance before update() fires.
    act(() => {
      a.current[1](() => 1);
    });

    act(() => {
      useLocalStorageState.update(TEST_KEY, 42);
    });

    // Both hook instances must reflect the new value.
    expect(a.current[0]).toBe(42);
    expect(b.current[0]).toBe(42);
    expect(JSON.parse(localStorage.getItem(TEST_KEY)!)).toBe(42);
  });

  it('useLocalStorageState.update persists the value to localStorage', () => {
    act(() => {
      useLocalStorageState.update(TEST_KEY, 'hello');
    });

    expect(JSON.parse(localStorage.getItem(TEST_KEY)!)).toBe('hello');
  });

  it('does not throw when update() is called after unmount', () => {
    const { result, unmount } = renderHook(() => useLocalStorageState(TEST_KEY, 0));

    unmount();

    // After unmount, update() should not throw even though there are no listeners.
    expect(() => {
      act(() => {
        useLocalStorageState.update(TEST_KEY, 99);
      });
    }).not.toThrow();

    // The unmounted hook's last known value should be unchanged.
    expect(result.current[0]).toBe(0);
  });
});
