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

import React, { useCallback, useRef } from 'react';
import { edges } from '../fixtures/edges';
import { nodes } from '../fixtures/nodes';
import { demo } from '../styles/theme';
import { EdgeLayer } from './EdgeLayer';
import { Lane } from './Lane';
import { Legend } from './Legend';
import { Node } from './Node';
import { Toolbar } from './Toolbar';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Canvas({ selectedId, onSelect }: Props) {
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  return (
    <div
      style={{
        flex: 1,
        padding: 24,
        overflow: 'hidden',
        position: 'relative',
        background: demo.canvasBg,
        minHeight: 540,
      }}
    >
      <Toolbar />
      <div ref={canvasRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Lane label="Ingress" left={16} width={200} />
        <Lane label="Agent" left={232} width={240} />
        <Lane label="Models · live" left={488} width={340} />
        <Lane label="Memory · Secrets" left={844} right={16} />

        <EdgeLayer edges={edges} nodeRefs={nodeRefs} canvasRef={canvasRef} />

        {nodes.map(n => (
          <Node
            key={n.id}
            node={n}
            selected={selectedId === n.id}
            onClick={onSelect}
            registerRef={registerRef}
          />
        ))}
      </div>
      <Legend />
    </div>
  );
}
