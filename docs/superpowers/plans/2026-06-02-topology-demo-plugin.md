# Topology Demo Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Headlamp example plugin at `plugins/examples/runway/` that renders the §6a Topology tab for a fictional Customer Support Agent project, with no backend, no real data, and no cluster connection required.

**Architecture:** Single Headlamp plugin, one route (`/runway/topology-demo`), one page component built from focused subcomponents (canvas + lanes + nodes + edges + drawer). All fixture data lives in TypeScript modules. MUI for the page chrome (drawer, buttons, typography), bespoke CSS-in-JS / inline styles for the topology canvas (the canvas is meant to feel visually distinct from the rest of the app).

**Tech Stack:** TypeScript, React, `@kinvolk/headlamp-plugin`, MUI (provided by Headlamp), inline SVG for edges, vanilla CSS via MUI's `sx` prop and a small style module.

**Reference inputs:**
- Spec: `docs/superpowers/specs/2026-06-02-topology-demo-design.md`
- ADR: `docs/adr/0001-topology-demo-as-headlamp-plugin.md`
- Spec feedback: `docs/superpowers/specs/projects-and-aks-overlay-feedback.md`
- Working mockup (HTML, throwaway): `.superpowers/brainstorm/148292-1780433657/content/topology-demo-v2.html` — the layout, copy, fixture values, and CSS to port live here. Read it before starting Task 4.
- Existing plugin shape to mirror: `plugins/examples/projects/`, `plugins/examples/sidebar/`

---

## File Structure

The plugin is small enough that file boundaries matter — each file should hold one thing so context stays manageable.

**New files (all under `plugins/examples/runway/`):**

| File | Responsibility |
|---|---|
| `package.json` | npm metadata + `@kinvolk/headlamp-plugin` scripts |
| `tsconfig.json` | TS config (mirrors other examples) |
| `src/headlamp-plugin.d.ts` | Headlamp plugin type ambient module (copy from existing example) |
| `src/index.tsx` | Plugin entrypoint: register sidebar group + route; mount `<TopologyDemoPage />` |
| `src/TopologyDemoPage.tsx` | Top-level page: project header + canvas + drawer state |
| `src/fixtures/nodes.ts` | Node fixture array (id, kind, label, lane, position, faceMetrics) |
| `src/fixtures/edges.ts` | Edge fixture array (source, target, kind, tooltip) |
| `src/fixtures/drawerDetails.ts` | Per-node drawer content (sections, metric cards, GPU blocks) |
| `src/fixtures/projectHeader.ts` | Project header strip values |
| `src/canvas/Canvas.tsx` | Lays out the canvas: lanes, nodes, edge SVG, legend, toolbar |
| `src/canvas/Lane.tsx` | One lane (background tint + label) |
| `src/canvas/Node.tsx` | One node: head row, chips, face metrics, GPU bars |
| `src/canvas/EdgeLayer.tsx` | SVG layer that computes bezier paths between node DOM refs + hover tooltips |
| `src/canvas/Sparkline.tsx` | Tiny inline SVG sparkline |
| `src/canvas/GpuBar.tsx` | Inline GPU/KV utilization bar |
| `src/canvas/Legend.tsx` | Bottom-left legend swatches |
| `src/canvas/Toolbar.tsx` | Top-right toolbar buttons (visual only) |
| `src/drawer/DetailDrawer.tsx` | Right-side MUI Drawer; renders sections from `drawerDetails.ts` |
| `src/drawer/MetricCard.tsx` | A single metric card with sparkline |
| `src/drawer/GpuBlock.tsx` | DCGM-shaped GPU telemetry block in the drawer |
| `src/drawer/Histogram.tsx` | TTFT distribution histogram |
| `src/styles/theme.ts` | Shared colors (lane bg, node glow, status palette) so every component pulls from one place |
| `README.md` | What this is, how to install/run, metric source table, glossary, forward-looking caveats |

**Modified files:** none. This plugin is fully additive.

**Key boundary decisions:**
- Fixture data is split per concern (nodes, edges, drawer details, header) so swapping the demo Project later (e.g., a disaggregated-serving example) means editing fixtures, not components.
- Drawer details live in a single `drawerDetails.ts` indexed by node id — the drawer is a pure renderer.
- `EdgeLayer` is the only component with DOM-measurement logic (`getBoundingClientRect`). Everything else is declarative.
- `Sparkline`, `GpuBar`, `MetricCard`, `GpuBlock`, `Histogram` are leaf components — pure, no state.

---

## Task 1 — Scaffold the plugin

**Files:**
- Create: `plugins/examples/runway/package.json`
- Create: `plugins/examples/runway/tsconfig.json`
- Create: `plugins/examples/runway/src/headlamp-plugin.d.ts`
- Create: `plugins/examples/runway/src/index.tsx`
- Create: `plugins/examples/runway/README.md` (placeholder)

- [ ] **Step 1: Create `package.json`** (mirror `plugins/examples/projects/package.json` exactly; only `name` and `description` change)

```json
{
  "name": "runway-topology-demo",
  "version": "0.0.1",
  "description": "AI Runway Topology tab demo — conversation piece for projects-and-aks-overlay.md §6a.",
  "scripts": {
    "start": "headlamp-plugin start",
    "build": "headlamp-plugin build",
    "format": "headlamp-plugin format",
    "lint": "headlamp-plugin lint",
    "lint-fix": "headlamp-plugin lint --fix",
    "tsc": "headlamp-plugin tsc",
    "storybook": "headlamp-plugin storybook",
    "test": "headlamp-plugin test",
    "storybook-build": "headlamp-plugin storybook-build"
  },
  "keywords": ["headlamp", "headlamp-plugin", "kubernetes", "plugins"],
  "prettier": "@headlamp-k8s/eslint-config/prettier-config",
  "eslintConfig": {
    "extends": ["@headlamp-k8s", "prettier", "plugin:jsx-a11y/recommended"]
  },
  "devDependencies": {
    "@kinvolk/headlamp-plugin": "^0.13.1"
  },
  "overrides": {
    "typescript": "5.6.2"
  }
}
```

- [ ] **Step 2: Copy `tsconfig.json` from a sibling example**

```bash
cp plugins/examples/projects/tsconfig.json plugins/examples/runway/tsconfig.json
```

- [ ] **Step 3: Copy the ambient type declarations**

```bash
cp plugins/examples/projects/src/headlamp-plugin.d.ts plugins/examples/runway/src/headlamp-plugin.d.ts
```

- [ ] **Step 4: Write a minimal `index.tsx` that renders "Hello from runway"**

This is the smallest registration that lets us confirm the plugin loads before any of the canvas work begins. Mirror the pattern from `plugins/examples/sidebar/src/index.tsx`.

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
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

import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Typography from '@mui/material/Typography';

// Top-level sidebar group for AI Runway demo content.
registerSidebarEntry({
  parent: null,
  name: 'runway',
  label: 'AI Runway',
  url: '/runway/topology-demo',
  icon: 'mdi:graph-outline',
  useClusterURL: false,
});

registerSidebarEntry({
  parent: 'runway',
  name: 'runway-topology-demo',
  label: 'Topology demo',
  url: '/runway/topology-demo',
  useClusterURL: false,
});

registerRoute({
  path: '/runway/topology-demo',
  sidebar: 'runway-topology-demo',
  name: 'runway-topology-demo',
  exact: true,
  useClusterURL: false,
  noAuthRequired: true,
  component: () => (
    <SectionBox title="AI Runway · Topology demo" paddingTop={2}>
      <Typography>Hello from runway — scaffold OK.</Typography>
    </SectionBox>
  ),
});
```

- [ ] **Step 5: Write a placeholder `README.md`**

One sentence is enough for now; we expand it in Task 14.

```markdown
# runway-topology-demo

Headlamp example plugin: a demo / conversation piece for the Topology
tab described in `projects-and-aks-overlay.md` §6a. See
`docs/superpowers/specs/2026-06-02-topology-demo-design.md` for the
full design.

Install / run instructions: filled in once the plugin renders.
```

- [ ] **Step 6: Install dependencies and verify the plugin builds**

```bash
cd plugins/examples/runway
npm install
npm run tsc
npm run lint
```

Expected: `tsc` passes with no errors; `lint` passes with no errors.

- [ ] **Step 7: Verify the plugin loads in Headlamp (manual smoke)**

```bash
# In one terminal, from plugins/examples/runway:
npm start

# In another terminal, from repo root:
npm run app:run-dev    # or however Headlamp's dev shell launches
```

Expected: Headlamp loads, "AI Runway" appears in the sidebar, clicking "Topology demo" shows the "Hello from runway — scaffold OK." message.

If `app:run-dev` is not the right command, check the repo root `package.json` scripts and use whatever launches Headlamp pointed at the local plugin directory.

- [ ] **Step 8: Commit**

```bash
git add plugins/examples/runway/
git commit -m "examples: runway: Scaffold topology demo plugin

Empty Headlamp plugin shell registering an AI Runway sidebar group
and a Topology demo route. Renders a placeholder so plugin loading
can be verified before any canvas work.

Refs: docs/superpowers/specs/2026-06-02-topology-demo-design.md"
```

---

## Task 2 — Shared theme + style module

**Files:**
- Create: `plugins/examples/runway/src/styles/theme.ts`

One central place for every color the demo uses. Every later component pulls from this. Keeps the visual identity coherent and tweakable in one edit.

- [ ] **Step 1: Write the theme module**

```ts
/*
 * Copyright 2026 The Kubernetes Authors
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
```

- [ ] **Step 2: Run tsc to make sure it compiles**

```bash
cd plugins/examples/runway && npm run tsc
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/examples/runway/src/styles/theme.ts
git commit -m "examples: runway: Add shared theme palette

Central color/glow/border palette for the topology canvas. Every
canvas component pulls from this module so the visual identity stays
coherent and tweakable in one place."
```

---

## Task 3 — Fixture types and project header data

**Files:**
- Create: `plugins/examples/runway/src/fixtures/types.ts`
- Create: `plugins/examples/runway/src/fixtures/projectHeader.ts`

Types first so every fixture file pulls from the same shapes.

- [ ] **Step 1: Write `types.ts`**

```ts
/*
 * Copyright 2026 The Kubernetes Authors
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
  label: string;         // 'TTFT'
  value: string;         // '340 ms'
  sparkPoints: number[]; // y-values 0-10
  delta?: string;        // '−5%', '+22%', '0' — leading '!' marks warn
  color: string;         // sparkline color
}

export interface InlineBar {
  label: string;   // 'GPU'
  pct: number;     // 0-100
  // When true, the bar uses the green→yellow→red gradient. False = flat accent.
  gradient?: boolean;
}

export interface DemoNode {
  id: string;
  kind: NodeKind;
  lane: LaneId;
  title: string;
  icon: string;           // unicode glyph (matches the HTML mockup)
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
  name: string;            // 'customer-support-agent'
  displayName: string;     // 'Customer Support Agent'
  description: string;
  cluster: string;         // 'aks-prod-eastus2'
  namespace: string;
  status: 'Ready' | 'Degraded' | 'Empty';
  bigStats: { value: string; unit?: string; label: string }[];
  miniStats: { icon: string; text: string }[];
}
```

- [ ] **Step 2: Write `projectHeader.ts`**

```ts
/*
 * Copyright 2026 The Kubernetes Authors
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

import { ProjectHeader } from './types';

export const projectHeader: ProjectHeader = {
  name: 'customer-support-agent',
  displayName: 'Customer Support Agent',
  description:
    'Conversational support agent · routes between reasoning, fast-response, ' +
    'and embedding models · RAG over support docs',
  cluster: 'aks-prod-eastus2',
  namespace: 'support',
  status: 'Ready',
  bigStats: [
    { value: '3,240', unit: 'tok/s', label: 'project throughput' },
    { value: '184', unit: 'ms', label: 'avg TTFT' },
    { value: '62', label: 'active sessions' },
    { value: '47%', label: 'cache hit' },
    { value: '$0.84', label: 'cost/1M tok (24h)' },
  ],
  miniStats: [
    { icon: '▣', text: 'GPU pods: 4' },
    { icon: '⬢', text: 'vLLM ×2, TEI ×1' },
  ],
};
```

- [ ] **Step 3: Verify tsc**

```bash
cd plugins/examples/runway && npm run tsc
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add plugins/examples/runway/src/fixtures/
git commit -m "examples: runway: Add fixture types and project header data

Shared types for nodes, edges, face metrics, and the project header
strip. Header data covers the AI-flavored aggregates from the spec
(project throughput, avg TTFT, active sessions, cache hit, cost/1M
tokens)."
```

---

## Task 4 — Node and edge fixtures

Before writing this task, **read the mockup** at `.superpowers/brainstorm/148292-1780433657/content/topology-demo-v2.html` (the section starting around the `<!-- Nodes -->` comment) — the positions, copy, chips, face metrics, and edge list all port directly from it. The plan below repeats the values inline so you can author the fixtures without flipping back, but the HTML is the source of truth for "did I copy the sparkline shape right."

**Files:**
- Create: `plugins/examples/runway/src/fixtures/nodes.ts`
- Create: `plugins/examples/runway/src/fixtures/edges.ts`

- [ ] **Step 1: Write `nodes.ts`**

Values follow the mockup. The `bge-embeddings` node carries the `warn` status. Positions are hand-laid to put each node in its lane's vertical slot.

```ts
/*
 * Copyright 2026 The Kubernetes Authors
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

import { DemoNode } from './types';
import { demo } from '../styles/theme';

export const nodes: DemoNode[] = [
  // ---------- Ingress lane ----------
  {
    id: 'gw', kind: 'entry', lane: 'ingress',
    title: 'Gateway', icon: '▤', subtitle: 'aks-agw-prod · AGIC',
    status: 'ok', x: 32, y: 80,
  },
  {
    id: 'hr', kind: 'entry', lane: 'ingress',
    title: 'HTTPRoute', icon: '⇢', subtitle: 'support-agent.acme.com',
    status: 'ok', x: 32, y: 170,
  },

  // ---------- Agent lane ----------
  {
    id: 'agent', kind: 'agent', lane: 'agent',
    title: 'agent-app', icon: '⬢', status: 'ok', x: 252, y: 110, minWidth: 220,
    chips: [
      { label: '2 pods' },
      { label: 'langgraph', variant: 'engine' },
    ],
    faceMetrics: [
      { label: 'req/s', value: '12.4',
        sparkPoints: [8,7,9,6,5,7,4,6,3,4,2], color: demo.agentAccent },
      { label: 'tool/s', value: '38.2',
        sparkPoints: [7,6,8,5,7,4,6,3,5,2,3], color: demo.agentAccent },
      { label: 'turns', value: '4.1 avg',
        sparkPoints: [6,7,6,5,6,5,6,5,4,5,4], color: demo.agentAccent },
    ],
  },

  // ---------- Models lane ----------
  {
    id: 'md-llama', kind: 'gpu', lane: 'models',
    title: 'llama-3-70b-instruct', icon: '▣', status: 'ok',
    x: 508, y: 52, minWidth: 230,
    chips: [
      { label: 'A100 80G ×2', variant: 'gpu' },
      { label: 'vLLM 0.6', variant: 'engine' },
      { label: 'FP8' },
    ],
    faceMetrics: [
      { label: 'TTFT', value: '340 ms',
        sparkPoints: [7,6,7,8,6,7,5,6,6,5,5], delta: '−5%', color: demo.gpuAccent },
      { label: 'TPOT', value: '38 ms',
        sparkPoints: [6,6,5,6,5,6,5,6,5,6,5], delta: '0', color: demo.gpuAccent },
      { label: 'tok/s', value: '2,140',
        sparkPoints: [8,7,7,5,6,4,5,3,4,3,2], delta: '+4%', color: demo.gpuAccent },
    ],
    inlineBars: [
      { label: 'GPU', pct: 78, gradient: true },
      { label: 'KV', pct: 62, gradient: true },
    ],
  },
  {
    id: 'md-phi', kind: 'gpu', lane: 'models',
    title: 'phi-3-mini-router', icon: '▣', status: 'ok',
    x: 508, y: 240, minWidth: 230,
    chips: [
      { label: 'T4 ×1', variant: 'gpu' },
      { label: 'vLLM 0.6', variant: 'engine' },
      { label: 'spec-dec' },
    ],
    faceMetrics: [
      { label: 'TTFT', value: '62 ms',
        sparkPoints: [7,7,6,7,6,7,6,7,6,7,6], delta: '−1%', color: demo.status.ok },
      { label: 'TPOT', value: '14 ms',
        sparkPoints: [6,5,5,6,5,5,4,5,4,5,4], color: demo.status.ok },
      { label: 'tok/s', value: '780',
        sparkPoints: [7,6,5,6,5,4,5,4,3,4,3], delta: '+6%', color: demo.status.ok },
    ],
    inlineBars: [
      { label: 'GPU', pct: 34, gradient: true },
      { label: 'KV', pct: 18, gradient: true },
    ],
  },
  {
    id: 'md-bge', kind: 'gpu', lane: 'models',
    title: 'bge-embeddings', icon: '▣', status: 'warn',
    x: 508, y: 410, minWidth: 230,
    chips: [
      { label: 'T4 ×1', variant: 'gpu' },
      { label: 'TEI 1.2', variant: 'engine' },
      { label: 'slow', variant: 'warn' },
    ],
    faceMetrics: [
      { label: 'p95', value: '180 ms',
        sparkPoints: [8,7,8,6,5,5,3,4,2,3,2], delta: '!+22%', color: demo.status.warn },
      { label: 'emb/s', value: '420',
        sparkPoints: [5,5,6,5,6,6,7,6,7,7,8], delta: '−4%', color: demo.status.warn },
      { label: 'queue', value: '4',
        sparkPoints: [9,9,9,8,8,7,7,5,4,3,2], delta: '!+3', color: demo.status.warn },
    ],
    inlineBars: [
      { label: 'GPU', pct: 91, gradient: true },
      { label: 'GMEM', pct: 74, gradient: true },
    ],
  },

  // ---------- Memory / Secrets lane ----------
  {
    id: 'vec', kind: 'storage', lane: 'memory',
    title: 'vector-db', icon: '◇', status: 'ok',
    x: 864, y: 80,
    chips: [{ label: '3 pods' }],
    subtitle: 'qdrant · 1.2M vec',
  },
  {
    id: 'pvc', kind: 'storage', lane: 'memory',
    title: 'rag-index', icon: '▭', status: 'ok',
    x: 864, y: 170, subtitle: '50Gi · managed-csi-premium',
  },
  {
    id: 'aoai', kind: 'secret', lane: 'memory',
    title: 'aoai-creds', icon: '🔒', status: 'ok',
    x: 864, y: 250, subtitle: 'Azure OpenAI · credential helper',
  },
  {
    id: 'hf', kind: 'secret', lane: 'memory',
    title: 'hf-token', icon: '🔒', x: 864, y: 320,
    subtitle: 'huggingface registry',
  },
];
```

- [ ] **Step 2: Write `edges.ts`**

```ts
/*
 * Copyright 2026 The Kubernetes Authors
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

import { DemoEdge } from './types';

// 'calls-runtime' is a forward-looking edge kind — see
// docs/superpowers/specs/projects-and-aks-overlay-feedback.md §2.
// Visually rendered like 'routes'.
export const edges: DemoEdge[] = [
  { source: 'hr',         target: 'gw',       kind: 'refs',
    tooltip: 'HTTPRoute → Gateway · references · spec.parentRefs' },
  { source: 'hr',         target: 'agent',    kind: 'routes',
    tooltip: 'HTTPRoute → Service · routes-to · backendRefs' },
  { source: 'agent',      target: 'md-llama', kind: 'calls-runtime',
    tooltip: 'agent calls model · reasoning' },
  { source: 'agent',      target: 'md-phi',   kind: 'calls-runtime',
    tooltip: 'agent calls model · routing / fast-path' },
  { source: 'agent',      target: 'md-bge',   kind: 'calls-runtime',
    tooltip: 'agent calls model · embeddings' },
  { source: 'agent',      target: 'vec',      kind: 'calls-runtime',
    tooltip: 'agent reads vector DB' },
  { source: 'agent',      target: 'aoai',     kind: 'refs',
    tooltip: 'envFrom Secret · AOAI fallback' },
  { source: 'md-bge',     target: 'pvc',      kind: 'mounts',
    tooltip: 'Pod → PVC · mounts · spec.volumes' },
  { source: 'md-llama',   target: 'hf',       kind: 'refs',
    tooltip: 'imagePullSecret · references' },
  { source: 'md-phi',     target: 'hf',       kind: 'refs',
    tooltip: 'imagePullSecret · references' },
];
```

- [ ] **Step 3: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/fixtures/
git commit -m "examples: runway: Add node and edge fixtures

Nine nodes spanning Ingress / Agent / Models / Memory lanes plus the
ten edges connecting them. The bge-embeddings node carries warn
status (GPU 91%, queue growing) to give the demo a story. The
agent→model edges use a forward-looking 'calls-runtime' kind that the
source spec does not yet define — see the spec-feedback note."
```

---

## Task 5 — Sparkline leaf component

**Files:**
- Create: `plugins/examples/runway/src/canvas/Sparkline.tsx`

- [ ] **Step 1: Write `Sparkline.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
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
  points: number[];   // y values; typically 0-10
  color: string;
  height?: number;    // default 12
  strokeWidth?: number; // default 1.2
}

// Tiny inline SVG sparkline. Pure, no state. The y-axis runs 0 (top)
// to 10 (bottom) so the caller can think in "high number = peak."
export function Sparkline({ points, color, height = 12, strokeWidth = 1.2 }: Props) {
  if (points.length === 0) return null;
  const step = 100 / (points.length - 1 || 1);
  const polyline = points.map((p, i) => `${i * step},${p}`).join(' ');
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ flex: 1, height, display: 'block' }}
      aria-hidden="true"
    >
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={strokeWidth} />
    </svg>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/canvas/Sparkline.tsx
git commit -m "examples: runway: Add Sparkline leaf component"
```

---

## Task 6 — GpuBar leaf component

**Files:**
- Create: `plugins/examples/runway/src/canvas/GpuBar.tsx`

- [ ] **Step 1: Write `GpuBar.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';

interface Props {
  label: string;
  pct: number;       // 0-100
  gradient?: boolean; // green→yellow→red gradient when true (default true)
}

const FILL_GRADIENT = 'linear-gradient(90deg, #4ade80, #fbbf24 70%, #ef4444)';
const FILL_FLAT = '#7aa2ea';

export function GpuBar({ label, pct, gradient = true }: Props) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 5,
        fontSize: 9, color: '#7a8499',
      }}
    >
      <span style={{ minWidth: 28, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <div
        style={{
          flex: 1, height: 6, background: 'rgba(255,255,255,0.06)',
          borderRadius: 3, overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%', borderRadius: 3,
            background: gradient ? FILL_GRADIENT : FILL_FLAT,
          }}
        />
      </div>
      <span
        style={{
          color: '#e6ebf5', fontWeight: 600, minWidth: 28,
          textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/canvas/GpuBar.tsx
git commit -m "examples: runway: Add GpuBar leaf component"
```

---

## Task 7 — Node component

**Files:**
- Create: `plugins/examples/runway/src/canvas/Node.tsx`

The Node component is the most visual single piece. Renders icon + title + status dot + chips + face metrics + inline bars. Status dot colors come from theme. Visual flavor per node-kind (gpu glow, agent glow, etc.) is also from theme.

- [ ] **Step 1: Write `Node.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';
import { DemoNode, NodeChip } from '../fixtures/types';
import { demo } from '../styles/theme';
import { Sparkline } from './Sparkline';
import { GpuBar } from './GpuBar';

interface Props {
  node: DemoNode;
  selected: boolean;
  onClick: (id: string) => void;
  // Refs registered with the parent so EdgeLayer can compute edge endpoints.
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}

// Visual variant -> border/glow color
function kindStyles(kind: DemoNode['kind'], selected: boolean) {
  if (kind === 'gpu') {
    return {
      borderColor: selected ? demo.gpuAccent : demo.gpuBorder,
      boxShadow: selected
        ? `0 0 0 2px rgba(245,160,107,0.35), ${demo.gpuGlowHover}`
        : `${demo.gpuGlow}, 0 2px 8px rgba(0,0,0,0.3)`,
    };
  }
  if (kind === 'agent') {
    return {
      borderColor: selected ? '#c4b5fd' : demo.agentBorder,
      boxShadow: selected
        ? `0 0 0 2px rgba(196,181,253,0.35), ${demo.agentGlow}`
        : `${demo.agentGlow}, 0 2px 8px rgba(0,0,0,0.3)`,
    };
  }
  return {
    borderColor: selected ? '#7aa2ea' : demo.nodeBorder,
    boxShadow: selected
      ? '0 0 0 2px rgba(122,162,234,0.35), 0 4px 16px rgba(122,162,234,0.4)'
      : '0 2px 8px rgba(0,0,0,0.3)',
  };
}

function iconColor(kind: DemoNode['kind']) {
  switch (kind) {
    case 'gpu': return demo.gpuAccent;
    case 'agent': return demo.agentAccent;
    case 'secret': return demo.secretAccent;
    case 'storage': return demo.storageAccent;
    default: return '#7aa2ea';
  }
}

function Chip({ chip }: { chip: NodeChip }) {
  const palette = chip.variant === 'gpu'
    ? { bg: 'rgba(234,162,122,0.15)', fg: '#f5a06b', bd: 'rgba(234,162,122,0.25)' }
    : chip.variant === 'engine'
    ? { bg: 'rgba(94,168,160,0.15)', fg: '#6ec5ba', bd: 'rgba(94,168,160,0.25)' }
    : chip.variant === 'warn'
    ? { bg: 'transparent', fg: '#fbbf24', bd: '#fbbf24' }
    : { bg: 'rgba(74,127,193,0.15)', fg: '#9ab6e0', bd: 'rgba(74,127,193,0.2)' };
  return (
    <span
      style={{
        padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
        background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`,
      }}
    >
      {chip.label}
    </span>
  );
}

function StatusDot({ status }: { status?: 'ok' | 'warn' | 'err' }) {
  if (!status) return null;
  const c = demo.status[status];
  return (
    <span
      aria-label={`status ${status}`}
      style={{
        width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
        marginLeft: 'auto', background: c, boxShadow: `0 0 6px ${c}`,
      }}
    />
  );
}

export function Node({ node, selected, onClick, registerRef }: Props) {
  const kindStyle = kindStyles(node.kind, selected);
  return (
    <div
      ref={el => registerRef(node.id, el)}
      data-node={node.id}
      onClick={() => onClick(node.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick(node.id)}
      style={{
        position: 'absolute', left: node.x, top: node.y,
        minWidth: node.minWidth ?? 150,
        background: demo.nodeBg,
        backdropFilter: 'blur(8px)',
        border: `1px solid ${kindStyle.borderColor}`,
        borderRadius: 6, padding: '9px 11px',
        boxShadow: kindStyle.boxShadow,
        cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        zIndex: selected ? 5 : 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: demo.nodeText, fontWeight: 600 }}>
        <span style={{ color: iconColor(node.kind), fontSize: 11 }}>{node.icon}</span>
        <span>{node.title}</span>
        <StatusDot status={node.status} />
      </div>

      {(node.subtitle || node.chips) && (
        <div style={{ marginTop: 5, fontSize: 10, color: demo.nodeSubText,
                      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {node.chips?.map((c, i) => <Chip key={i} chip={c} />)}
          {node.subtitle && <span>{node.subtitle}</span>}
        </div>
      )}

      {node.faceMetrics && (
        <div style={{ marginTop: 8, paddingTop: 7,
                      borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {node.faceMetrics.map((m, i) => {
            const deltaWarn = m.delta?.startsWith('!');
            const deltaDown = m.delta?.startsWith('−') || m.delta?.startsWith('-');
            const deltaText = m.delta?.replace(/^!/, '');
            const deltaColor = deltaWarn ? '#fbbf24' : deltaDown ? '#ef4444' : '#4ade80';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                                    fontSize: 10, color: demo.nodeSubText, marginBottom: 3,
                                    fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ minWidth: 48 }}>{m.label}</span>
                <span style={{ color: demo.nodeText, fontWeight: 600,
                                minWidth: 56, textAlign: 'right' }}>{m.value}</span>
                <Sparkline points={m.sparkPoints} color={m.color} />
                {m.delta && <span style={{ fontSize: 9, color: deltaColor }}>{deltaText}</span>}
              </div>
            );
          })}
        </div>
      )}

      {node.inlineBars?.map((b, i) => (
        <GpuBar key={i} label={b.label} pct={b.pct} gradient={b.gradient} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/canvas/Node.tsx
git commit -m "examples: runway: Add Node component

One node — icon, title, status dot, chips, face metrics with
sparklines, inline GPU/KV bars. Visual variant (GPU glow, agent glow)
driven by kind. Selected state adds a focus ring."
```

---

## Task 8 — Lane, Legend, Toolbar components

**Files:**
- Create: `plugins/examples/runway/src/canvas/Lane.tsx`
- Create: `plugins/examples/runway/src/canvas/Legend.tsx`
- Create: `plugins/examples/runway/src/canvas/Toolbar.tsx`

- [ ] **Step 1: Write `Lane.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';
import { demo } from '../styles/theme';

interface Props {
  label: string;
  left: number;             // px from canvas left, or use right when set
  width?: number;            // px; omit when right is set
  right?: number;            // px from canvas right
}

export function Lane({ label, left, width, right }: Props) {
  return (
    <>
      <div style={{
        position: 'absolute', top: 36, bottom: 36,
        left, width, right,
        borderRadius: 8, background: demo.laneBg, border: demo.laneBorder,
      }} />
      <div style={{
        position: 'absolute', top: 6, left: left + 12,
        fontSize: 10, color: demo.laneLabel,
        textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700,
      }}>
        {label}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Write `Legend.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';

const swatchStyle: React.CSSProperties = { width: 14, borderRadius: 1 };

export function Legend() {
  return (
    <div style={{
      position: 'absolute', left: 24, bottom: 24, zIndex: 10,
      background: 'rgba(13,19,32,0.85)', backdropFilter: 'blur(6px)',
      border: '1px solid #1a2236', borderRadius: 6,
      padding: '10px 12px', fontSize: 10, color: '#8a93a8',
      display: 'flex', gap: 14,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ ...swatchStyle, height: 2, background: '#7aa2ea' }} /> routes-to / selects / calls-runtime
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
```

- [ ] **Step 3: Write `Toolbar.tsx`** (visual only; buttons do nothing)

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';

const btn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#8a93a8', cursor: 'pointer',
  padding: '5px 8px', fontSize: 12, borderRadius: 3,
};
const sep: React.CSSProperties = { width: 1, background: '#1a2236', margin: '4px 2px' };

export function Toolbar() {
  return (
    <div style={{
      position: 'absolute', top: 32, right: 32, display: 'flex', gap: 6,
      background: 'rgba(13,19,32,0.8)', backdropFilter: 'blur(6px)',
      border: '1px solid #1a2236', borderRadius: 6, padding: 4, zIndex: 10,
    }}>
      <button type="button" style={btn} title="Zoom in">＋</button>
      <button type="button" style={btn} title="Zoom out">−</button>
      <button type="button" style={btn} title="Fit">⤢ Fit</button>
      <div style={sep} />
      <button type="button" style={btn} title="Collapse all">⊟ Collapse</button>
      <button type="button" style={btn} title="Layout">⇄ Layout</button>
    </div>
  );
}
```

- [ ] **Step 4: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/canvas/
git commit -m "examples: runway: Add Lane, Legend, Toolbar components"
```

---

## Task 9 — EdgeLayer with bezier paths and hover tooltips

**Files:**
- Create: `plugins/examples/runway/src/canvas/EdgeLayer.tsx`

This is the most logic-heavy canvas piece. It reads node DOM positions via refs, recomputes bezier paths on mount and on resize, and renders SVG paths colored by edge kind. Edge `mouseenter` shows a small tooltip with `edge.tooltip`.

- [ ] **Step 1: Write `EdgeLayer.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DemoEdge, EdgeKind } from '../fixtures/types';

interface Props {
  edges: DemoEdge[];
  // Map of node id -> DOM element. Live ref the parent updates as nodes mount.
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  // The canvas element used as the bounding-rect origin for path coordinates.
  canvasRef: React.RefObject<HTMLDivElement>;
  resizeKey: number; // bump to force a re-measure
}

interface Path { d: string; kind: EdgeKind; tooltip: string; id: string; }
interface TipState { x: number; y: number; text: string; visible: boolean; }

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

export function EdgeLayer({ edges, nodeRefs, canvasRef, resizeKey }: Props) {
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

    measure();
    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, resizeKey]);

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
              onMouseLeave={() => { setHoveredId(null); onLeave(); }}
              onMouseMove={e => onMove(e, p.tooltip)}
            />
          );
        })}
      </svg>
      <div
        role="tooltip"
        style={{
          position: 'fixed', left: tip.x, top: tip.y,
          background: '#1a2236', border: '1px solid #2a3450', color: '#c8d1e0',
          fontSize: 11, padding: '5px 9px', borderRadius: 4, pointerEvents: 'none',
          opacity: tip.visible ? 1 : 0, transition: 'opacity 0.1s', zIndex: 20,
          whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        {tipParts[0] && (
          <div><span style={{ color: '#7aa2ea', fontWeight: 600 }}>{tipParts[0]}</span></div>
        )}
        {tipParts.length > 1 && (
          <div style={{ color: '#5a6478', fontSize: 10 }}>{tipParts.slice(1).join(' · ')}</div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/canvas/EdgeLayer.tsx
git commit -m "examples: runway: Add EdgeLayer with bezier paths + hover tips

Measures node DOM positions, draws SVG bezier paths styled per edge
kind, and shows a tooltip on hover. Re-measures on window resize.
'calls-runtime' renders identically to 'routes' (gradient solid) —
flagged as forward-looking in the spec-feedback note."
```

---

## Task 10 — Canvas composition

**Files:**
- Create: `plugins/examples/runway/src/canvas/Canvas.tsx`

The Canvas owns the node-ref map and the canvas DOM ref, and composes Lane, Node, EdgeLayer, Legend, Toolbar.

- [ ] **Step 1: Write `Canvas.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Lane } from './Lane';
import { Node } from './Node';
import { EdgeLayer } from './EdgeLayer';
import { Legend } from './Legend';
import { Toolbar } from './Toolbar';
import { nodes } from '../fixtures/nodes';
import { edges } from '../fixtures/edges';
import { demo } from '../styles/theme';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Canvas({ selectedId, onSelect }: Props) {
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);
  const [resizeKey, setResizeKey] = useState(0);

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  // Bump resize key after first layout so EdgeLayer measures the freshly
  // mounted nodes.
  useLayoutEffect(() => {
    setResizeKey(k => k + 1);
  }, []);

  return (
    <div
      style={{
        flex: 1, padding: 24, overflow: 'hidden', position: 'relative',
        background: demo.canvasBg, minHeight: 540,
      }}
    >
      <Toolbar />
      <div ref={canvasRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Lane label="Ingress" left={16} width={200} />
        <Lane label="Agent" left={232} width={240} />
        <Lane label="Models · live" left={488} width={340} />
        <Lane label="Memory · Secrets" left={844} right={16} />

        <EdgeLayer
          edges={edges}
          nodeRefs={nodeRefs}
          canvasRef={canvasRef}
          resizeKey={resizeKey}
        />

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
```

- [ ] **Step 2: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/canvas/Canvas.tsx
git commit -m "examples: runway: Compose Canvas from lanes, nodes, edges, legend"
```

---

## Task 11 — Drawer detail data + MetricCard / GpuBlock / Histogram

**Files:**
- Create: `plugins/examples/runway/src/fixtures/drawerDetails.ts`
- Create: `plugins/examples/runway/src/drawer/MetricCard.tsx`
- Create: `plugins/examples/runway/src/drawer/GpuBlock.tsx`
- Create: `plugins/examples/runway/src/drawer/Histogram.tsx`

Drawer details for every node id. **Read the mockup's `DETAILS` JavaScript object** (in `topology-demo-v2.html` around line 700+) — the metric values, GPU SKU strings, routing breakdown, and section structure all port directly from there.

- [ ] **Step 1: Write `MetricCard.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';
import { Sparkline } from '../canvas/Sparkline';

interface Props {
  label: string;
  value: string;
  unit?: string;
  delta?: string;     // leading '!' = warn; leading '-'/'−' = down; else up
  color?: string;
  wide?: boolean;
}

export function MetricCard({ label, value, unit, delta, color = '#7aa2ea', wide }: Props) {
  const deltaWarn = delta?.startsWith('!');
  const deltaDown = delta?.startsWith('−') || delta?.startsWith('-');
  const deltaText = delta?.replace(/^!/, '');
  const deltaColor = deltaWarn ? '#fbbf24' : deltaDown ? '#ef4444' : '#4ade80';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid #1a2236',
        borderRadius: 5, padding: 10,
        gridColumn: wide ? 'span 2' : undefined,
      }}
    >
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px',
                    color: '#5a6478', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, color: '#fff', fontWeight: 600, marginTop: 4,
                    fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span style={{ color: '#5a6478', fontSize: 11, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
        {delta && <span style={{ fontSize: 10, color: deltaColor, marginLeft: 4 }}>{deltaText}</span>}
      </div>
      <div style={{ marginTop: 6 }}>
        <Sparkline points={[8,7,6,7,5,6,4,5,3,4,2]} color={color} height={24} strokeWidth={1.5} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `GpuBlock.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';

interface BarProps { label: string; value: number; unit?: string; max?: number; }
function Bar({ label, value, unit = '%', max = 100 }: BarProps) {
  const pct = unit === '%' ? value : Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px',
                  alignItems: 'center', gap: 8, fontSize: 11 }}>
      <div style={{ color: '#8a93a8' }}>{label}</div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.05)', borderRadius: 3,
                    overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3,
                      background: 'linear-gradient(90deg, #4ade80 0%, #fbbf24 70%, #ef4444 100%)' }} />
      </div>
      <div style={{ color: '#e6ebf5', fontWeight: 600, textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums' }}>
        {value}{unit}
      </div>
    </div>
  );
}

export interface GpuBlockProps {
  sku: string;
  util: number;        // %
  smOcc: number;       // %
  memBw: number;       // %
  power: number;       // W
  temp: number;        // °C
  ncclBw?: number;     // GB/s (omit on single-GPU)
}

export function GpuBlock(p: GpuBlockProps) {
  return (
    <div style={{ background: 'rgba(234,162,122,0.05)',
                  border: '1px solid rgba(234,162,122,0.15)',
                  borderRadius: 5, padding: 12 }}>
      <div style={{ fontSize: 11, color: '#f5a06b', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '1px',
                    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        GPU telemetry
        <span style={{ background: 'rgba(234,162,122,0.18)', color: '#f5a06b',
                       padding: '2px 6px', borderRadius: 3, fontSize: 9 }}>{p.sku}</span>
        <span style={{ marginLeft: 'auto', color: '#5a6478', fontWeight: 400,
                       fontSize: 9, letterSpacing: 0 }}>
          source: DCGM exporter
        </span>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        <Bar label="GPU util" value={p.util} />
        <Bar label="SM occupancy" value={p.smOcc} />
        <Bar label="Mem bandwidth" value={p.memBw} />
        <Bar label="Power" value={p.power} unit=" W" max={700} />
        <Bar label="Temp" value={p.temp} unit="°C" max={85} />
        {p.ncclBw !== undefined && (
          <Bar label="NCCL b/w" value={p.ncclBw} unit=" GB/s" max={600} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `Histogram.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';

interface Props {
  values: number[];        // bar heights 0-100
  hotFromIndex?: number;    // bars >= this index render in warning color
  labels?: string[];        // optional axis labels
}

export function Histogram({ values, hotFromIndex, labels }: Props) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4, padding: 10 }}>
      {labels && (
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: 9, color: '#5a6478', textTransform: 'uppercase',
                      letterSpacing: '0.8px', marginBottom: 6 }}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 36 }}>
        {values.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: hotFromIndex != null && i >= hotFromIndex
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
```

- [ ] **Step 4: Write `drawerDetails.ts`** — large fixture; values port from the mockup's `DETAILS` object verbatim.

```ts
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import { GpuBlockProps } from '../drawer/GpuBlock';

export type KVRow = { key: string; value: string; tone?: 'ok' | 'warn' };
export type CardData = {
  label: string; value: string; unit?: string; delta?: string; color?: string; wide?: boolean;
};
export type Section =
  | { kind: 'kv'; title: string; tag?: string; rows: KVRow[] }
  | { kind: 'cards'; title: string; tag?: string; cards: CardData[] }
  | { kind: 'gpu'; title: string; tag?: string; gpu: GpuBlockProps }
  | { kind: 'histogram'; title: string; values: number[]; hotFromIndex?: number; labels?: string[] }
  | { kind: 'banner'; title?: string; body: string; tone: 'warn' | 'info' };
export type Action = { label: string; primary?: boolean };

export interface NodeDetail {
  kind: string;            // header chip ('ModelDeployment · Reasoning')
  kindAccent?: 'gpu' | 'agent' | 'default';
  name: string;
  ns: string;
  sub: string;
  sections: Section[];
  actions: Action[];
}

const llamaGpu: GpuBlockProps = {
  sku: 'Standard_NC48ads_A100_v4', util: 78, smOcc: 71, memBw: 64,
  power: 612, temp: 74, ncclBw: 184,
};
const phiGpu: GpuBlockProps = {
  sku: 'Standard_NC4as_T4_v3', util: 34, smOcc: 30, memBw: 28,
  power: 58, temp: 52,
};
const bgeGpu: GpuBlockProps = {
  sku: 'Standard_NC4as_T4_v3', util: 91, smOcc: 88, memBw: 74,
  power: 68, temp: 71,
};

export const drawerDetails: Record<string, NodeDetail> = {
  gw: {
    kind: 'Gateway', name: 'aks-agw-prod', ns: 'support',
    sub: 'gateway.networking.k8s.io/v1 · class: AGIC',
    sections: [{
      kind: 'kv', title: 'Details', rows: [
        { key: 'Class', value: 'azure-application-gateway' },
        { key: 'Listeners', value: 'HTTPS :443' },
        { key: 'Address', value: '52.224.84.21' },
        { key: 'Status', value: 'Programmed', tone: 'ok' },
      ],
    }],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Open Portal' }],
  },
  hr: {
    kind: 'HTTPRoute', name: 'support-agent', ns: 'support',
    sub: 'gateway.networking.k8s.io/v1',
    sections: [{
      kind: 'kv', title: 'Details', rows: [
        { key: 'Hostname', value: 'support-agent.acme.com' },
        { key: 'Parent', value: 'aks-agw-prod' },
        { key: 'Backend', value: 'agent-app:80' },
        { key: 'Status', value: 'Accepted', tone: 'ok' },
      ],
    }],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Edit YAML' }],
  },
  agent: {
    kind: 'Deployment · Agent (forward-looking)', kindAccent: 'agent',
    name: 'agent-app', ns: 'support',
    sub: 'apps/v1 · langgraph runtime · 2/2 ready · WorkloadIdentity SA',
    sections: [
      {
        kind: 'cards', title: 'Agent runtime · live', tag: 'langgraph',
        cards: [
          { label: 'Requests/s', value: '12.4', delta: '+8%', color: '#a78bfa' },
          { label: 'p95 latency', value: '1.84', unit: 's', delta: '−3%', color: '#a78bfa' },
          { label: 'Tool calls/s', value: '38.2', delta: '+12%', color: '#a78bfa' },
          { label: 'Active sessions', value: '62', delta: '+5', color: '#a78bfa' },
          { label: 'Avg turns / convo', value: '4.1', delta: '+0.2', color: '#a78bfa' },
          { label: 'Tool error rate', value: '0.6', unit: '%', delta: '!+0.1', color: '#fbbf24' },
        ],
      },
      {
        kind: 'kv', title: 'Routing decisions · last 15m', rows: [
          { key: '→ phi-3-mini (fast path)', value: '2,840 (71%)' },
          { key: '→ llama-3-70b (complex)', value: '980 (24%)' },
          { key: '→ AOAI fallback', value: '208 (5%)', tone: 'warn' },
          { key: 'Routing model latency (p95)', value: '62 ms' },
        ],
      },
      {
        kind: 'kv', title: 'RAG retrieval', rows: [
          { key: 'Vector queries/s', value: '9.8' },
          { key: 'Avg chunks retrieved', value: '6.4' },
          { key: 'Reranker hits', value: '3.2 / query' },
          { key: 'Cache hit (semantic)', value: '47%', tone: 'ok' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'View traces' }],
  },
  'md-llama': {
    kind: 'ModelDeployment · Reasoning', kindAccent: 'gpu',
    name: 'llama-3-70b-instruct', ns: 'support',
    sub: 'airunway.ai/v1alpha1 · vLLM · KAITO preset · FP8',
    sections: [
      {
        kind: 'cards', title: 'Inference latency · 15m', tag: 'vLLM',
        cards: [
          { label: 'TTFT (p50)', value: '220', unit: 'ms', delta: '−4%', color: '#f5a06b' },
          { label: 'TTFT (p95)', value: '340', unit: 'ms', delta: '−5%', color: '#f5a06b' },
          { label: 'TTFT (p99)', value: '480', unit: 'ms', delta: '!+2%', color: '#fbbf24' },
          { label: 'TPOT', value: '38', unit: 'ms', delta: '0', color: '#f5a06b' },
          { label: 'Inter-token jitter', value: '4.2', unit: 'ms', delta: '0', color: '#f5a06b' },
          { label: 'E2E (p95)', value: '3.4', unit: 's', delta: '−3%', color: '#f5a06b' },
        ],
      },
      {
        kind: 'cards', title: 'Throughput & batching',
        cards: [
          { label: 'Decode tok/s', value: '2,140', delta: '+4%', color: '#f5a06b' },
          { label: 'Prefill tok/s', value: '18,400', delta: '+2%', color: '#f5a06b' },
          { label: 'Running batch', value: '24/64', delta: '+3', color: '#f5a06b' },
          { label: 'Pending requests', value: '3', delta: '0', color: '#4ade80' },
          { label: 'Spec-decode accept', value: '78', unit: '%', delta: '+2%', color: '#4ade80' },
          { label: 'Preemptions/min', value: '0.4', delta: '−0.2', color: '#4ade80' },
        ],
      },
      {
        kind: 'cards', title: 'KV-cache & prefix cache',
        cards: [
          { label: 'KV-cache util', value: '62', unit: '%', delta: '+2%', color: '#fbbf24' },
          { label: 'Prefix cache hit', value: '51', unit: '%', delta: '+4%', color: '#4ade80' },
          { label: 'Cache evictions/min', value: '2.1', delta: '0', color: '#4ade80' },
          { label: 'Context length (p95)', value: '3,840', unit: 'tok', delta: '+12%', color: '#fbbf24' },
        ],
      },
      { kind: 'gpu', title: 'GPU telemetry', tag: 'A100 80GB × 2', gpu: llamaGpu },
      {
        kind: 'histogram', title: 'TTFT distribution · 15m',
        values: [8, 22, 38, 64, 88, 72, 52, 38, 24, 14, 8, 5],
        hotFromIndex: 10,
        labels: ['0 ms', '200', '400', '600', '800+'],
      },
      {
        kind: 'kv', title: 'Cost · last 24h', rows: [
          { key: 'Tokens served', value: '184.2 M' },
          { key: 'GPU-hours', value: '48.0' },
          { key: '$/1M tokens (compute)', value: '$1.94' },
          { key: 'vs AOAI equivalent', value: '−68%', tone: 'ok' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Run IG: profile_cuda' }],
  },
  'md-phi': {
    kind: 'ModelDeployment · Router', kindAccent: 'gpu',
    name: 'phi-3-mini-router', ns: 'support',
    sub: 'airunway.ai/v1alpha1 · vLLM · speculative decoding',
    sections: [
      {
        kind: 'cards', title: 'Inference latency · 15m', tag: 'vLLM',
        cards: [
          { label: 'TTFT (p50)', value: '42', unit: 'ms', delta: '−1%', color: '#4ade80' },
          { label: 'TTFT (p95)', value: '62', unit: 'ms', delta: '−1%', color: '#4ade80' },
          { label: 'TPOT', value: '14', unit: 'ms', delta: '0', color: '#4ade80' },
          { label: 'E2E (p95)', value: '420', unit: 'ms', delta: '0', color: '#4ade80' },
        ],
      },
      {
        kind: 'cards', title: 'Throughput',
        cards: [
          { label: 'Decode tok/s', value: '780', delta: '+6%', color: '#4ade80' },
          { label: 'Running batch', value: '8/32', delta: '0', color: '#4ade80' },
          { label: 'Queue depth', value: '0', delta: '0', color: '#4ade80' },
          { label: 'Spec-decode accept', value: '82', unit: '%', delta: '+1%', color: '#4ade80' },
        ],
      },
      {
        kind: 'cards', title: 'KV-cache',
        cards: [
          { label: 'KV-cache util', value: '18', unit: '%', delta: '0', color: '#4ade80' },
          { label: 'Prefix cache hit', value: '64', unit: '%', delta: '+3%', color: '#4ade80' },
        ],
      },
      { kind: 'gpu', title: 'GPU telemetry', tag: 'T4 × 1', gpu: phiGpu },
      {
        kind: 'kv', title: 'Cost · last 24h', rows: [
          { key: 'Tokens served', value: '68.4 M' },
          { key: 'GPU-hours', value: '24.0' },
          { key: '$/1M tokens', value: '$0.18', tone: 'ok' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Run IG: trace_dns' }],
  },
  'md-bge': {
    kind: 'ModelDeployment · Embeddings', kindAccent: 'gpu',
    name: 'bge-embeddings', ns: 'support',
    sub: 'airunway.ai/v1alpha1 · HuggingFace TEI · BAAI/bge-large-en-v1.5',
    sections: [
      {
        kind: 'banner', tone: 'warn',
        body: 'GPU util 91% · queue depth 4 (growing) · p95 latency +22% over 15m. ' +
              'Saturation signal — observational, no automatic action taken.',
      },
      {
        kind: 'cards', title: 'Embedding latency · 15m', tag: 'TEI',
        cards: [
          { label: 'p50', value: '85', unit: 'ms', delta: '+8%', color: '#fbbf24' },
          { label: 'p95', value: '180', unit: 'ms', delta: '!+22%', color: '#fbbf24' },
          { label: 'p99', value: '420', unit: 'ms', delta: '!+34%', color: '#ef4444' },
          { label: 'Embeds/s', value: '420', delta: '−4%', color: '#fbbf24' },
        ],
      },
      {
        kind: 'cards', title: 'Saturation',
        cards: [
          { label: 'Queue depth', value: '4', delta: '!+3', color: '#fbbf24' },
          { label: 'Pending batches', value: '2', delta: '+1', color: '#fbbf24' },
          { label: 'Reject rate', value: '0.4', unit: '%', delta: '+0.4', color: '#fbbf24' },
          { label: 'Time in queue (p95)', value: '38', unit: 'ms', delta: '!+24', color: '#fbbf24' },
        ],
      },
      { kind: 'gpu', title: 'GPU telemetry', tag: 'T4 × 1 · saturated', gpu: bgeGpu },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Run IG: trace_oomkill' }],
  },
  vec: {
    kind: 'Service · StatefulSet', name: 'vector-db', ns: 'support',
    sub: 'qdrant · 3-pod StatefulSet · ClusterIP :6333',
    sections: [{
      kind: 'kv', title: 'Vector index', rows: [
        { key: 'Vectors', value: '1,243,520' },
        { key: 'Dimensions', value: '1024 (bge-large)' },
        { key: 'Disk on PVC', value: '38.2 / 50 Gi' },
        { key: 'Search QPS', value: '9.8' },
        { key: 'Search p95', value: '12 ms', tone: 'ok' },
        { key: 'Recall@10', value: '0.94', tone: 'ok' },
      ],
    }],
    actions: [{ label: 'Open in Headlamp', primary: true }],
  },
  pvc: {
    kind: 'PersistentVolumeClaim', name: 'rag-index', ns: 'support',
    sub: 'v1 · 50Gi · managed-csi-premium · intended-use: rag-index',
    sections: [{
      kind: 'kv', title: 'Storage', rows: [
        { key: 'Status', value: 'Bound', tone: 'ok' },
        { key: 'Capacity', value: '50Gi' },
        { key: 'Used', value: '38.2 Gi (76%)' },
        { key: 'StorageClass', value: 'managed-csi-premium' },
        { key: 'IOPS (P30)', value: '5,000' },
        { key: 'Read throughput (avg)', value: '42 MB/s' },
      ],
    }],
    actions: [{ label: 'Open in Headlamp', primary: true }],
  },
  aoai: {
    kind: 'Secret · AOAI credential helper', name: 'aoai-creds', ns: 'support',
    sub: 'v1/Secret · airunway.ai/managed-by: wizard',
    sections: [
      {
        kind: 'kv', title: 'Credentials', rows: [
          { key: 'Keys', value: 'api-key, endpoint, deployment-name' },
          { key: 'Endpoint', value: 'aoai-prod-eastus2.openai.azure.com' },
          { key: 'Deployment', value: 'gpt-4o' },
          { key: 'Used by', value: 'agent-app (envFrom)' },
        ],
      },
      {
        kind: 'cards', title: 'Fallback traffic · last 15m',
        cards: [
          { label: 'AOAI requests', value: '208', delta: '+18%', color: '#fbbf24' },
          { label: 'AOAI tokens', value: '384', unit: 'k', delta: '+22%', color: '#fbbf24' },
          { label: 'AOAI cost', value: '$2.30', delta: '+22%', color: '#fbbf24' },
          { label: 'AOAI p95', value: '740', unit: 'ms', delta: '0', color: '#a78bfa' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Open Azure Portal' }],
  },
  hf: {
    kind: 'Secret · Pull secret', name: 'hf-token', ns: 'support',
    sub: 'kubernetes.io/dockerconfigjson',
    sections: [{
      kind: 'kv', title: 'Pull secret', rows: [
        { key: 'Registry', value: 'registry.huggingface.co' },
        { key: 'Used by', value: 'llama-3-70b-0, phi-3-mini-router-0' },
      ],
    }],
    actions: [{ label: 'Open in Headlamp', primary: true }],
  },
};
```

> **SKU verification reminder:** Before this lands, verify `Standard_NC48ads_A100_v4` and `Standard_NC4as_T4_v3` are current AKS GPU SKU names (per spec §3 verification step). Fix in-place if wrong; values are concentrated in `llamaGpu` / `phiGpu` / `bgeGpu` at the top of this file.

- [ ] **Step 5: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/drawer/ plugins/examples/runway/src/fixtures/drawerDetails.ts
git commit -m "examples: runway: Add drawer detail fixtures and leaf renderers

Per-node drawer content covering KV details, metric card grids, GPU
telemetry blocks (labeled with source: DCGM exporter), TTFT
distribution histogram, and a warn-tone banner for the bge-embeddings
saturation case. Saturation banner is deliberately observational only
— no recommendation, no implied action — to stay inside the
no-alerting non-goal of projects-and-aks-overlay.md."
```

---

## Task 12 — DetailDrawer component

**Files:**
- Create: `plugins/examples/runway/src/drawer/DetailDrawer.tsx`

A side drawer that renders the fixture sections. Uses MUI Drawer for the shell + buttons; everything inside is the same dark styling as the canvas so it looks like one piece.

- [ ] **Step 1: Write `DetailDrawer.tsx`**

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React from 'react';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import { drawerDetails, NodeDetail, Section } from '../fixtures/drawerDetails';
import { MetricCard } from './MetricCard';
import { GpuBlock } from './GpuBlock';
import { Histogram } from './Histogram';

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
        <div style={{
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 5, padding: 10, fontSize: 12, color: '#fbbf24',
        }}>
          {s.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.title}</div>}
          {s.body}
        </div>
      );
    case 'kv':
      return (
        <>
          {s.rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 12,
              padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ color: '#8a93a8' }}>{r.key}</span>
              <span style={{
                color: r.tone === 'ok' ? '#4ade80' : r.tone === 'warn' ? '#fbbf24' : '#e6ebf5',
                fontVariantNumeric: 'tabular-nums',
              }}>{r.value}</span>
            </div>
          ))}
        </>
      );
    case 'cards':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {s.cards.map((c, i) => <MetricCard key={i} {...c} />)}
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
          width: 440, background: '#0d1320', color: '#c8d1e0',
          borderLeft: '1px solid #1a2236', display: 'flex', flexDirection: 'column',
        },
      }}
    >
      {detail && (
        <>
          <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #1a2236',
                        position: 'relative' }}>
            <IconButton
              aria-label="Close"
              size="small"
              onClick={onClose}
              sx={{ position: 'absolute', top: 8, right: 8, color: '#5a6478' }}
            >
              ✕
            </IconButton>
            <div style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px',
              color: accentColor, fontWeight: 700,
            }}>
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
                  <h3 style={{
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px',
                    color: '#5a6478', fontWeight: 700, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {s.title}
                    {'tag' in s && s.tag && (
                      <span style={{
                        background: 'rgba(74,127,193,0.15)', color: '#9ab6e0',
                        padding: '1px 6px', borderRadius: 3, fontSize: 9,
                        letterSpacing: '0.5px', textTransform: 'none',
                      }}>{s.tag}</span>
                    )}
                  </h3>
                )}
                <SectionView s={s} />
              </div>
            ))}
          </div>

          <div style={{ padding: '14px 22px', borderTop: '1px solid #1a2236',
                        display: 'flex', gap: 8 }}>
            {detail.actions.map((a, i) => (
              <Button
                key={i}
                variant={a.primary ? 'contained' : 'outlined'}
                size="small"
                sx={{
                  flex: 1, fontSize: 12, textTransform: 'none',
                  borderColor: '#2a3450', color: a.primary ? '#fff' : '#c8d1e0',
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
```

- [ ] **Step 2: tsc + commit**

```bash
cd plugins/examples/runway && npm run tsc
git add plugins/examples/runway/src/drawer/DetailDrawer.tsx
git commit -m "examples: runway: Add DetailDrawer renderer"
```

---

## Task 13 — TopologyDemoPage + wire into the route

**Files:**
- Create: `plugins/examples/runway/src/TopologyDemoPage.tsx`
- Modify: `plugins/examples/runway/src/index.tsx`

- [ ] **Step 1: Write `TopologyDemoPage.tsx`** — owns selected-node state, renders the project header strip, the Canvas, and the DetailDrawer. Auto-opens `md-llama` on first mount (the richest drawer view).

```tsx
/*
 * Copyright 2026 The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import React, { useEffect, useState } from 'react';
import { projectHeader } from './fixtures/projectHeader';
import { Canvas } from './canvas/Canvas';
import { DetailDrawer } from './drawer/DetailDrawer';

const headerStripBigStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
};

export function TopologyDemoPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // Land on the richest drawer view immediately.
    setSelectedId('md-llama');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '80vh',
                  background: '#0a0f1c', color: '#c8d1e0',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, sans-serif' }}>
      {/* Top breadcrumb bar */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #1a2236',
                    display: 'flex', alignItems: 'center', gap: 16, background: '#0d1320' }}>
        <div style={{ color: '#5a6478', fontSize: 12 }}>
          Projects <span style={{ margin: '0 6px' }}>/</span>
          <span style={{ color: '#c8d1e0', fontWeight: 600 }}>{projectHeader.name}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center',
                      fontSize: 12, color: '#8a93a8' }}>
          <span style={{ padding: '4px 10px', background: '#1a2236', borderRadius: 12,
                         display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, background: '#4a7fc1', borderRadius: '50%' }} />
            {projectHeader.cluster}
          </span>
          <span>·</span><span>namespace: {projectHeader.namespace}</span>
        </div>
      </div>

      {/* Project header */}
      <div style={{ padding: '18px 24px', borderBottom: '1px solid #1a2236', background: '#0d1320' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
          <h1 style={{ fontSize: 20, color: '#fff', fontWeight: 600, margin: 0 }}>
            {projectHeader.displayName}
          </h1>
          <span style={{ color: '#5a6478', fontSize: 13 }}>{projectHeader.name}</span>
          <span style={{
            padding: '3px 10px', background: 'rgba(74,222,128,0.12)', color: '#4ade80',
            border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10,
            fontSize: 11, fontWeight: 600,
          }}>● {projectHeader.status}</span>
        </div>
        <div style={{ fontSize: 12, color: '#5a6478', marginBottom: 14 }}>
          {projectHeader.description}
        </div>
        <div style={{ display: 'flex', gap: 22, fontSize: 12, color: '#8a93a8',
                      alignItems: 'center', flexWrap: 'wrap' }}>
          {projectHeader.bigStats.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ width: 1, height: 24, background: '#1a2236' }} />}
              <div style={headerStripBigStyle}>
                <div>
                  <strong style={{ color: '#fff', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    {s.value}
                  </strong>
                  {s.unit && (
                    <span style={{ color: '#5a6478', fontSize: 11, marginLeft: 4 }}>{s.unit}</span>
                  )}
                </div>
                <div style={{ color: '#5a6478', fontSize: 10, textTransform: 'uppercase',
                              letterSpacing: '0.8px' }}>{s.label}</div>
              </div>
            </React.Fragment>
          ))}
          {projectHeader.miniStats.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#5a6478' }}>{s.icon}</span>{s.text}
            </span>
          ))}
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', marginTop: 16, marginBottom: -19 }}>
          {['Topology', 'Resources', 'Observability'].map(t => (
            <div key={t} style={{
              padding: '8px 16px', fontSize: 13, cursor: 'pointer',
              color: t === 'Topology' ? '#fff' : '#8a93a8',
              borderBottom: `2px solid ${t === 'Topology' ? '#7aa2ea' : 'transparent'}`,
            }}>{t}</div>
          ))}
        </div>
      </div>

      <Canvas selectedId={selectedId} onSelect={setSelectedId} />
      <DetailDrawer openId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Update `index.tsx` to mount the page**

Replace the placeholder body of the route component:

```tsx
import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import { TopologyDemoPage } from './TopologyDemoPage';

registerSidebarEntry({
  parent: null,
  name: 'runway',
  label: 'AI Runway',
  url: '/runway/topology-demo',
  icon: 'mdi:graph-outline',
  useClusterURL: false,
});
registerSidebarEntry({
  parent: 'runway',
  name: 'runway-topology-demo',
  label: 'Topology demo',
  url: '/runway/topology-demo',
  useClusterURL: false,
});

registerRoute({
  path: '/runway/topology-demo',
  sidebar: 'runway-topology-demo',
  name: 'runway-topology-demo',
  exact: true,
  useClusterURL: false,
  noAuthRequired: true,
  component: TopologyDemoPage,
});
```

> Drop the `<SectionBox>` + Typography placeholder import from Task 1 — we no longer need them.

- [ ] **Step 3: Run tsc + lint**

```bash
cd plugins/examples/runway && npm run tsc && npm run lint
```

Expected: both pass.

- [ ] **Step 4: Manual smoke**

Run `npm start` in the plugin dir and `npm run app:run-dev` (or equivalent) at the repo root. Navigate to **AI Runway → Topology demo** in the sidebar. Verify:

- Project header strip shows the five big stats (project throughput, avg TTFT, sessions, cache hit, cost).
- Topology canvas renders with four lanes and 9 nodes positioned correctly.
- Edges connect the nodes with the four distinct styles (gradient solid for routes/selects/calls-runtime, dashed for owns/mounts/refs).
- Hover an edge — tooltip appears near the cursor.
- Click any node — drawer slides in from the right with the right content.
- Drawer auto-opened on `llama-3-70b-instruct` on first paint.
- `bge-embeddings` node shows the warn dot, yellow `slow` chip, and the drawer banner is observational (no "consider X" verbs).
- Resize the window — edges re-measure and connect correctly to the moved nodes.

Fix any layout glitches in-place. The most likely first-pass issue: the canvas needs an explicit min-height; if nodes overflow, bump `minHeight` in `Canvas.tsx`.

- [ ] **Step 5: Commit**

```bash
git add plugins/examples/runway/src/
git commit -m "examples: runway: Wire TopologyDemoPage into the route

Top-level page composes the project header, the topology canvas, and
the right-side detail drawer. Drawer auto-opens on llama-3-70b on
first paint so the demo lands on the richest view. No cluster
connection required (useClusterURL: false, noAuthRequired: true)."
```

---

## Task 14 — README: install / sources table / glossary / forward-looking caveats

**Files:**
- Modify: `plugins/examples/runway/README.md`

Rewrite the placeholder with the real document. Sections per the spec §9 (metric source table) and §10 (glossary).

- [ ] **Step 1: Replace `README.md` with the full version**

```markdown
# runway-topology-demo

Headlamp example plugin: a demo / conversation piece for the Topology
tab described in `projects-and-aks-overlay.md` §6a. Renders a fictional
Customer Support Agent project — gateway, agent app, three model
deployments, vector DB, RAG PVC, AOAI credential helper, HF pull
secret — as a left-to-right topology graph with rich AI-flavored
metrics on each model node and a deep side drawer per node.

**This is a conversation piece, not a reference implementation.** It
hardcodes all data, requires no cluster connection, and includes
several forward-looking concepts that the source spec does not yet
define (see "Forward-looking" below).

Design: `docs/superpowers/specs/2026-06-02-topology-demo-design.md`
ADR:    `docs/adr/0001-topology-demo-as-headlamp-plugin.md`
Spec feedback: `docs/superpowers/specs/projects-and-aks-overlay-feedback.md`

## Install and run

In one terminal:

```bash
cd plugins/examples/runway
npm install
npm start
```

In another terminal, launch Headlamp in dev mode (no cluster needed —
the demo route registers with `useClusterURL: false`). The plugin
appears in the sidebar under **AI Runway → Topology demo**.

For a production build:

```bash
npm run build
# install the built bundle into ~/.config/Headlamp/plugins/ (path varies by OS)
```

## What you see

- Project header strip with AI-flavored aggregates (project
  throughput in tok/s, avg TTFT, active sessions, semantic cache hit,
  cost/1M tokens over 24h).
- Topology canvas with four lanes: Ingress · Agent · Models · Memory.
- Per-model nodes carry TTFT / TPOT / tokens/s sparklines, plus
  inline GPU utilization and KV-cache bars on the node face.
- Hover any edge for an explanation of the relationship.
- Click any node for a side drawer with latency, throughput,
  KV-cache, GPU telemetry (DCGM-shaped), TTFT distribution
  histogram, and cost sections.

The `bge-embeddings` model is intentionally saturated (GPU 91%,
queue growing). The drawer banner is **observational only** — no
recommendation, no implied action. The spec's `Ready/Degraded/Empty`
chip is deliberately not an alert; this demo respects that.

## Where each metric would come from

Every metric in this demo is illustrative. In a real wire-up, the
data would come from one of:

| Metric | Source |
|---|---|
| TTFT, TPOT, e2e latency, tokens/s, requests/s, queue depth, KV-cache util, error rate | **Inference engine** (vLLM / TEI Prometheus endpoint, served through the AI Runway backend or Prometheus directly) |
| Prefix cache hit, running batch size, spec-decode acceptance, preemptions/min, context length | **Inference engine** (extended Prometheus exposition) |
| GPU util, SM occupancy, mem bandwidth, power, temp | **DCGM exporter** |
| NCCL bandwidth, NCCL retransmits | **Inspektor Gadget** (`trace_tcpretrans`, `profile_tcprtt`) |
| OOM kills, CUDA allocations | **Inspektor Gadget** (`trace_oomkill`, `profile_cuda`) |
| Cost / GPU-hours / $/1M tokens | **Not yet exposed** — would need a billing exporter |
| Routing decisions breakdown, tool calls/s, turns/conversation, semantic cache hit | **Not yet exposed** — requires the agent app to expose these (see Forward-looking note 1) |
| Vector count, search QPS / p95, recall@10 | **Vector DB** (qdrant `/metrics`) |

## Forward-looking concepts

Three things in this demo go beyond what the v1.0 source spec
defines. Both findings #1 and #2 are captured as spec feedback in
`docs/superpowers/specs/projects-and-aks-overlay-feedback.md` for
follow-up against the source spec.

1. **Agents as a first-class concept.** The "Agent" lane and the
   agent-shaped face/drawer metrics (tool calls, turns, routing
   decisions) assume the AI Runway plugin would detect agent
   runtimes (langgraph / LlamaIndex / AutoGen) the way `projects-and-aks-overlay.md`
   §7 detects inference engines. Today it does not.
2. **`calls-runtime` edge kind.** The agent → model edges have no
   equivalent in the source spec's §6a edge table, which only
   covers K8s-state-derivable relationships. The demo draws them
   anyway (visually identical to `routes-to`) because without them
   an agent-shaped Project's topology is disconnected islands.
3. **Aspirational metric sources.** Several metrics in the table
   above are labeled "not yet exposed." The demo shows them because
   they're what makes an agent-shaped Project legible; the
   implementation conversation is which to prioritize wiring up.

## Glossary

Terms used here that got loose during brainstorming and are pinned
so the implementation conversation doesn't drift:

- **Agent** — an app Deployment running an LLM-orchestration
  runtime (langgraph, LlamaIndex, AutoGen, etc.) that makes
  runtime decisions about which downstream model to call.
  Forward-looking; not detected by v1.0.
- **Routing decision** — the agent's runtime choice of which
  downstream model to call. Distinct from HTTPRoute (network-layer)
  routing.
- **Fallback** — the agent's runtime decision to call an alternative
  model (e.g., AOAI) when the primary path fails. The plugin only
  provides credentials per `projects-and-aks-overlay.md` §9.6; it
  does not implement fallback orchestration.
- **Project throughput** — sum across member ModelDeployments of
  their reported tokens/s.
- **Cache hit (in the project header)** — semantic cache hit at the
  agent layer. Distinct from per-model KV-cache and prefix cache,
  which live in model drawers under their own labels.
- **`calls-runtime` edge** — forward-looking edge kind for "this Pod
  makes runtime HTTP calls to that Service." Not in the source-spec
  edge table.

## Long-term location

This plugin lives in the Headlamp repo today for convenience. It is
expected to move to the kaito-project/airunway plugin repo when one
exists.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/examples/runway/README.md
git commit -m "examples: runway: README with install, source table, glossary

Covers install/run, the metric source table (Prometheus /
Inspektor Gadget / DCGM / inference engine / not-yet-exposed),
the forward-looking caveats (agents-as-first-class,
calls-runtime edges), and the glossary co-located with the demo
per the spec."
```

---

## Task 15 — Verify SKU + KAITO preset values

The spec §3 calls out: verify the SKU strings and KAITO preset family names that an AKS-shop viewer would catch first.

- [ ] **Step 1: Verify the SKU strings against current Azure documentation**

Open the Azure VM SKU docs and confirm:

- `Standard_NC48ads_A100_v4` — does this SKU exist? Does it actually carry 2× A100 80GB GPUs?
- `Standard_NC4as_T4_v3` — does this SKU exist? Does it carry 1× T4 GPU?

If either is wrong, update the value **only** in `src/fixtures/drawerDetails.ts` (the constants `llamaGpu`, `phiGpu`, `bgeGpu` at the top) — those are the only places SKUs appear textually.

WebFetch one of: https://learn.microsoft.com/en-us/azure/virtual-machines/sizes-gpu or https://learn.microsoft.com/en-us/azure/virtual-machines/nc-a100-v4-series

- [ ] **Step 2: Verify the KAITO preset / model family names**

Open https://github.com/kaito-project/kaito and find the `kaitollmconfig.json` (or equivalent) file. Confirm:

- A preset for the llama-3 family with the name `llama-3-70b-instruct` (or similar) exists. If KAITO uses a different name (e.g., `llama3-70b-instruct`), update `nodes.ts` (the `title` of `md-llama`) and `drawerDetails.ts` (the `name` of `md-llama`).
- A preset for phi-3 family exists with a name close to `phi-3-mini` (likely `phi-3-mini-4k-instruct`). Update if different.

- [ ] **Step 3: Run tsc + lint after any changes**

```bash
cd plugins/examples/runway && npm run tsc && npm run lint
```

- [ ] **Step 4: Commit verification, even if nothing changed**

If no changes were needed:

```bash
git commit --allow-empty -m "examples: runway: Verified SKU and KAITO preset names

Standard_NC48ads_A100_v4 and Standard_NC4as_T4_v3 confirmed against
current Azure docs. llama-3-70b-instruct and phi-3-mini-router
match current KAITO preset family naming. No fixture changes needed."
```

If changes were made:

```bash
git add plugins/examples/runway/src/fixtures/
git commit -m "examples: runway: Correct SKU / KAITO preset names

[describe the specific corrections]"
```

---

## Task 16 — Final end-to-end smoke + PR

- [ ] **Step 1: Full lint + tsc + test pass**

```bash
cd plugins/examples/runway
npm run lint
npm run tsc
npm run test          # the headlamp-plugin scaffold ships with a test runner; ours has no tests, runner should exit cleanly
```

Expected: all three pass.

- [ ] **Step 2: Final manual demo walkthrough** — same checklist as Task 13 Step 4, but now against the polished build.

- [ ] **Step 3: From repo root, commit the branch tip is clean and push**

```bash
git status            # should be clean
git log --oneline origin/main..HEAD    # review the commit series
git push -u origin feature/topology-demo-spec
```

- [ ] **Step 4: Open a PR** (optional — wait for explicit approval from the user before pushing or opening anything)

Title: `examples: runway: Add AI Runway topology demo plugin`

Body summary:

```
Adds an example Headlamp plugin demonstrating the Topology tab from
projects-and-aks-overlay.md §6a. Shows a fictional Customer Support
Agent project with multi-model routing, RAG storage, AKS integration,
and AI-flavored metrics (TTFT, TPOT, KV-cache, GPU telemetry, routing
breakdown). No backend, no real data, no cluster connection required.

Design + ADR + spec-feedback under docs/.

Includes forward-looking content (agents as first-class, calls-runtime
edge kind) clearly documented in the plugin README and captured as
spec feedback for the source projects-and-aks-overlay.md.
```

---

## Self-review notes

(For the implementer — these are my own check passes on the plan above; if you spot any of these still present, fix them.)

- **Spec coverage:** every spec section maps to a task — scaffold (T1), theme (T2), fixtures (T3, T4, T11), canvas pieces (T5–T10), drawer pieces (T11, T12), page wiring (T13), README/glossary/source-table (T14), SKU verification (T15), end-to-end (T16).
- **Placeholder scan:** the only TBDs in the plan are the verification step (T15) and the optional PR step (T16/Step 4); both are explicit and necessary.
- **Type consistency:** all type names match across tasks (`DemoNode`, `DemoEdge`, `EdgeKind`, `FaceMetric`, `InlineBar`, `NodeDetail`, `Section`, `CardData`, `KVRow`, `GpuBlockProps`). `MetricCard` props match `CardData` field names. `drawerDetails.ts` exports `Section` which `DetailDrawer.tsx` consumes.
- **DRY check:** colors live only in `theme.ts` (some inline hex values remain in components for legibility; acceptable for a leaf demo). Sparkline is reused by `Node` face metrics and `MetricCard`. GPU bar logic shared between canvas `GpuBar` and drawer `GpuBlock`'s internal `Bar` — slight duplication, but they serve different contexts (compact node face vs. labeled drawer row) and merging would couple the canvas and drawer modules.
