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
import { DemoNode, NodeChip } from '../fixtures/types';
import { demo } from '../styles/theme';
import { GpuBar } from './GpuBar';
import { Sparkline } from './Sparkline';

interface Props {
  node: DemoNode;
  selected: boolean;
  onClick: (id: string) => void;
  // Refs registered with the parent so EdgeLayer can compute edge endpoints.
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}

// Visual variant -> border/glow color
function kindStyles(kind: DemoNode['kind'], selected: boolean) {
  if (kind === 'gpu') {
    return {
      borderColor: selected ? demo.gpuAccent : demo.gpuBorder,
      boxShadow: selected
        ? `0 0 0 2px rgba(245,160,107,0.35), ${demo.gpuGlowHover}`
        : `${demo.gpuGlow}, 0 2px 8px rgba(0,0,0,0.3)`,
    };
  }
  if (kind === 'agent') {
    return {
      borderColor: selected ? '#c4b5fd' : demo.agentBorder,
      boxShadow: selected
        ? `0 0 0 2px rgba(196,181,253,0.35), ${demo.agentGlow}`
        : `${demo.agentGlow}, 0 2px 8px rgba(0,0,0,0.3)`,
    };
  }
  return {
    borderColor: selected ? '#7aa2ea' : demo.nodeBorder,
    boxShadow: selected
      ? '0 0 0 2px rgba(122,162,234,0.35), 0 4px 16px rgba(122,162,234,0.4)'
      : '0 2px 8px rgba(0,0,0,0.3)',
  };
}

function iconColor(kind: DemoNode['kind']) {
  switch (kind) {
    case 'gpu':
      return demo.gpuAccent;
    case 'agent':
      return demo.agentAccent;
    case 'secret':
      return demo.secretAccent;
    case 'storage':
      return demo.storageAccent;
    default:
      return '#7aa2ea';
  }
}

function Chip({ chip }: { chip: NodeChip }) {
  const palette =
    chip.variant === 'gpu'
      ? { bg: 'rgba(234,162,122,0.15)', fg: '#f5a06b', bd: 'rgba(234,162,122,0.25)' }
      : chip.variant === 'engine'
      ? { bg: 'rgba(94,168,160,0.15)', fg: '#6ec5ba', bd: 'rgba(94,168,160,0.25)' }
      : chip.variant === 'warn'
      ? { bg: 'transparent', fg: '#fbbf24', bd: '#fbbf24' }
      : { bg: 'rgba(74,127,193,0.15)', fg: '#9ab6e0', bd: 'rgba(74,127,193,0.2)' };
  return (
    <span
      style={{
        padding: '1px 5px',
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 600,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
      }}
    >
      {chip.label}
    </span>
  );
}

function StatusDot({ status }: { status?: 'ok' | 'warn' | 'err' }) {
  if (!status) return null;
  const c = demo.status[status];
  return (
    <span
      aria-label={`status ${status}`}
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        display: 'inline-block',
        marginLeft: 'auto',
        background: c,
        boxShadow: `0 0 6px ${c}`,
      }}
    />
  );
}

export function Node({ node, selected, onClick, registerRef }: Props) {
  const kindStyle = kindStyles(node.kind, selected);
  return (
    <div
      ref={el => registerRef(node.id, el)}
      data-node={node.id}
      onClick={() => onClick(node.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick(node.id)}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        minWidth: node.minWidth ?? 150,
        background: demo.nodeBg,
        backdropFilter: 'blur(8px)',
        border: `1px solid ${kindStyle.borderColor}`,
        borderRadius: 6,
        padding: '9px 11px',
        boxShadow: kindStyle.boxShadow,
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        zIndex: selected ? 5 : 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: demo.nodeText,
          fontWeight: 600,
        }}
      >
        <span style={{ color: iconColor(node.kind), fontSize: 11 }}>{node.icon}</span>
        <span>{node.title}</span>
        <StatusDot status={node.status} />
      </div>

      {(node.subtitle || node.chips) && (
        <div
          style={{
            marginTop: 5,
            fontSize: 10,
            color: demo.nodeSubText,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexWrap: 'wrap',
          }}
        >
          {node.chips?.map((c, i) => (
            <Chip key={i} chip={c} />
          ))}
          {node.subtitle && <span>{node.subtitle}</span>}
        </div>
      )}

      {node.faceMetrics && (
        <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {node.faceMetrics.map((m, i) => {
            const deltaWarn = m.delta?.startsWith('!');
            const deltaDown = m.delta?.startsWith('−') || m.delta?.startsWith('-');
            const deltaText = m.delta?.replace(/^!/, '');
            const deltaColor = deltaWarn ? '#fbbf24' : deltaDown ? '#ef4444' : '#4ade80';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  color: demo.nodeSubText,
                  marginBottom: 3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span style={{ minWidth: 48 }}>{m.label}</span>
                <span
                  style={{
                    color: demo.nodeText,
                    fontWeight: 600,
                    minWidth: 56,
                    textAlign: 'right',
                  }}
                >
                  {m.value}
                </span>
                <Sparkline points={m.sparkPoints} color={m.color} />
                {m.delta && <span style={{ fontSize: 9, color: deltaColor }}>{deltaText}</span>}
              </div>
            );
          })}
        </div>
      )}

      {node.inlineBars?.map((b, i) => (
        <GpuBar key={i} label={b.label} pct={b.pct} gradient={b.gradient} />
      ))}
    </div>
  );
}
