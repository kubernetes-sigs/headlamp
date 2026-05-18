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

import { useCallback, useState } from 'react';

export interface UseKeyboardNavigationOptions {
  /**
   * Total number of rows currently visible in the table.
   */
  rowCount: number;
  /**
   * Called when the user presses Enter on a focused row.
   * Receives the zero-based index and the originating keyboard event so callers
   * can inspect modifier keys (Ctrl/Cmd/Shift) for e.g. open-in-new-tab.
   */
  onRowOpen?: (rowIndex: number, event: React.KeyboardEvent) => void;
  /**
   * When true, keyboard navigation is active.
   * @default true
   */
  enabled?: boolean;
}

export interface UseKeyboardNavigationResult {
  /**
   * The zero-based index of the currently keyboard-focused row, or -1 when none.
   */
  focusedRowIndex: number;
  /**
   * Attach to the table container's onKeyDown to handle arrow keys and Enter.
   */
  onKeyDown: (e: React.KeyboardEvent) => void;
  /**
   * Call this to clear focused row (e.g. on table blur).
   */
  clearFocus: () => void;
  /**
   * Call this when a row is clicked so keyboard focus tracks mouse clicks too.
   */
  onRowClick: (rowIndex: number) => void;
}

/**
 * Adds arrow-key and Enter keyboard navigation to a table.
 *
 * Navigation is scoped: it only activates when the table container has focus,
 * so it does not interfere with other inputs on the page.
 *
 * - ArrowDown / ArrowUp move the focused row highlight.
 * - Enter opens the focused row via `onRowOpen`.
 *
 * @example
 * ```tsx
 * const { focusedRowIndex, onKeyDown, clearFocus, onRowClick } = useKeyboardNavigation({
 *   rowCount: rows.length,
 *   onRowOpen: index => history.push(`/details/${rows[index].name}`),
 * });
 * // attach onKeyDown and onBlur to the table wrapper, pass focusedRowIndex to rows
 * ```
 */
export function useKeyboardNavigation({
  rowCount,
  onRowOpen,
  enabled = true,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationResult {
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  // Clamp during render: if rowCount shrinks (filter/pagination), reset focus
  // without needing a setState-in-effect.
  const effectiveFocusedRowIndex = focusedRowIndex >= rowCount ? -1 : focusedRowIndex;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || rowCount === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIndex(prev => {
          if (prev === -1) return 0;
          return prev + 1 < rowCount ? prev + 1 : prev;
        });
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIndex(prev => {
          if (prev === -1) return rowCount - 1;
          return prev - 1 >= 0 ? prev - 1 : prev;
        });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (effectiveFocusedRowIndex !== -1 && onRowOpen) {
          onRowOpen(effectiveFocusedRowIndex, e);
        }
        return;
      }
    },
    [enabled, rowCount, effectiveFocusedRowIndex, onRowOpen]
  );

  const clearFocus = useCallback(() => setFocusedRowIndex(-1), []);

  const onRowClick = useCallback((rowIndex: number) => {
    setFocusedRowIndex(rowIndex);
  }, []);

  return { focusedRowIndex: effectiveFocusedRowIndex, onKeyDown, clearFocus, onRowClick };
}
