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

import { StatusColor } from '../styles/theme';

export type NodeKind = 'entry' | 'agent' | 'gpu' | 'storage' | 'secret';
export type LaneId = 'ingress' | 'agent' | 'models' | 'memory';

export interface NodeChip {
  label: string;
  variant?: 'default' | 'gpu' | 'engine' | 'warn';
}

export interface FaceMetric {
  label: string; // 'TTFT'
  value: string; // '340 ms'
  sparkPoints: number[]; // y-values 0-10
  delta?: string; // '−5%', '+22%', '0' — leading '!' marks warn
  color: string; // sparkline color
}

export interface InlineBar {
  label: string; // 'GPU'
  pct: number; // 0-100
  // When true, the bar uses the green→yellow→red gradient. False = flat accent.
  gradient?: boolean;
}

export interface DemoNode {
  id: string;
  kind: NodeKind;
  lane: LaneId;
  title: string;
  icon: string; // unicode glyph (matches the HTML mockup)
  subtitle?: string;
  status?: StatusColor;
  chips?: NodeChip[];
  faceMetrics?: FaceMetric[];
  inlineBars?: InlineBar[];
  // Absolute position within the canvas. Hand-placed for the demo.
  x: number;
  y: number;
  minWidth?: number;
}

// Edge kinds. 'calls-runtime' is forward-looking — see
// docs/superpowers/specs/projects-and-aks-overlay-feedback.md §2.
export type EdgeKind = 'routes' | 'selects' | 'owns' | 'mounts' | 'refs' | 'calls-runtime';

export interface DemoEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  tooltip: string;
}

export interface ProjectHeader {
  name: string; // 'customer-support-agent'
  displayName: string; // 'Customer Support Agent'
  description: string;
  cluster: string; // 'aks-prod-eastus2'
  namespace: string;
  status: 'Ready' | 'Degraded' | 'Empty';
  bigStats: { value: string; unit?: string; label: string }[];
  miniStats: { icon: string; text: string }[];
}
