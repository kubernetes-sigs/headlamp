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
  label: string;
  pct: number; // 0-100
  gradient?: boolean; // green→yellow→red gradient when true (default true)
}

const FILL_GRADIENT = 'linear-gradient(90deg, #4ade80, #fbbf24 70%, #ef4444)';
const FILL_FLAT = '#7aa2ea';

export function GpuBar({ label, pct, gradient = true }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 5,
        fontSize: 9,
        color: '#7a8499',
      }}
    >
      <span style={{ minWidth: 28, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%',
            borderRadius: 3,
            background: gradient ? FILL_GRADIENT : FILL_FLAT,
          }}
        />
      </div>
      <span
        style={{
          color: '#e6ebf5',
          fontWeight: 600,
          minWidth: 28,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
