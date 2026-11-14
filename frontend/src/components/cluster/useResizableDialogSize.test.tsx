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

import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESIZABLE_DIALOG_MIN_HEIGHT,
  RESIZABLE_DIALOG_MIN_WIDTH,
  useResizableDialogSize,
} from './useResizableDialogSize';

const KEY = 'test-dialog-size';

// A ResizeObserver stub the tests can drive. Each new instance registers with
// this holder so the test can fire a synthetic resize entry.
const resizeCallbacks: Array<(entries: ResizeObserverEntry[]) => void> = [];

class FakeResizeObserver {
  private cb: (entries: ResizeObserverEntry[]) => void;
  constructor(cb: (entries: ResizeObserverEntry[]) => void) {
    this.cb = cb;
    resizeCallbacks.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    const idx = resizeCallbacks.indexOf(this.cb);
    if (idx >= 0) resizeCallbacks.splice(idx, 1);
  }
}

function fireResize(width: number, height: number) {
  for (const cb of resizeCallbacks) {
    cb([{ contentRect: { width, height } } as ResizeObserverEntry]);
  }
}

// The observer skips its first firing (browser laying out the paper at MUI
// defaults or CSS-clamped preference). Tests that want to exercise the
// "user drag" path need to consume that first observation before their
// actual assertion.
function primeObserver() {
  fireResize(600, 400);
}

// Invoke the callback ref returned by the hook to simulate React attaching
// the paper element after commit. Returns the created element for further
// manipulation in the test.
function attachPaperRef(result: { current: ReturnType<typeof useResizableDialogSize> }) {
  const el = document.createElement('div');
  (result.current.paperRef as unknown as (el: HTMLDivElement | null) => void)(el);
  return el;
}

// @vitest-environment jsdom

describe('useResizableDialogSize', () => {
  let originalRO: typeof globalThis.ResizeObserver;
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  beforeEach(() => {
    originalRO = globalThis.ResizeObserver;
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    resizeCallbacks.length = 0;
    localStorage.clear();
    vi.useFakeTimers();
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.ResizeObserver = originalRO;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it('returns empty sx when disabled', () => {
    const { result } = renderHook(() => useResizableDialogSize(KEY, false));
    expect(result.current.dialogSx).toEqual({});
  });

  it('returns default sx (no width/height override) when no size is stored', () => {
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    const paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    expect(paperSx.resize).toBe('both');
    expect(paperSx.minWidth).toBe(RESIZABLE_DIALOG_MIN_WIDTH);
    expect(paperSx.minHeight).toBe(RESIZABLE_DIALOG_MIN_HEIGHT);
    expect(paperSx.width).toBeUndefined();
    expect(paperSx.height).toBeUndefined();
  });

  it('hydrates width/height from localStorage on mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ width: 800, height: 600 }));
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    const paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    expect(paperSx.width).toBe(800);
    expect(paperSx.height).toBe(600);
  });

  it('clamps a stored size larger than the viewport down to 95% of viewport', () => {
    // Stored on a bigger monitor.
    localStorage.setItem(KEY, JSON.stringify({ width: 4000, height: 3000 }));
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    const paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    // 95% of 1920 = 1824, of 1080 = 1026.
    expect(paperSx.width).toBe(1824);
    expect(paperSx.height).toBe(1026);
  });

  it('ignores a stored size below the minimum', () => {
    localStorage.setItem(KEY, JSON.stringify({ width: 100, height: 100 }));
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    const paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    expect(paperSx.width).toBeUndefined();
    expect(paperSx.height).toBeUndefined();
  });

  it('ignores unparseable JSON in localStorage', () => {
    localStorage.setItem(KEY, 'not-json');
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    const paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    expect(paperSx.width).toBeUndefined();
  });

  it('persists a resize event to localStorage after debounce, not before', () => {
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    act(() => primeObserver());
    act(() => {
      fireResize(900, 700);
    });
    // Nothing written yet (still inside the debounce window).
    expect(localStorage.getItem(KEY)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      width: 900,
      height: 700,
    });
  });

  it('debounces rapid resize events, writing only the last one', () => {
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    act(() => primeObserver());
    act(() => {
      fireResize(800, 600);
      vi.advanceTimersByTime(100);
      fireResize(900, 700);
      vi.advanceTimersByTime(100);
      fireResize(1000, 800);
    });
    // Still inside the debounce window after the last event.
    expect(localStorage.getItem(KEY)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      width: 1000,
      height: 800,
    });
  });

  it('ignores the very first observation (avoids writing MUI defaults)', () => {
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    // First observation is the browser's initial layout; must be ignored.
    act(() => {
      fireResize(600, 400);
      vi.advanceTimersByTime(300);
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does not overwrite a stored preference when the viewport clamps the paper smaller', () => {
    // Preference stored on a big monitor: 3000x2000. Current viewport is
    // 1920x1080, so CSS clamps the paper to 1824x1026 (95% of viewport).
    localStorage.setItem(KEY, JSON.stringify({ width: 3000, height: 2000 }));
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    // Prime, then the observer sees the CSS-clamped size — must NOT clobber.
    act(() => {
      primeObserver();
      fireResize(1824, 1026);
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      width: 3000,
      height: 2000,
    });
  });

  it('persists a user-drag that is different from the clamp of the current preference', () => {
    localStorage.setItem(KEY, JSON.stringify({ width: 3000, height: 2000 }));
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    act(() => {
      primeObserver();
      // Clamp of stored 3000x2000 on a 1920x1080 viewport is 1824x1026. User
      // then drags the paper to 1500x900. This differs from the clamp, so
      // the write should happen.
      fireResize(1500, 900);
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      width: 1500,
      height: 900,
    });
  });

  it('does not silently swallow a second user-drag that lands near the initial clamp', () => {
    // Stored 3000x2000 with mount clamp = 1824x1026. User drags to 1500,900
    // (persists). Later user drags BACK to 1824,1026 which happens to match
    // the *original* clamp; without keeping `appliedSizeRef` in sync with
    // the persisted value, the guard would skip this write.
    localStorage.setItem(KEY, JSON.stringify({ width: 3000, height: 2000 }));
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    act(() => {
      primeObserver();
      fireResize(1500, 900);
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      width: 1500,
      height: 900,
    });
    // Second user drag targeting a value that equals the original clamp.
    act(() => {
      fireResize(1824, 1026);
      vi.advanceTimersByTime(300);
    });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      width: 1824,
      height: 1026,
    });
  });

  it('does not enforce a preferred size when the viewport is too small to honor the minimum', () => {
    // Wide-but-short window: 1920x300. maxHeight = 285, below the 300 min.
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    localStorage.setItem(KEY, JSON.stringify({ width: 800, height: 600 }));
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    const paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    // Falls back to MUI defaults: no width/height override, min still applies.
    expect(paperSx.width).toBeUndefined();
    expect(paperSx.height).toBeUndefined();
  });

  it('disconnects the observer when the paper ref is detached with null', () => {
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    expect(resizeCallbacks.length).toBe(1);
    // Simulate the paper unmounting.
    act(() => {
      (result.current.paperRef as unknown as (el: HTMLDivElement | null) => void)(null);
    });
    expect(resizeCallbacks.length).toBe(0);
  });

  it('tears down and re-attaches the observer when enabled toggles', () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useResizableDialogSize(KEY, enabled),
      { initialProps: { enabled: true } }
    );
    act(() => {
      attachPaperRef(result);
    });
    expect(resizeCallbacks.length).toBe(1);
    rerender({ enabled: false });
    expect(resizeCallbacks.length).toBe(0);
    // Re-enable and re-attach.
    rerender({ enabled: true });
    act(() => {
      attachPaperRef(result);
    });
    expect(resizeCallbacks.length).toBe(1);
  });

  it('re-hydrates when the storage key changes', () => {
    localStorage.setItem('key-a', JSON.stringify({ width: 800, height: 600 }));
    localStorage.setItem('key-b', JSON.stringify({ width: 1200, height: 900 }));
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useResizableDialogSize(key, true),
      { initialProps: { key: 'key-a' } }
    );
    let paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    expect(paperSx.width).toBe(800);
    rerender({ key: 'key-b' });
    paperSx = (result.current.dialogSx as any)['.MuiDialog-paper'];
    expect(paperSx.width).toBe(1200);
  });

  it('drops resize events below the minimum without writing', () => {
    const { result } = renderHook(() => useResizableDialogSize(KEY, true));
    act(() => {
      attachPaperRef(result);
    });
    act(() => primeObserver());
    act(() => {
      fireResize(100, 100);
      vi.advanceTimersByTime(300);
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
