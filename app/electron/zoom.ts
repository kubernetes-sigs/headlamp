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

import * as fsPromises from 'fs/promises';
import fs from 'node:fs';

export const DEFAULT_ZOOM_FACTOR = 1.0;

/** Chromium rejects a zoom factor outside these bounds. */
export const MIN_ZOOM_FACTOR = 0.25;
export const MAX_ZOOM_FACTOR = 5.0;

/** How much a single Zoom In / Zoom Out step changes the factor. */
export const ZOOM_STEP = 0.1;

/**
 * Zoom factors closer together than this are treated as equal. Chromium stores zoom
 * internally as a log-scale level, so a round trip through it returns a value that is
 * very slightly off the one we set.
 */
const ZOOM_EPSILON = 0.001;

/** The zoom factor should respect the fixed limits set by Electron. */
export function clampZoom(factor: number): number {
  if (!Number.isFinite(factor)) {
    return DEFAULT_ZOOM_FACTOR;
  }

  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, roundZoom(factor)));
}

/**
 * Rounds to two decimals so repeated steps don't accumulate binary floating point
 * error (0.1 + 0.1 + 0.1 = 0.30000000000000004), which would otherwise be written
 * to disk and shown to the user.
 */
export function roundZoom(factor: number): number {
  return Math.round(factor * 100) / 100;
}

export function zoomFactorEquals(a: number, b: number): boolean {
  return Math.abs(a - b) <= ZOOM_EPSILON;
}

/**
 * Reads the persisted zoom factor, falling back to the default when the file is
 * missing (first launch) or holds anything we can't use.
 */
export async function loadZoomFactor(filePath: string): Promise<number> {
  let content: string;
  try {
    content = await fsPromises.readFile(filePath, 'utf-8');
  } catch (err) {
    // A missing file is the normal first-launch case, not an error worth reporting.
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('Failed to load zoom factor, defaulting to 1.0:', err);
    }
    return DEFAULT_ZOOM_FACTOR;
  }

  try {
    const parsed = JSON.parse(content);
    const zoomFactor = parsed?.zoomFactor;
    // The file is user-editable, so treat anything non-numeric as unset.
    return typeof zoomFactor === 'number' ? clampZoom(zoomFactor) : DEFAULT_ZOOM_FACTOR;
  } catch (err) {
    console.error('Failed to parse zoom factor, defaulting to 1.0:', err);
    return DEFAULT_ZOOM_FACTOR;
  }
}

/**
 * Persists the zoom factor. Write errors are logged and swallowed so a failure here
 * (e.g. an unwritable config file) can't take down the Electron main process; the
 * runtime zoom still applies, it just isn't restored on the next launch.
 */
export function saveZoomFactor(filePath: string, factor: number): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify({ zoomFactor: clampZoom(factor) }), 'utf-8');
  } catch (err) {
    console.error('Failed to save zoom factor:', err);
  }
}

/** The subset of Electron's WebContents that zoom handling needs. */
export interface ZoomWebContents {
  getZoomFactor(): number;
  setZoomFactor(factor: number): void;
  isDestroyed(): boolean;
}

export interface ZoomControllerOptions {
  /** Resolves the WebContents to zoom, or null when there is no window yet. */
  getWebContents: () => ZoomWebContents | null;
  /** Called whenever the zoom factor changes, so it can be persisted. */
  onChange?: (factor: number) => void;
}

export interface ZoomController {
  /** The zoom factor this controller last applied. */
  readonly factor: number;
  set(factor: number): void;
  adjust(delta: number): void;
  reset(): void;
  /**
   * Re-reads the zoom factor from the WebContents and adopts it.
   *
   * Zoom can change without going through us — a trackpad pinch, Ctrl+wheel, or
   * Chromium restoring a previously stored per-origin zoom. Without this, the cached
   * factor silently diverges from reality and the next Zoom In jumps from the stale
   * value instead of the visible one.
   *
   * @returns true if the cached factor was out of date and has been corrected.
   */
  syncFromWebContents(): boolean;
}

export function createZoomController(options: ZoomControllerOptions): ZoomController {
  const { getWebContents, onChange } = options;
  // Starts at the default; the persisted factor is restored by calling set() once
  // the window has loaded, which keeps the cache and the screen in agreement.
  let cached = DEFAULT_ZOOM_FACTOR;

  function liveWebContents(): ZoomWebContents | null {
    const webContents = getWebContents();
    // The window may be mid-close; setZoomFactor on destroyed WebContents throws.
    return webContents && !webContents.isDestroyed() ? webContents : null;
  }

  function set(factor: number): void {
    const next = clampZoom(factor);
    const changed = !zoomFactorEquals(next, cached);
    cached = next;

    liveWebContents()?.setZoomFactor(next);

    if (changed) {
      onChange?.(next);
    }
  }

  function syncFromWebContents(): boolean {
    const webContents = liveWebContents();
    if (!webContents) {
      return false;
    }

    const actual = webContents.getZoomFactor();
    if (!Number.isFinite(actual) || zoomFactorEquals(actual, cached)) {
      return false;
    }

    cached = clampZoom(actual);
    onChange?.(cached);
    return true;
  }

  return {
    get factor() {
      return cached;
    },
    set,
    adjust(delta: number) {
      // Step from what is actually on screen, not from what we last applied. Zoom
      // can change without going through us, and `zoom-changed` only fires for
      // user gestures, so the cache cannot be kept accurate by events alone.
      syncFromWebContents();
      set(cached + delta);
    },
    reset() {
      set(DEFAULT_ZOOM_FACTOR);
    },
    syncFromWebContents,
  };
}
