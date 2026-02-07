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

import { Options, useHotkeys } from 'react-hotkeys-hook';
import { useTypedSelector } from '../redux/hooks';

/**
 * A wrapper around useHotkeys that uses configurable shortcuts from the Redux store.
 *
 * @param shortcutId - The ID of the shortcut (e.g., 'GLOBAL_SEARCH', 'CLUSTER_CHOOSER')
 * @param callback - The callback function to execute when the shortcut is triggered
 * @param options - Additional options to pass to useHotkeys
 * @param deps - Dependencies array for the callback
 */
export function useShortcut(
  shortcutId: string,
  callback: (event: KeyboardEvent) => void,
  options?: Options,
  deps?: any[]
) {
  const shortcut = useTypedSelector(state => state.shortcuts.shortcuts[shortcutId]);
  const key = shortcut?.key || '';

  return useHotkeys(
    key,
    (event: KeyboardEvent) => {
      if (key) {
        callback(event);
      }
    },
    { preventDefault: true, ...options },
    deps
  );
}

/**
 * Get the display string for a shortcut key combination.
 * Converts 'ctrl+shift+l' to 'Ctrl+Shift+L' for display purposes.
 *
 * @param key - The shortcut key string
 * @returns A formatted display string
 */
export function formatShortcutKey(key: string): string {
  if (!key) return '';

  return key
    .split('+')
    .map(part => {
      const lowerPart = part.toLowerCase();
      if (lowerPart === 'ctrl') return 'Ctrl';
      if (lowerPart === 'shift') return 'Shift';
      if (lowerPart === 'alt') return 'Alt';
      if (lowerPart === 'meta' || lowerPart === 'cmd') return '⌘';
      if (lowerPart === 'arrowup') return '↑';
      if (lowerPart === 'arrowdown') return '↓';
      if (lowerPart === 'arrowleft') return '←';
      if (lowerPart === 'arrowright') return '→';
      if (lowerPart === 'enter') return 'Enter';
      if (lowerPart === 'escape' || lowerPart === 'esc') return 'Esc';
      if (lowerPart === 'space') return 'Space';
      if (lowerPart === 'tab') return 'Tab';
      if (lowerPart === 'backspace') return 'Backspace';
      if (lowerPart === 'delete') return 'Delete';
      return part.toUpperCase();
    })
    .join(' + ');
}

/**
 * Hook to get the current shortcut key for a given shortcut ID
 *
 * @param shortcutId - The ID of the shortcut
 * @returns The current key combination string
 */
export function useShortcutKey(shortcutId: string): string {
  const shortcut = useTypedSelector(state => state.shortcuts.shortcuts[shortcutId]);
  return shortcut?.key || '';
}
