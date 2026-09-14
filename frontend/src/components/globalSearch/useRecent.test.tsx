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
import { useRecent } from './useRecent';

let nextStorageKey = 0;

describe('useRecent', () => {
  let storageKey: string;

  beforeEach(() => {
    storageKey = `test-recent-${nextStorageKey++}`;
    localStorage.clear();
  });

  it('adds a new item', () => {
    const { result } = renderHook(() => useRecent(storageKey));

    act(() => {
      result.current[1]('a');
    });

    expect(Object.keys(result.current[0])).toEqual(['a']);
  });

  it('updates the timestamp of an existing item without evicting anything', () => {
    const { result } = renderHook(() => useRecent(storageKey, 3));

    act(() => {
      result.current[1]('a');
      result.current[1]('b');
    });
    const originalTimestamp = result.current[0].a;

    act(() => {
      result.current[1]('a');
    });

    expect(Object.keys(result.current[0]).sort()).toEqual(['a', 'b']);
    expect(result.current[0].a).toBeGreaterThanOrEqual(originalTimestamp);
  });

  it('evicts the oldest item when a new item exceeds maxItems', () => {
    const { result } = renderHook(() => useRecent(storageKey, 2));

    act(() => {
      result.current[1]('a');
      result.current[1]('b');
      result.current[1]('c');
    });

    expect(Object.keys(result.current[0]).sort()).toEqual(['b', 'c']);
  });

  it('does not evict an entry when bumping an existing item at capacity', () => {
    const { result } = renderHook(() => useRecent(storageKey, 2));

    act(() => {
      result.current[1]('a');
      result.current[1]('b');
    });

    act(() => {
      result.current[1]('b');
    });

    expect(Object.keys(result.current[0]).sort()).toEqual(['a', 'b']);
  });
});
