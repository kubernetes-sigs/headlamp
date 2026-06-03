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
import { Sparkline } from '../canvas/Sparkline';

interface Props {
  label: string;
  value: string;
  unit?: string;
  delta?: string; // leading '!' = warn; leading '-'/'−' = down; else up
  color?: string;
  wide?: boolean;
}

export function MetricCard({ label, value, unit, delta, color = '#7aa2ea', wide }: Props) {
  const deltaWarn = delta?.startsWith('!');
  const deltaDown = delta?.startsWith('−') || delta?.startsWith('-');
  const deltaText = delta?.replace(/^!/, '');
  const deltaColor = deltaWarn ? '#fbbf24' : deltaDown ? '#ef4444' : '#4ade80';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid #1a2236',
        borderRadius: 5,
        padding: 10,
        gridColumn: wide ? 'span 2' : undefined,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#5a6478',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          color: '#fff',
          fontWeight: 600,
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {unit && (
          <span style={{ color: '#5a6478', fontSize: 11, fontWeight: 400, marginLeft: 2 }}>
            {unit}
          </span>
        )}
        {delta && (
          <span style={{ fontSize: 10, color: deltaColor, marginLeft: 4 }}>{deltaText}</span>
        )}
      </div>
      <div style={{ marginTop: 6 }}>
        <Sparkline
          points={[8, 7, 6, 7, 5, 6, 4, 5, 3, 4, 2]}
          color={color}
          height={24}
          strokeWidth={1.5}
        />
      </div>
    </div>
  );
}
