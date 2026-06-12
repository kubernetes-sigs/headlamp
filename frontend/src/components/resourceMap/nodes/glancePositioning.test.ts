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

import { computeGlanceStyle } from './glancePositioning';

// Canvas 1200×800, zoom 1, node in the upper part — plenty of space below.
const defaultClip = { left: 0, top: 0, right: 1200, bottom: 800 };
const makeRect = (
  left: number,
  top: number,
  width: number,
  height: number
): { left: number; top: number; right: number; bottom: number; width: number; height: number } => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

describe('computeGlanceStyle', () => {
  describe('placement below (case 1)', () => {
    it('places the glance below the node when there is enough space', () => {
      // Node sits near the top; 630 px of space below — well above FLIP_THRESHOLD 300.
      const rect = makeRect(100, 100, 220, 70);
      const style = computeGlanceStyle(rect, defaultClip, 1);

      expect(style.position).toBe('absolute');
      // top = nodeHeight/zoom + GLANCE_GAP = 70/1 + 8 = 78
      expect(style.top).toBe('78px');
      expect(style.bottom).toBe('auto');
    });

    it('positions glance left-aligned with the node (clamped to canvas)', () => {
      const rect = makeRect(100, 100, 220, 70);
      const style = computeGlanceStyle(rect, defaultClip, 1);
      // leftAligned = clampLeft(100) = max(4, min(100, 1200-350-4)) = 100
      // leftNodeLocal = (100 - 100) / 1 = 0
      expect(style.left).toBe('0px');
    });

    it('clamps the left position when the node is near the right canvas edge', () => {
      // Node near the right edge; left-aligned glance would overflow — must clamp.
      const rect = makeRect(900, 100, 220, 70);
      const style = computeGlanceStyle(rect, defaultClip, 1);
      // glanceW = min(350, 1192) = 350; clamp ceiling = 1200-350-4 = 846
      // leftAligned = clampLeft(900) = min(900, 846) = 846
      // leftNodeLocal = (846 - 900) / 1 = -54
      expect(style.left).toBe('-54px');
    });

    it('respects the zoom factor when computing node-local units', () => {
      const rect = makeRect(100, 100, 440, 140); // zoom-2 equivalent of 220×70 node
      const style = computeGlanceStyle(rect, defaultClip, 2);
      // topNodeLocal = rect.height/zoom + GLANCE_GAP = 140/2 + 8 = 78
      expect(style.top).toBe('78px');
    });
  });

  describe('placement above (case 2)', () => {
    it('flips the glance above when there is not enough space below but enough above', () => {
      // Node near the bottom: only 100 px below, but 450 px above.
      const rect = makeRect(100, 630, 220, 70);
      const style = computeGlanceStyle(rect, defaultClip, 1);

      expect(style.position).toBe('absolute');
      // bottom = nodeHeight/zoom + GLANCE_GAP = 70 + 8 = 78
      expect(style.bottom).toBe('78px');
      expect(style.top).toBe('auto');
    });
  });

  describe('placement right/left (case 3)', () => {
    it('places the glance to the right when the node is vertically centred with no room above/below', () => {
      // Node fills most of the vertical space; space on the right.
      // spaceBelow = 800-560 = 240 < 300; spaceAbove = 200 < 300
      // clip.right - rect.right = 1200-270 = 930 ≥ 350+8+4=362 → right placement
      const rect = makeRect(50, 200, 220, 360);
      const style = computeGlanceStyle(rect, defaultClip, 1);

      expect(style.position).toBe('absolute');
      // glanceLeftScreen = rect.right + gap = 270 + 8 = 278
      // leftNodeLocalSide = (clampLeft(278) - 50) / 1 = (278 - 50) / 1 = 228
      expect(style.left).toBe('228px');
      expect(style.top).toBe('auto');
    });

    it('places the glance to the left when there is more room on the left', () => {
      // Node on the right side; only 80 px to the right, 900 px to the left.
      const rect = makeRect(900, 200, 220, 360);
      const style = computeGlanceStyle(rect, defaultClip, 1);

      expect(style.position).toBe('absolute');
      // clip.right-rect.right = 80 < 362; rect.left-clip.left = 900 ≥ 362 → left side
      // glanceLeftScreen = 900 - 8 - 350 = 542
      // leftNodeLocalSide = (542 - 900) / 1 = -358
      expect(style.left).toBe('-358px');
      expect(style.top).toBe('auto');
    });
  });

  describe('overlap placement (case 4)', () => {
    it('pins the glance to the canvas top-left when the node fills the canvas', () => {
      // Node covers almost the entire canvas — no room above, below, left, or right.
      const rect = makeRect(50, 50, 1100, 700);
      const style = computeGlanceStyle(rect, defaultClip, 1);

      expect(style.position).toBe('absolute');
      // overlapLeftNodeLocal = (clip.left + MARGIN - rect.left) / zoom = (0+4-50)/1 = -46
      expect(style.left).toBe('-46px');
      // overlapTopNodeLocal = (clip.top + MARGIN - rect.top) / zoom = (0+4-50)/1 = -46
      expect(style.top).toBe('-46px');
      expect(style.bottom).toBe('auto');
    });

    it('gives the glance the full canvas height as maxHeight in the overlap case', () => {
      const rect = makeRect(50, 50, 1100, 700);
      const style = computeGlanceStyle(rect, defaultClip, 1);
      // maxHeight = (clip.bottom - clip.top - 2*MARGIN) / zoom = (800 - 0 - 8) / 1 = 792
      expect(style.maxHeight).toBe('792px');
    });

    it('works at zoom ≠ 1 for overlap placement', () => {
      const rect = makeRect(100, 100, 2200, 1400); // large node at zoom 2
      const clip = { left: 0, top: 0, right: 2400, bottom: 1600 };
      const style = computeGlanceStyle(rect, clip, 2);

      // overlapLeftNodeLocal = (0+4-100)/2 = -48
      expect(style.left).toBe('-48px');
      // overlapTopNodeLocal = (0+4-100)/2 = -48
      expect(style.top).toBe('-48px');
    });
  });

  describe('maxHeight floor', () => {
    it('enforces a 50px minimum maxHeight when available space is tiny', () => {
      // Use overlap case (node fills canvas) — maxHeight = max(50, 800-0-8) = 792
      const bigRect = makeRect(50, 50, 1100, 750);
      const style = computeGlanceStyle(bigRect, { left: 0, top: 0, right: 1200, bottom: 800 }, 1);
      expect(parseFloat(style.maxHeight as string)).toBeGreaterThanOrEqual(50);
    });
  });
});
