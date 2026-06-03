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
  values: number[]; // bar heights 0-100
  hotFromIndex?: number; // bars >= this index render in warning color
  labels?: string[]; // optional axis labels
}

export function Histogram({ values, hotFromIndex, labels }: Props) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4, padding: 10 }}>
      {labels && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            color: '#5a6478',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: 6,
          }}
        >
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 36 }}>
        {values.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background:
                hotFromIndex !== undefined && i >= hotFromIndex
                  ? 'rgba(245,160,107,0.5)'
                  : 'rgba(122,162,234,0.4)',
              borderRadius: '1px 1px 0 0',
              minHeight: 2,
              height: `${v}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
