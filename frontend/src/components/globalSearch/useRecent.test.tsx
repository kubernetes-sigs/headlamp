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

describe('useRecent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not evict an item when bumping an existing entry at capacity', () => {
    localStorage.setItem(
      'recent-test',
      JSON.stringify({
        oldest: 1,
        newest: 2,
      })
    );

    const { result } = renderHook(() => useRecent('recent-test', 2));

    act(() => {
      result.current[1]('newest');
    });

    expect(Object.keys(result.current[0])).toHaveLength(2);
    expect(result.current[0]).toHaveProperty('oldest', 1);
    expect(result.current[0].newest).toBeGreaterThan(2);
  });

  it('evicts the oldest entry when adding a new item at capacity', () => {
    localStorage.setItem(
      'recent-test',
      JSON.stringify({
        oldest: 1,
        newest: 2,
      })
    );

    const { result } = renderHook(() => useRecent('recent-test', 2));

    act(() => {
      result.current[1]('new-item');
    });

    expect(Object.keys(result.current[0])).toHaveLength(2);
    expect(result.current[0]).not.toHaveProperty('oldest');
    expect(result.current[0]).toHaveProperty('newest', 2);
    expect(result.current[0]).toHaveProperty('new-item');
  });

  it('keeps the list empty when maxItems is zero', () => {
    const { result } = renderHook(() => useRecent('recent-test', 0));

    act(() => {
      result.current[1]('new-item');
    });

    expect(result.current[0]).toEqual({});
  });
});
