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

// Color palette for the topology demo canvas. The demo deliberately
// uses its own dark palette rather than MUI theme colors because the
// canvas is meant to feel visually distinct from the rest of Headlamp.
export const demo = {
  canvasBg: 'radial-gradient(ellipse at 60% 40%, #131a2e 0%, #0a0f1c 70%)',
  laneBg: 'rgba(255,255,255,0.015)',
  laneBorder: '1px dashed rgba(255,255,255,0.05)',
  laneLabel: '#5a6478',

  nodeBg: 'linear-gradient(180deg, rgba(26,34,54,0.95) 0%, rgba(19,26,46,0.95) 100%)',
  nodeBorder: 'rgba(74,127,193,0.35)',
  nodeBorderHover: 'rgba(122,162,234,0.7)',
  nodeText: '#e6ebf5',
  nodeSubText: '#7a8499',

  gpuBorder: 'rgba(234,162,122,0.4)',
  gpuBorderHover: 'rgba(255,180,140,0.8)',
  gpuGlow: '0 0 18px rgba(234,162,122,0.15)',
  gpuGlowHover: '0 0 22px rgba(234,162,122,0.35)',
  gpuAccent: '#f5a06b',

  agentBorder: 'rgba(167,139,250,0.4)',
  agentGlow: '0 0 18px rgba(167,139,250,0.15)',
  agentAccent: '#c4b5fd',

  secretAccent: '#b89bd9',
  storageAccent: '#6ec5ba',

  status: {
    ok: '#4ade80',
    warn: '#fbbf24',
    err: '#ef4444',
  },

  edge: {
    routes: 'url(#g-route)',
    owns: 'rgba(122,162,234,0.4)',
    mounts: 'rgba(94,168,160,0.5)',
    refs: 'rgba(155,124,184,0.5)',
    callsRuntime: 'url(#g-route)', // forward-looking; rendered like routes
    hover: '#f5a06b',
  },
};

export type StatusColor = 'ok' | 'warn' | 'err';
