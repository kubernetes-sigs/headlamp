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

import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import type { UIPanel } from '../../redux/uiSlice';
import ClusterPreOpenGate from './ClusterPreOpenGate';

export interface ClusterLayoutProps {
  children: ReactNode;
  panels: Record<UIPanel['side'], UIPanel[]>;
  pluginsLoaded: boolean;
}

/** Places plugin panels and cluster chrome behind one preparation boundary. */
export default function ClusterLayout({ children, panels, pluginsLoaded }: ClusterLayoutProps) {
  if (!pluginsLoaded) {
    return null;
  }

  const content = (
    <Box sx={{ display: 'flex', height: '100dvh' }}>
      {panels.left.map(it => (
        <it.component key={it.id} />
      ))}
      <Box
        sx={{
          display: 'flex',
          overflow: 'auto',
          flexDirection: 'column',
          flexGrow: 1,
        }}
      >
        {panels.top.map(it => (
          <it.component key={it.id} />
        ))}
        {children}
        {panels.bottom.map(it => (
          <it.component key={it.id} />
        ))}
      </Box>
      {panels.right.map(it => (
        <it.component key={it.id} />
      ))}
    </Box>
  );

  return <ClusterPreOpenGate>{content}</ClusterPreOpenGate>;
}
