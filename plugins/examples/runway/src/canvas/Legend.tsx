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

const swatchStyle: React.CSSProperties = { width: 14, borderRadius: 1 };

export function Legend() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        zIndex: 10,
        background: 'rgba(13,19,32,0.85)',
        backdropFilter: 'blur(6px)',
        border: '1px solid #1a2236',
        borderRadius: 6,
        padding: '10px 12px',
        fontSize: 10,
        color: '#8a93a8',
        display: 'flex',
        gap: 14,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ ...swatchStyle, height: 2, background: '#7aa2ea' }} /> routes-to / selects /
        calls-runtime
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ ...swatchStyle, height: 1, borderTop: '1px dashed #7aa2ea' }} /> owns
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ ...swatchStyle, height: 1, borderTop: '1px dashed #6ec5ba' }} /> mounts
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ ...swatchStyle, height: 1, borderTop: '1px dotted #b89bd9' }} /> references
      </span>
    </div>
  );
}
