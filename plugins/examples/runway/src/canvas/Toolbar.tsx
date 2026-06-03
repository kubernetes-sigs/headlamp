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

const btn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#8a93a8',
  cursor: 'pointer',
  padding: '5px 8px',
  fontSize: 12,
  borderRadius: 3,
};
const sep: React.CSSProperties = { width: 1, background: '#1a2236', margin: '4px 2px' };

export function Toolbar() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 32,
        right: 32,
        display: 'flex',
        gap: 6,
        background: 'rgba(13,19,32,0.8)',
        backdropFilter: 'blur(6px)',
        border: '1px solid #1a2236',
        borderRadius: 6,
        padding: 4,
        zIndex: 10,
      }}
    >
      <button type="button" style={btn} title="Zoom in">
        ＋
      </button>
      <button type="button" style={btn} title="Zoom out">
        −
      </button>
      <button type="button" style={btn} title="Fit">
        ⤢ Fit
      </button>
      <div style={sep} />
      <button type="button" style={btn} title="Collapse all">
        ⊟ Collapse
      </button>
      <button type="button" style={btn} title="Layout">
        ⇄ Layout
      </button>
    </div>
  );
}
