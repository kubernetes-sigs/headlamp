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

import React from 'react';

interface Props {
  points: number[]; // y values; typically 0-10
  color: string;
  height?: number; // default 12
  strokeWidth?: number; // default 1.2
}

// Tiny inline SVG sparkline. Pure, no state. The y-axis runs 0 (top)
// to 10 (bottom) so the caller can think in "high number = peak."
export function Sparkline({ points, color, height = 12, strokeWidth = 1.2 }: Props) {
  if (points.length === 0) return null;
  const step = 100 / (points.length - 1 || 1);
  const polyline = points.map((p, i) => `${i * step},${p}`).join(' ');
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ flex: 1, height, display: 'block' }}
      aria-hidden="true"
    >
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={strokeWidth} />
    </svg>
  );
}
