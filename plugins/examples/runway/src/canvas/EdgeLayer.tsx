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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DemoEdge, EdgeKind } from '../fixtures/types';

interface Props {
  edges: DemoEdge[];
  // Map of node id -> DOM element. Live ref the parent updates as nodes mount.
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  // The canvas element used as the bounding-rect origin for path coordinates.
  canvasRef: React.RefObject<HTMLDivElement>;
}

interface Path {
  d: string;
  kind: EdgeKind;
  tooltip: string;
  id: string;
}
interface TipState {
  x: number;
  y: number;
  text: string;
  visible: boolean;
}

function strokeFor(kind: EdgeKind): React.SVGProps<SVGPathElement> {
  switch (kind) {
    case 'routes':
    case 'selects':
    case 'calls-runtime':
      return { stroke: 'url(#g-route)', strokeWidth: 2 };
    case 'owns':
      return { stroke: 'rgba(122,162,234,0.4)', strokeWidth: 1.5, strokeDasharray: '3 3' };
    case 'mounts':
      return { stroke: 'rgba(94,168,160,0.5)', strokeWidth: 1.5, strokeDasharray: '4 2' };
    case 'refs':
      return { stroke: 'rgba(155,124,184,0.5)', strokeWidth: 1.5, strokeDasharray: '2 3' };
  }
}

export function EdgeLayer({ edges, nodeRefs, canvasRef }: Props) {
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<TipState>({ x: 0, y: 0, text: '', visible: false });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });

      const next: Path[] = [];
      for (const e of edges) {
        const a = nodeRefs.current.get(e.source);
        const b = nodeRefs.current.get(e.target);
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const x1 = ar.right - rect.left;
        const y1 = ar.top + ar.height / 2 - rect.top;
        const x2 = br.left - rect.left;
        const y2 = br.top + br.height / 2 - rect.top;
        const mx = (x1 + x2) / 2;
        const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
        next.push({ d, kind: e.kind, tooltip: e.tooltip, id: `${e.source}-${e.target}` });
      }
      setPaths(next);
    };

    // Defer the first measure to the next animation frame so the sibling
    // nodes have completed their initial layout — measuring synchronously
    // inside the effect can read zero-size rects on mount.
    const initialRaf = requestAnimationFrame(measure);

    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(initialRaf);
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // nodeRefs and canvasRef are stable refs (the .current is read inside
    // measure(), not captured), so they are intentionally omitted from the
    // dep array. edges is a module-level import in the current caller so
    // its identity is stable across renders.
  }, [edges]);

  const onMove = (e: React.MouseEvent, text: string) => {
    setTip({ x: e.clientX + 12, y: e.clientY + 12, text, visible: true });
  };
  const onLeave = () => setTip(t => ({ ...t, visible: false }));

  const tipParts = useMemo(() => tip.text.split('·').map(s => s.trim()), [tip.text]);

  return (
    <>
      <svg
        viewBox={`0 0 ${size.w} ${size.h}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
      >
        <defs>
          <linearGradient id="g-route" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#7aa2ea" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7aa2ea" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        {paths.map(p => {
          const stroke = strokeFor(p.kind);
          const hovered = hoveredId === p.id;
          return (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              strokeLinecap="round"
              {...stroke}
              stroke={hovered ? '#f5a06b' : stroke.stroke}
              strokeWidth={hovered ? 3 : stroke.strokeWidth}
              style={{
                pointerEvents: 'stroke',
                filter: hovered ? 'drop-shadow(0 0 6px rgba(245,160,107,0.5))' : undefined,
                transition: 'stroke-width 0.15s, stroke 0.15s',
              }}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => {
                setHoveredId(null);
                onLeave();
              }}
              onMouseMove={e => onMove(e, p.tooltip)}
            />
          );
        })}
      </svg>
      <div
        role="tooltip"
        style={{
          position: 'fixed',
          left: tip.x,
          top: tip.y,
          background: '#1a2236',
          border: '1px solid #2a3450',
          color: '#c8d1e0',
          fontSize: 11,
          padding: '5px 9px',
          borderRadius: 4,
          pointerEvents: 'none',
          opacity: tip.visible ? 1 : 0,
          transition: 'opacity 0.1s',
          zIndex: 20,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        {tipParts[0] && (
          <div>
            <span style={{ color: '#7aa2ea', fontWeight: 600 }}>{tipParts[0]}</span>
          </div>
        )}
        {tipParts.length > 1 && (
          <div style={{ color: '#5a6478', fontSize: 10 }}>{tipParts.slice(1).join(' · ')}</div>
        )}
      </div>
    </>
  );
}
