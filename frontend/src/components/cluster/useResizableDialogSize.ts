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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Persisted dialog dimensions (in CSS pixels).
 */
export interface ResizableDialogSize {
  width: number;
  height: number;
}

/** Minimum width the dialog is allowed to shrink to. */
export const RESIZABLE_DIALOG_MIN_WIDTH = 500;
/** Minimum height the dialog is allowed to shrink to. */
export const RESIZABLE_DIALOG_MIN_HEIGHT = 300;
/** Maximum viewport-relative bounds so the drag handle never falls off-screen. */
const MAX_VW_PERCENT = 95;
const MAX_VH_PERCENT = 95;
/** Debounce for ResizeObserver to localStorage writes. */
const DEBOUNCE_MS = 300;
/** Tolerance in pixels when comparing observed size to computed CSS clamp. */
const CLAMP_MATCH_TOLERANCE_PX = 2;

function safeReadSize(storageKey: string): ResizableDialogSize | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height) &&
      parsed.width >= RESIZABLE_DIALOG_MIN_WIDTH &&
      parsed.height >= RESIZABLE_DIALOG_MIN_HEIGHT
    ) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    // localStorage disabled/blocked or JSON invalid. Fall back to defaults.
  }
  return null;
}

function safeWriteSize(storageKey: string, size: ResizableDialogSize): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(size));
  } catch {
    // Storage full/blocked. The next resize will just re-try.
  }
}

function clampToViewport(size: ResizableDialogSize): ResizableDialogSize | null {
  const maxWidth = Math.floor((window.innerWidth * MAX_VW_PERCENT) / 100);
  const maxHeight = Math.floor((window.innerHeight * MAX_VH_PERCENT) / 100);
  // When either viewport dimension is too small to honor the minimum, don't
  // impose a preferred size at all. The CSS `minWidth`/`minHeight` would
  // otherwise win over `maxWidth`/`maxHeight`, leaving the drag handle
  // offscreen on a wide-but-short (or narrow-but-tall) window.
  if (maxWidth < RESIZABLE_DIALOG_MIN_WIDTH || maxHeight < RESIZABLE_DIALOG_MIN_HEIGHT) {
    return null;
  }
  return {
    width: Math.min(Math.max(size.width, RESIZABLE_DIALOG_MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(size.height, RESIZABLE_DIALOG_MIN_HEIGHT), maxHeight),
  };
}

/**
 * Makes an MUI Dialog user-resizable and persists the size in `localStorage`.
 *
 * Returns a `paperRef` to attach via `PaperProps={{ ref }}` and an `sx` object
 * to spread onto the Dialog. A `ResizeObserver` on the paper element writes
 * debounced size updates to `localStorage[storageKey]` when the user actually
 * drags the corner handle. Observations that merely echo the CSS clamp (i.e.
 * the paper is at `min(preferred, 95vw)` because the viewport is smaller than
 * the stored preference) are ignored, so a session on a smaller monitor does
 * not overwrite the user's larger preference stored on a bigger monitor.
 *
 * The stored size is clamped to `95vw x 95vh` before being applied so the
 * drag handle never lands offscreen. The CSS `maxWidth/maxHeight` bounds do
 * the same at paint time when the viewport is later resized while the dialog
 * is open, so no window resize listener is needed.
 *
 * Pass `enabled = false` (e.g. when the dialog is in fullscreen mode on
 * small viewports) to skip resize entirely: the returned `sx` is empty and
 * no observer is attached.
 *
 * Accessibility note: the resize affordance is the browser's native
 * `resize: both` corner grip and is mouse-only. Keyboard-only users cannot
 * change the size; a future follow-up could add explicit shortcuts.
 */
export function useResizableDialogSize(storageKey: string, enabled: boolean = true) {
  const [paperEl, setPaperEl] = useState<HTMLDivElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived, always-fresh applied size. Recomputes when `storageKey` or
  // `enabled` change (a `useState` initializer would freeze at first mount).
  // Returns null when the viewport can't accommodate the minimum bounds so
  // the paper falls back to MUI defaults + CSS min without an offscreen grip.
  const appliedSize = useMemo<ResizableDialogSize | null>(() => {
    if (!enabled) return null;
    const stored = safeReadSize(storageKey);
    return stored ? clampToViewport(stored) : null;
  }, [enabled, storageKey]);

  // Kept up-to-date via effect so the observer callback closure can read the
  // latest applied intent without re-attaching the observer on every render.
  const appliedSizeRef = useRef<ResizableDialogSize | null>(appliedSize);
  useEffect(() => {
    appliedSizeRef.current = appliedSize;
  }, [appliedSize]);

  // Callback ref so effect setup runs when the paper element mounts, not
  // when the hook first renders. Also handles the paper unmounting cleanly:
  // React invokes the ref with `null`, triggering observer disconnect via
  // the cleanup below.
  const paperRef = useCallback((el: HTMLDivElement | null) => {
    setPaperEl(el);
  }, []);

  useEffect(() => {
    if (!enabled || !paperEl || typeof ResizeObserver === 'undefined') return undefined;

    // Skip the first observation for each mount: it's the browser laying
    // out the paper at MUI's initial size (or at the CSS-clamped stored
    // preference), not a user-driven resize.
    let isFirstObservation = true;

    const observer = new ResizeObserver(entries => {
      if (entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (isFirstObservation) {
        isFirstObservation = false;
        return;
      }
      if (width < RESIZABLE_DIALOG_MIN_WIDTH || height < RESIZABLE_DIALOG_MIN_HEIGHT) return;

      // Ignore observations that just echo the CSS-clamped version of the
      // current applied intent. Without this guard, opening a dialog whose
      // stored preference is larger than the current viewport would clamp
      // the paper to `95vw`, the observer would see that smaller value, and
      // the debounced write would clobber the user's larger preference.
      const current = appliedSizeRef.current;
      if (current) {
        const clamped = clampToViewport(current);
        if (
          clamped &&
          Math.abs(width - clamped.width) < CLAMP_MATCH_TOLERANCE_PX &&
          Math.abs(height - clamped.height) < CLAMP_MATCH_TOLERANCE_PX
        ) {
          return;
        }
      }

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const rounded = { width: Math.round(width), height: Math.round(height) };
        safeWriteSize(storageKey, rounded);
        // Keep the ref in sync with the just-persisted value so a follow-up
        // user drag back to what looks like the *old* clamp threshold isn't
        // silently swallowed. Without this, `appliedSizeRef` remained frozen
        // at mount and later user drags could match the stale clamp value.
        appliedSizeRef.current = rounded;
      }, DEBOUNCE_MS);
    });

    observer.observe(paperEl);
    return () => {
      observer.disconnect();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [enabled, storageKey, paperEl]);

  const dialogSx = useMemo(() => {
    if (!enabled) return {};
    return {
      '.MuiDialog-paper': {
        resize: 'both',
        overflow: 'auto',
        minWidth: RESIZABLE_DIALOG_MIN_WIDTH,
        minHeight: RESIZABLE_DIALOG_MIN_HEIGHT,
        maxWidth: `${MAX_VW_PERCENT}vw`,
        maxHeight: `${MAX_VH_PERCENT}vh`,
        ...(appliedSize ? { width: appliedSize.width, height: appliedSize.height } : {}),
      },
    };
  }, [enabled, appliedSize]);

  return { paperRef, dialogSx };
}
