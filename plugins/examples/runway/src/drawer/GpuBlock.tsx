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

interface BarProps {
  label: string;
  value: number;
  unit?: string;
  max?: number;
}
function Bar({ label, value, unit = '%', max = 100 }: BarProps) {
  const pct = unit === '%' ? value : Math.min(100, (value / max) * 100);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr 60px',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
      }}
    >
      <div style={{ color: '#8a93a8' }}>{label}</div>
      <div
        style={{
          height: 7,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 3,
            background: 'linear-gradient(90deg, #4ade80 0%, #fbbf24 70%, #ef4444 100%)',
          }}
        />
      </div>
      <div
        style={{
          color: '#e6ebf5',
          fontWeight: 600,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {unit}
      </div>
    </div>
  );
}

export interface GpuBlockProps {
  sku: string;
  util: number; // %
  smOcc: number; // %
  memBw: number; // %
  power: number; // W
  temp: number; // °C
  ncclBw?: number; // GB/s (omit on single-GPU)
}

export function GpuBlock(p: GpuBlockProps) {
  return (
    <div
      style={{
        background: 'rgba(234,162,122,0.05)',
        border: '1px solid rgba(234,162,122,0.15)',
        borderRadius: 5,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#f5a06b',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            background: 'rgba(234,162,122,0.18)',
            color: '#f5a06b',
            padding: '2px 6px',
            borderRadius: 3,
            fontSize: 9,
          }}
        >
          {p.sku}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: '#5a6478',
            fontWeight: 400,
            fontSize: 9,
            letterSpacing: 0,
          }}
        >
          source: DCGM exporter
        </span>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        <Bar label="GPU util" value={p.util} />
        <Bar label="SM occupancy" value={p.smOcc} />
        <Bar label="Mem bandwidth" value={p.memBw} />
        <Bar label="Power" value={p.power} unit=" W" max={700} />
        <Bar label="Temp" value={p.temp} unit="°C" max={85} />
        {p.ncclBw !== undefined && <Bar label="NCCL b/w" value={p.ncclBw} unit=" GB/s" max={600} />}
      </div>
    </div>
  );
}
