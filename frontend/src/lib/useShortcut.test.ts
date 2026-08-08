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

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hotkeys-hook', async () => {
  const actual = await vi.importActual<typeof import('react-hotkeys-hook')>('react-hotkeys-hook');
  return { ...actual, useHotkeys: vi.fn() };
});

import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Provider } from 'react-redux';
import { formatShortcutKey, useShortcut } from './useShortcut';

// A minimal fixed reducer, instead of the real shortcutsSlice, so the test isn't
// order-dependent on whatever localStorage happened to hold when that module's
// initialState was computed at import time.
function shortcutsReducer(
  state = { shortcuts: { GLOBAL_SEARCH: { id: 'GLOBAL_SEARCH', key: '/' } } }
) {
  return state;
}

function makeStore() {
  return configureStore({ reducer: { shortcuts: shortcutsReducer } });
}

function makeWrapper() {
  const store = makeStore();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store, children });
  };
}

describe('useShortcut', () => {
  beforeEach(() => {
    vi.mocked(useHotkeys).mockReset();
  });

  it('calls event.preventDefault() when the shortcut fires', () => {
    let hotkeyCallback: ((e: KeyboardEvent) => void) | undefined;
    vi.mocked(useHotkeys).mockImplementation((_key: any, cb: any) => {
      hotkeyCallback = cb;
      return undefined as any;
    });

    renderHook(() => useShortcut('GLOBAL_SEARCH', () => {}), {
      wrapper: makeWrapper(),
    });

    const event = { preventDefault: vi.fn() } as unknown as KeyboardEvent;
    hotkeyCallback!(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('forwards other options to useHotkeys', () => {
    renderHook(() => useShortcut('GLOBAL_SEARCH', () => {}, { enabled: true }), {
      wrapper: makeWrapper(),
    });

    const [, , opts] = vi.mocked(useHotkeys).mock.calls[0] as any[];
    expect(opts).toEqual({ enabled: true });
  });

  it('never forwards preventDefault to useHotkeys options', () => {
    // Typed out of the signature, so this only guards against untyped JS callers.
    renderHook(() => useShortcut('GLOBAL_SEARCH', () => {}, { preventDefault: false } as any), {
      wrapper: makeWrapper(),
    });

    const [, , opts] = vi.mocked(useHotkeys).mock.calls[0] as any[];
    expect(opts).not.toHaveProperty('preventDefault');
  });
});

describe('formatShortcutKey', () => {
  describe('single keys', () => {
    it('should format single character key to uppercase', () => {
      expect(formatShortcutKey('a')).toBe('A');
      expect(formatShortcutKey('k')).toBe('K');
    });

    it('should preserve special characters', () => {
      expect(formatShortcutKey('/')).toBe('/');
    });

    it('should capitalize special keys', () => {
      expect(formatShortcutKey('space')).toBe('Space');
      expect(formatShortcutKey('enter')).toBe('Enter');
      expect(formatShortcutKey('escape')).toBe('Esc');
    });

    it('should handle arrow keys', () => {
      expect(formatShortcutKey('ArrowDown')).toBe('↓');
      expect(formatShortcutKey('ArrowUp')).toBe('↑');
      expect(formatShortcutKey('ArrowLeft')).toBe('←');
      expect(formatShortcutKey('ArrowRight')).toBe('→');
    });
  });

  describe('modifier combinations', () => {
    it('should format ctrl combinations', () => {
      expect(formatShortcutKey('ctrl+k')).toBe('Ctrl + K');
      expect(formatShortcutKey('ctrl+a')).toBe('Ctrl + A');
    });

    it('should format shift combinations', () => {
      expect(formatShortcutKey('shift+k')).toBe('Shift + K');
    });

    it('should format alt combinations', () => {
      expect(formatShortcutKey('alt+a')).toBe('Alt + A');
    });

    it('should format meta key', () => {
      expect(formatShortcutKey('meta+k')).toBe('⌘ + K');
    });

    it('should format ctrl+shift combinations', () => {
      expect(formatShortcutKey('ctrl+shift+l')).toBe('Ctrl + Shift + L');
      expect(formatShortcutKey('ctrl+shift+t')).toBe('Ctrl + Shift + T');
      expect(formatShortcutKey('ctrl+shift+f')).toBe('Ctrl + Shift + F');
    });

    it('should format multiple modifiers', () => {
      expect(formatShortcutKey('ctrl+shift+alt+k')).toBe('Ctrl + Shift + Alt + K');
    });

    it('should format ctrl combinations with special keys', () => {
      expect(formatShortcutKey('ctrl+space')).toBe('Ctrl + Space');
      expect(formatShortcutKey('ctrl+enter')).toBe('Ctrl + Enter');
    });

    it('should format ctrl combinations with arrows', () => {
      expect(formatShortcutKey('ctrl+ArrowUp')).toBe('Ctrl + ↑');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(formatShortcutKey('')).toBe('');
    });

    it('should handle lowercase modifiers', () => {
      expect(formatShortcutKey('ctrl+k')).toBe('Ctrl + K');
    });
  });
});
