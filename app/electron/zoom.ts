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

// The zoom factor should respect the fixed limits set by Electron.
export function clampZoom(factor: number) {
  if (!Number.isFinite(factor)) {
    return DEFAULT_ZOOM_FACTOR;
  }
  return Math.min(5.0, Math.max(0.25, factor));
}

const SAVE_DEBOUNCE_MS = 250;

let saveTimer: NodeJS.Timeout | null = null;
let pendingSave: { filePath: string; factor: number } | null = null;

function writeZoomFactor(filePath: string, factor: number) {
  try {
    fs.writeFileSync(filePath, JSON.stringify({ zoomFactor: clampZoom(factor) }), 'utf-8');
  } catch (err) {
    console.error('Failed to save zoom factor:', err);
  }
}

/**
 * Persists the zoom factor, debounced: rapid zoom gestures coalesce into one
 * write of the latest value so the main process isn't blocked by disk I/O on
 * every step. Call {@link flushZoomFactorSave} before quitting so a pending
 * value isn't lost (see issue #3948).
 */
export function saveZoomFactor(filePath: string, factor: number) {
  pendingSave = { filePath, factor };

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;

    if (pendingSave) {
      const { filePath, factor } = pendingSave;
      pendingSave = null;
      writeZoomFactor(filePath, factor);
    }
  }, SAVE_DEBOUNCE_MS);
}

/** Writes any pending zoom factor immediately. Call before the app quits. */
export function flushZoomFactorSave() {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (pendingSave) {
    const { filePath, factor } = pendingSave;
    pendingSave = null;
    writeZoomFactor(filePath, factor);
  }
}

export async function loadZoomFactor(filePath: string): Promise<number> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const { zoomFactor = DEFAULT_ZOOM_FACTOR } = JSON.parse(content);
    return typeof zoomFactor === 'number' ? clampZoom(zoomFactor) : DEFAULT_ZOOM_FACTOR;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to load zoom factor, defaulting to ${DEFAULT_ZOOM_FACTOR}:`, err);
    }
    return DEFAULT_ZOOM_FACTOR;
  }
}
