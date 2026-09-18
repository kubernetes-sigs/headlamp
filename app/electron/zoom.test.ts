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

import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampZoom,
  DEFAULT_ZOOM_FACTOR,
  flushZoomFactorSave,
  loadZoomFactor,
  saveZoomFactor,
} from './zoom';

function tmpPath(): string {
  return path.join(os.tmpdir(), `zoom-test-${Date.now()}-${Math.random()}.json`);
}

describe('zoom load/save', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpPath();
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  });

  it('clamps zoom factor to Electron limits', () => {
    expect(clampZoom(0)).toBe(0.25);
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(10)).toBe(5);
  });

  it('returns default zoom factor for non-finite numbers', () => {
    expect(clampZoom(NaN)).toBe(DEFAULT_ZOOM_FACTOR);
    expect(clampZoom(Infinity)).toBe(DEFAULT_ZOOM_FACTOR);
    expect(clampZoom(-Infinity)).toBe(DEFAULT_ZOOM_FACTOR);
  });

  it('saves and loads the zoom factor', async () => {
    saveZoomFactor(filePath, 0.7);
    flushZoomFactorSave();

    await expect(loadZoomFactor(filePath)).resolves.toBe(0.7);
  });

  it('saves the clamped zoom factor when the value is out of range', async () => {
    saveZoomFactor(filePath, 10);
    flushZoomFactorSave();

    await expect(loadZoomFactor(filePath)).resolves.toBe(5);
  });

  it('debounces rapid saves into one write of the latest value', async () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    try {
      saveZoomFactor(filePath, 0.5);
      saveZoomFactor(filePath, 0.6);
      saveZoomFactor(filePath, 0.7);
      expect(writeSpy).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(writeSpy).toHaveBeenCalledTimes(1);
    } finally {
      writeSpy.mockRestore();
      vi.useRealTimers();
    }

    await expect(loadZoomFactor(filePath)).resolves.toBe(0.7);
  });

  it('flushZoomFactorSave writes a pending value immediately', async () => {
    saveZoomFactor(filePath, 0.8);
    // No timers elapse; flush must persist the pending value.
    flushZoomFactorSave();

    await expect(loadZoomFactor(filePath)).resolves.toBe(0.8);
  });

  it('flushZoomFactorSave is a no-op with nothing pending', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    try {
      flushZoomFactorSave();
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('loads the default zoom factor when the file is missing', async () => {
    await expect(loadZoomFactor(filePath)).resolves.toBe(DEFAULT_ZOOM_FACTOR);
  });

  it('loads the default zoom factor when the saved value is invalid', async () => {
    fs.writeFileSync(filePath, JSON.stringify({ zoomFactor: '0.7' }), 'utf-8');

    await expect(loadZoomFactor(filePath)).resolves.toBe(DEFAULT_ZOOM_FACTOR);
  });

  it('clamps the loaded zoom factor', async () => {
    fs.writeFileSync(filePath, JSON.stringify({ zoomFactor: 10 }), 'utf-8');

    await expect(loadZoomFactor(filePath)).resolves.toBe(5);
  });

  it('loads the default zoom factor when the file contains corrupted JSON', async () => {
    fs.writeFileSync(filePath, '{ "zoomFactor": ', 'utf-8');

    await expect(loadZoomFactor(filePath)).resolves.toBe(DEFAULT_ZOOM_FACTOR);
  });

  it('loads the default zoom factor when the saved value is null', async () => {
    fs.writeFileSync(filePath, JSON.stringify({ zoomFactor: null }), 'utf-8');

    await expect(loadZoomFactor(filePath)).resolves.toBe(DEFAULT_ZOOM_FACTOR);
  });
});
