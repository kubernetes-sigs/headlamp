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
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardNavigation } from './useKeyboardNavigation';

function makeKeyEvent(key: string): React.KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.KeyboardEvent;
}

describe('useKeyboardNavigation', () => {
  it('starts with no row focused', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    expect(result.current.focusedRowIndex).toBe(-1);
  });

  it('moves focus to first row on ArrowDown when no row is focused', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowDown')));
    expect(result.current.focusedRowIndex).toBe(0);
  });

  it('moves focus down by one on ArrowDown', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    act(() => result.current.onRowClick(2));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowDown')));
    expect(result.current.focusedRowIndex).toBe(3);
  });

  it('moves focus up by one on ArrowUp', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    act(() => result.current.onRowClick(3));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowUp')));
    expect(result.current.focusedRowIndex).toBe(2);
  });

  it('does not move focus below last row', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 3, enabled: true }));
    act(() => result.current.onRowClick(2));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowDown')));
    expect(result.current.focusedRowIndex).toBe(2);
  });

  it('does not move focus above first row', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 3, enabled: true }));
    act(() => result.current.onRowClick(0));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowUp')));
    expect(result.current.focusedRowIndex).toBe(0);
  });

  it('calls onRowOpen with the focused index and keyboard event on Enter', () => {
    const onRowOpen = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({ rowCount: 5, enabled: true, onRowOpen })
    );
    act(() => result.current.onRowClick(2));
    const event = makeKeyEvent('Enter');
    act(() => result.current.onKeyDown(event));
    expect(onRowOpen).toHaveBeenCalledWith(2, event);
    expect(onRowOpen).toHaveBeenCalledTimes(1);
  });

  it('does not call onRowOpen when no row is focused', () => {
    const onRowOpen = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({ rowCount: 5, enabled: true, onRowOpen })
    );
    act(() => result.current.onKeyDown(makeKeyEvent('Enter')));
    expect(onRowOpen).not.toHaveBeenCalled();
  });

  it('clears focus when clearFocus is called', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    act(() => result.current.onRowClick(3));
    expect(result.current.focusedRowIndex).toBe(3);
    act(() => result.current.clearFocus());
    expect(result.current.focusedRowIndex).toBe(-1);
  });

  it('tracks focus when onRowClick is called', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    act(() => result.current.onRowClick(4));
    expect(result.current.focusedRowIndex).toBe(4);
  });

  it('does not navigate when enabled is false', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: false }));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowDown')));
    expect(result.current.focusedRowIndex).toBe(-1);
  });

  it('does not navigate when rowCount is 0', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 0, enabled: true }));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowDown')));
    expect(result.current.focusedRowIndex).toBe(-1);
  });

  it('moves to last row on ArrowUp when no row is focused', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 4, enabled: true }));
    act(() => result.current.onKeyDown(makeKeyEvent('ArrowUp')));
    expect(result.current.focusedRowIndex).toBe(3);
  });

  it('ignores unrelated keys', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    act(() => result.current.onRowClick(2));
    act(() => result.current.onKeyDown(makeKeyEvent('Tab')));
    expect(result.current.focusedRowIndex).toBe(2);
  });

  it('calls preventDefault on ArrowDown', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    const event = makeKeyEvent('ArrowDown');
    act(() => result.current.onKeyDown(event));
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('calls preventDefault on ArrowUp', () => {
    const { result } = renderHook(() => useKeyboardNavigation({ rowCount: 5, enabled: true }));
    const event = makeKeyEvent('ArrowUp');
    act(() => result.current.onKeyDown(event));
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('calls preventDefault on Enter', () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ rowCount: 5, enabled: true, onRowOpen: vi.fn() })
    );
    act(() => result.current.onRowClick(1));
    const event = makeKeyEvent('Enter');
    act(() => result.current.onKeyDown(event));
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('clears focus when rowCount changes (e.g. filter or pagination)', () => {
    let rowCount = 5;
    const { result, rerender } = renderHook(() =>
      useKeyboardNavigation({ rowCount, enabled: true })
    );
    act(() => result.current.onRowClick(3));
    expect(result.current.focusedRowIndex).toBe(3);
    rowCount = 2;
    rerender();
    expect(result.current.focusedRowIndex).toBe(-1);
  });
});
