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

import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import React from 'react';
import { drawerDetails, NodeDetail, Section } from '../fixtures/drawerDetails';
import { GpuBlock } from './GpuBlock';
import { Histogram } from './Histogram';
import { MetricCard } from './MetricCard';

interface Props {
  openId: string | null;
  onClose: () => void;
}

function KindAccent({ kind }: { kind: NodeDetail['kindAccent'] }) {
  const color = kind === 'gpu' ? '#f5a06b' : kind === 'agent' ? '#c4b5fd' : '#7aa2ea';
  return color;
}

function SectionView({ s }: { s: Section }) {
  switch (s.kind) {
    case 'banner':
      return (
        <div
          style={{
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: 5,
            padding: 10,
            fontSize: 12,
            color: '#fbbf24',
          }}
        >
          {s.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.title}</div>}
          {s.body}
        </div>
      );
    case 'kv':
      return (
        <>
          {s.rows.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                padding: '5px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <span style={{ color: '#8a93a8' }}>{r.key}</span>
              <span
                style={{
                  color: r.tone === 'ok' ? '#4ade80' : r.tone === 'warn' ? '#fbbf24' : '#e6ebf5',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {r.value}
              </span>
            </div>
          ))}
        </>
      );
    case 'cards':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {s.cards.map((c, i) => (
            <MetricCard key={i} {...c} />
          ))}
        </div>
      );
    case 'gpu':
      return <GpuBlock {...s.gpu} />;
    case 'histogram':
      return <Histogram values={s.values} hotFromIndex={s.hotFromIndex} labels={s.labels} />;
  }
}

export function DetailDrawer({ openId, onClose }: Props) {
  const detail: NodeDetail | undefined = openId ? drawerDetails[openId] : undefined;
  const accentColor = detail ? KindAccent({ kind: detail.kindAccent }) : '#7aa2ea';

  return (
    <Drawer
      anchor="right"
      open={!!detail}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 440,
          background: '#0d1320',
          color: '#c8d1e0',
          borderLeft: '1px solid #1a2236',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {detail && (
        <>
          <div
            style={{
              padding: '18px 22px 14px',
              borderBottom: '1px solid #1a2236',
              position: 'relative',
            }}
          >
            <IconButton
              aria-label="Close"
              size="small"
              onClick={onClose}
              sx={{ position: 'absolute', top: 8, right: 8, color: '#5a6478' }}
            >
              ✕
            </IconButton>
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                color: accentColor,
                fontWeight: 700,
              }}
            >
              {detail.kind}
            </div>
            <h2 style={{ fontSize: 18, color: '#fff', margin: '4px 0 6px', fontWeight: 600 }}>
              {detail.name}
            </h2>
            <div style={{ fontSize: 12, color: '#5a6478' }}>
              {detail.sub} · ns/{detail.ns}
            </div>
          </div>

          <div style={{ padding: '16px 22px', flex: 1, overflowY: 'auto' }}>
            {detail.sections.map((s, i) => (
              <div key={i} style={{ marginBottom: 22 }}>
                {'title' in s && s.title && (
                  <h3
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '1.5px',
                      color: '#5a6478',
                      fontWeight: 700,
                      marginBottom: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {s.title}
                    {'tag' in s && s.tag && (
                      <span
                        style={{
                          background: 'rgba(74,127,193,0.15)',
                          color: '#9ab6e0',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontSize: 9,
                          letterSpacing: '0.5px',
                          textTransform: 'none',
                        }}
                      >
                        {s.tag}
                      </span>
                    )}
                  </h3>
                )}
                <SectionView s={s} />
              </div>
            ))}
          </div>

          <div
            style={{
              padding: '14px 22px',
              borderTop: '1px solid #1a2236',
              display: 'flex',
              gap: 8,
            }}
          >
            {detail.actions.map((a, i) => (
              <Button
                key={i}
                variant={a.primary ? 'contained' : 'outlined'}
                size="small"
                sx={{
                  flex: 1,
                  fontSize: 12,
                  textTransform: 'none',
                  borderColor: '#2a3450',
                  color: a.primary ? '#fff' : '#c8d1e0',
                  background: a.primary ? '#4a7fc1' : 'transparent',
                  '&:hover': {
                    background: a.primary ? '#5a8fd1' : 'rgba(122,162,234,0.08)',
                    borderColor: '#4a7fc1',
                  },
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}
