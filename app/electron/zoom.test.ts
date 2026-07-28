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
  createZoomController,
  DEFAULT_ZOOM_FACTOR,
  loadZoomFactor,
  MAX_ZOOM_FACTOR,
  MIN_ZOOM_FACTOR,
  saveZoomFactor,
  ZOOM_STEP,
  ZoomWebContents,
} from './zoom';

function tmpPath(): string {
  return path.join(os.tmpdir(), `zoom-test-${Date.now()}-${Math.random()}.json`);
}

/** A stand-in for Electron's WebContents that records what zoom was applied. */
function fakeWebContents(initialFactor = DEFAULT_ZOOM_FACTOR) {
  let factor = initialFactor;
  let destroyed = false;

  return {
    getZoomFactor: () => factor,
    setZoomFactor: (value: number) => {
      factor = value;
    },
    isDestroyed: () => destroyed,
    /** Simulates zoom changing behind our back (trackpad pinch, Ctrl+wheel, ...). */
    zoomExternallyTo: (value: number) => {
      factor = value;
    },
    destroy: () => {
      destroyed = true;
    },
  };
}

describe('clampZoom', () => {
  it('keeps values within the bounds Electron accepts', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM_FACTOR);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM_FACTOR);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('rounds away floating point drift from repeated steps', () => {
    expect(clampZoom(0.1 + 0.1 + 0.1 + 1)).toBe(1.3);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampZoom(NaN)).toBe(DEFAULT_ZOOM_FACTOR);
    expect(clampZoom(Infinity)).toBe(DEFAULT_ZOOM_FACTOR);
  });
});

describe('zoom persistence', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpPath();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('round-trips a zoom factor', async () => {
    saveZoomFactor(filePath, 1.4);
    expect(await loadZoomFactor(filePath)).toBe(1.4);
  });

  it('defaults when the file does not exist, without logging an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await loadZoomFactor(filePath)).toBe(DEFAULT_ZOOM_FACTOR);
    // A missing file is the normal first-launch case (see #6263).
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('defaults when the file holds malformed JSON', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(filePath, '{not json', 'utf-8');

    expect(await loadZoomFactor(filePath)).toBe(DEFAULT_ZOOM_FACTOR);
  });

  it('defaults when zoomFactor is not a number', async () => {
    fs.writeFileSync(filePath, JSON.stringify({ zoomFactor: 'big' }), 'utf-8');

    expect(await loadZoomFactor(filePath)).toBe(DEFAULT_ZOOM_FACTOR);
  });

  it('clamps an out-of-range value read from disk', async () => {
    // The config file is user-editable, so it can hold a factor Chromium would reject.
    fs.writeFileSync(filePath, JSON.stringify({ zoomFactor: 99 }), 'utf-8');

    expect(await loadZoomFactor(filePath)).toBe(MAX_ZOOM_FACTOR);
  });
});

describe('ZoomController', () => {
  it('applies the zoom factor to the WebContents', () => {
    const webContents = fakeWebContents();
    const controller = createZoomController({ getWebContents: () => webContents });

    controller.set(1.5);

    expect(controller.factor).toBe(1.5);
    expect(webContents.getZoomFactor()).toBe(1.5);
  });

  it('steps up and down by the configured amount', () => {
    const webContents = fakeWebContents();
    const controller = createZoomController({ getWebContents: () => webContents });

    controller.adjust(ZOOM_STEP);
    controller.adjust(ZOOM_STEP);
    expect(controller.factor).toBe(1.2);

    controller.adjust(-ZOOM_STEP);
    expect(controller.factor).toBe(1.1);
  });

  it('clamps instead of running past the bounds', () => {
    const webContents = fakeWebContents();
    const controller = createZoomController({ getWebContents: () => webContents });

    for (let i = 0; i < 100; i++) {
      controller.adjust(ZOOM_STEP);
    }
    expect(controller.factor).toBe(MAX_ZOOM_FACTOR);

    for (let i = 0; i < 100; i++) {
      controller.adjust(-ZOOM_STEP);
    }
    expect(controller.factor).toBe(MIN_ZOOM_FACTOR);
  });

  it('resets to the default', () => {
    const webContents = fakeWebContents();
    const controller = createZoomController({ getWebContents: () => webContents });

    controller.set(1.8);
    controller.reset();

    expect(controller.factor).toBe(DEFAULT_ZOOM_FACTOR);
    expect(webContents.getZoomFactor()).toBe(DEFAULT_ZOOM_FACTOR);
  });

  it('notifies on change so the factor can be persisted', () => {
    const onChange = vi.fn();
    const controller = createZoomController({
      getWebContents: () => fakeWebContents(),
      onChange,
    });

    controller.set(1.3);
    expect(onChange).toHaveBeenCalledWith(1.3);

    // Setting the same factor again is not a change worth persisting.
    onChange.mockClear();
    controller.set(1.3);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not throw when there is no window yet', () => {
    const controller = createZoomController({ getWebContents: () => null });

    expect(() => controller.set(1.5)).not.toThrow();
    expect(controller.factor).toBe(1.5);
  });

  it('does not touch destroyed WebContents', () => {
    const webContents = fakeWebContents();
    const setZoomFactor = vi.spyOn(webContents, 'setZoomFactor');
    const controller = createZoomController({ getWebContents: () => webContents });

    webContents.destroy();
    controller.set(1.5);

    expect(setZoomFactor).not.toHaveBeenCalled();
  });

  it('steps on from a restored zoom factor', () => {
    const webContents = fakeWebContents();
    const controller = createZoomController({ getWebContents: () => webContents });

    // How main.ts restores the persisted factor once the window has loaded.
    controller.set(1.4);
    controller.adjust(ZOOM_STEP);

    expect(controller.factor).toBe(1.5);
  });

  // Regression test for the zoom controls appearing broken after zoom changed
  // outside the app menu. `adjust` must step from what is on screen, not from the
  // last value we applied: Electron only emits `zoom-changed` for user gestures,
  // never for a programmatic setZoomFactor, so an event listener alone is not
  // enough to keep the cached factor accurate.
  it('steps from the on-screen factor when zoom changed behind our back', () => {
    const webContents = fakeWebContents();
    const controller = createZoomController({ getWebContents: () => webContents });

    webContents.zoomExternallyTo(2.0);
    controller.adjust(ZOOM_STEP);

    // Before this fix the cached 1.0 won and the view shrank to 1.1.
    expect(controller.factor).toBe(2.1);
    expect(webContents.getZoomFactor()).toBe(2.1);
  });

  it('steps down from the on-screen factor too', () => {
    const webContents = fakeWebContents();
    const controller = createZoomController({ getWebContents: () => webContents });

    webContents.zoomExternallyTo(2.0);
    controller.adjust(-ZOOM_STEP);

    expect(controller.factor).toBe(1.9);
  });

  describe('syncFromWebContents', () => {
    // Regression test for zoom changing outside the app menu. Before this, the
    // cached factor was write-only: after an external zoom to 2.0, Zoom In applied
    // 1.1 (stale 1.0 + one step) and the view visibly shrank instead of growing.
    it('adopts a zoom change made outside the menu', () => {
      const webContents = fakeWebContents();
      const controller = createZoomController({ getWebContents: () => webContents });

      webContents.zoomExternallyTo(2.0);
      expect(controller.syncFromWebContents()).toBe(true);
      expect(controller.factor).toBe(2.0);

      controller.adjust(ZOOM_STEP);

      expect(controller.factor).toBe(2.1);
      expect(webContents.getZoomFactor()).toBe(2.1);
    });

    it('reports no change when the cache is already accurate', () => {
      const webContents = fakeWebContents();
      const controller = createZoomController({ getWebContents: () => webContents });

      controller.set(1.5);

      expect(controller.syncFromWebContents()).toBe(false);
    });

    it('ignores the sub-epsilon drift Chromium introduces', () => {
      const webContents = fakeWebContents();
      const controller = createZoomController({ getWebContents: () => webContents });
      controller.set(1.5);

      // Chromium stores zoom as a log-scale level, so reading back what we set
      // returns a value that is very slightly off.
      webContents.zoomExternallyTo(1.5000001);

      expect(controller.syncFromWebContents()).toBe(false);
      expect(controller.factor).toBe(1.5);
    });

    it('persists the adopted factor', () => {
      const onChange = vi.fn();
      const webContents = fakeWebContents();
      const controller = createZoomController({ getWebContents: () => webContents, onChange });

      webContents.zoomExternallyTo(1.75);
      controller.syncFromWebContents();

      expect(onChange).toHaveBeenCalledWith(1.75);
    });

    it('does nothing when there is no live window', () => {
      const controller = createZoomController({
        getWebContents: () => null as ZoomWebContents | null,
      });

      expect(controller.syncFromWebContents()).toBe(false);
    });
  });
});
