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

import type { CSSProperties } from 'react';

/** Minimum px of space below the node before the glance flips to open upward. */
export const GLANCE_FLIP_THRESHOLD = 300;
/** Maximum width of the glance card in pixels — must match the `maxWidth` sx value. */
export const GLANCE_MAX_WIDTH = 350;
/** Visual gap between the node edge and the glance card. */
export const GLANCE_GAP = 8;

/**
 * Computes the optimal `position:absolute` style for the glance card.
 *
 * The glance is rendered as an absolutely-positioned child of the ReactFlow node
 * element, so its coordinates are in *node-local* units (screen px ÷ zoom).
 * The canvas element (`.react-flow`, which has `overflow:hidden`) is used as the
 * clipping boundary — not the browser viewport.
 *
 * Placement priority:
 *  1. BELOW  — preferred when ≥ GLANCE_FLIP_THRESHOLD px below the node.
 *  2. ABOVE  — when ≥ GLANCE_FLIP_THRESHOLD px above.
 *  3. LEFT / RIGHT — when neither above nor below fits but there is a side.
 *  4. OVERLAP — last resort: pin to canvas top-left corner so as much content
 *     as possible is visible even when the node fills most of the canvas.
 */
export function computeGlanceStyle(
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  clip: { left: number; top: number; right: number; bottom: number },
  zoom: number
): CSSProperties {
  const MARGIN = 4; // minimum px from any canvas edge
  const gap = GLANCE_GAP * zoom; // gap in screen px

  // Effective glance width in screen px — never wider than the canvas.
  const maxWidthScreen = Math.max(100, clip.right - clip.left - 2 * MARGIN);
  const glanceW = Math.min(GLANCE_MAX_WIDTH * zoom, maxWidthScreen);
  const maxWidthNodeLocal = glanceW / zoom;

  // Clamp a proposed screen-space left into the canvas.
  const clampLeft = (screenLeft: number) =>
    Math.max(clip.left + MARGIN, Math.min(screenLeft, clip.right - glanceW - MARGIN));

  // Shared horizontal placement: left-aligned with node, clamped to canvas.
  const leftAligned = clampLeft(rect.left);
  const leftNodeLocal = (leftAligned - rect.left) / zoom;

  const spaceBelow = clip.bottom - rect.bottom;
  const spaceAbove = rect.top - clip.top;

  if (spaceBelow >= GLANCE_FLIP_THRESHOLD) {
    // ---- 1. BELOW the node (preferred) ----
    const topNodeLocal = rect.height / zoom + GLANCE_GAP;
    const maxHeight = Math.max(50, (clip.bottom - rect.bottom - gap - MARGIN) / zoom);
    return {
      position: 'absolute',
      left: `${leftNodeLocal}px`,
      top: `${topNodeLocal}px`,
      bottom: 'auto',
      maxWidth: `${maxWidthNodeLocal}px`,
      maxHeight: `${maxHeight}px`,
      overflowY: 'auto',
    };
  } else if (spaceAbove >= GLANCE_FLIP_THRESHOLD) {
    // ---- 2. ABOVE the node ----
    const bottomNodeLocal = rect.height / zoom + GLANCE_GAP;
    const maxHeight = Math.max(50, (rect.top - clip.top - gap - MARGIN) / zoom);
    return {
      position: 'absolute',
      left: `${leftNodeLocal}px`,
      bottom: `${bottomNodeLocal}px`,
      top: 'auto',
      maxWidth: `${maxWidthNodeLocal}px`,
      maxHeight: `${maxHeight}px`,
      overflowY: 'auto',
    };
  } else if (
    clip.right - rect.right >= glanceW + gap + MARGIN ||
    rect.left - clip.left >= glanceW + gap + MARGIN
  ) {
    // ---- 3. LEFT or RIGHT ----
    let glanceLeftScreen: number;
    if (
      clip.right - rect.right < glanceW + gap + MARGIN &&
      rect.left - clip.left > clip.right - rect.right
    ) {
      glanceLeftScreen = rect.left - gap - glanceW; // left of node
    } else {
      glanceLeftScreen = rect.right + gap; // right of node
    }
    const leftNodeLocalSide = (clampLeft(glanceLeftScreen) - rect.left) / zoom;
    const maxHeight = Math.max(50, (rect.bottom - clip.top - MARGIN) / zoom);
    return {
      position: 'absolute',
      left: `${leftNodeLocalSide}px`,
      bottom: 0,
      top: 'auto',
      maxWidth: `${maxWidthNodeLocal}px`,
      maxHeight: `${maxHeight}px`,
      overflowY: 'auto',
    };
  } else {
    // ---- 4. OVERLAP the node (last resort) ----
    // Node fills most of the canvas.  Pin the glance to the canvas top-left
    // corner so as much content as possible is visible.
    const overlapLeftNodeLocal = (clip.left + MARGIN - rect.left) / zoom;
    const overlapTopNodeLocal = (clip.top + MARGIN - rect.top) / zoom;
    const maxHeight = Math.max(50, (clip.bottom - clip.top - 2 * MARGIN) / zoom);
    return {
      position: 'absolute',
      left: `${overlapLeftNodeLocal}px`,
      top: `${overlapTopNodeLocal}px`,
      bottom: 'auto',
      maxWidth: `${maxWidthNodeLocal}px`,
      maxHeight: `${maxHeight}px`,
      overflowY: 'auto',
    };
  }
}
