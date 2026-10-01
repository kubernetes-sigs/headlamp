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
import { vi } from 'vitest';
import { useRecent } from './useRecent';

describe('useRecent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('should return empty object initially', () => {
    const { result } = renderHook(() => useRecent('test-key'));
    expect(result.current[0]).toEqual({});
  });

  it('should add a new item on bump', () => {
    const { result } = renderHook(() => useRecent('test-key'));

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
      result.current[1]('item-1');
    });

    expect(result.current[0]).toEqual({
      'item-1': new Date('2025-01-01T00:00:00Z').getTime(),
    });
  });

  it('should bump an existing item and update its timestamp', () => {
    const { result } = renderHook(() => useRecent('test-key'));

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
      result.current[1]('item-1');
    });

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T01:00:00Z'));
      result.current[1]('item-1');
    });

    expect(Object.keys(result.current[0]).length).toBe(1);
    expect(result.current[0]).toEqual({
      'item-1': new Date('2025-01-01T01:00:00Z').getTime(),
    });
  });

  it('should not evict any item when re-selecting an existing item at capacity', () => {
    const { result } = renderHook(() => useRecent('test-key', 2));

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
      result.current[1]('item-1');
    });

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T01:00:00Z'));
      result.current[1]('item-2');
    });

    // Re-select item-2 (at capacity of 2)
    act(() => {
      vi.setSystemTime(new Date('2025-01-01T02:00:00Z'));
      result.current[1]('item-2');
    });

    expect(Object.keys(result.current[0]).length).toBe(2);
    expect(result.current[0]).toEqual({
      'item-1': new Date('2025-01-01T00:00:00Z').getTime(),
      'item-2': new Date('2025-01-01T02:00:00Z').getTime(),
    });

    // Re-select item-1 (at capacity of 2)
    act(() => {
      vi.setSystemTime(new Date('2025-01-01T03:00:00Z'));
      result.current[1]('item-1');
    });

    expect(Object.keys(result.current[0]).length).toBe(2);
    expect(result.current[0]).toEqual({
      'item-1': new Date('2025-01-01T03:00:00Z').getTime(),
      'item-2': new Date('2025-01-01T02:00:00Z').getTime(),
    });
  });

  it('should remove the oldest item when exceeding maxItems', () => {
    const { result } = renderHook(() => useRecent('test-key', 2));

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
      result.current[1]('item-1');
    });

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T01:00:00Z'));
      result.current[1]('item-2');
    });

    act(() => {
      vi.setSystemTime(new Date('2025-01-01T02:00:00Z'));
      result.current[1]('item-3');
    });

    expect(Object.keys(result.current[0]).length).toBe(2);
    expect(result.current[0]).toEqual({
      'item-2': new Date('2025-01-01T01:00:00Z').getTime(),
      'item-3': new Date('2025-01-01T02:00:00Z').getTime(),
    });
  });

  it('should return empty object and not add new items if maxItems <= 0', () => {
    const { result, rerender } = renderHook(({ maxItems }) => useRecent('test-key', maxItems), {
      initialProps: { maxItems: 0 },
    });

    act(() => {
      result.current[1]('item-1');
    });

    expect(result.current[0]).toEqual({});

    rerender({ maxItems: -1 });

    act(() => {
      result.current[1]('item-2');
    });

    expect(result.current[0]).toEqual({});
  });
});
