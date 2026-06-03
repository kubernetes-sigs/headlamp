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
import { demo } from '../styles/theme';

interface Props {
  label: string;
  left: number; // px from canvas left, or use right when set
  width?: number; // px; omit when right is set
  right?: number; // px from canvas right
}

export function Lane({ label, left, width, right }: Props) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 36,
          bottom: 36,
          left,
          width,
          right,
          borderRadius: 8,
          background: demo.laneBg,
          border: demo.laneBorder,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: left + 12,
          fontSize: 10,
          color: demo.laneLabel,
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </>
  );
}
