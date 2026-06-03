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

import { demo } from '../styles/theme';
import { DemoNode } from './types';

export const nodes: DemoNode[] = [
  // ---------- Ingress lane ----------
  {
    id: 'gw',
    kind: 'entry',
    lane: 'ingress',
    title: 'Gateway',
    icon: '▤',
    subtitle: 'aks-agw-prod · AGIC',
    status: 'ok',
    x: 32,
    y: 80,
  },
  {
    id: 'hr',
    kind: 'entry',
    lane: 'ingress',
    title: 'HTTPRoute',
    icon: '⇢',
    subtitle: 'support-agent.acme.com',
    status: 'ok',
    x: 32,
    y: 170,
  },

  // ---------- Agent lane ----------
  {
    id: 'agent',
    kind: 'agent',
    lane: 'agent',
    title: 'agent-app',
    icon: '⬢',
    status: 'ok',
    x: 252,
    y: 110,
    minWidth: 220,
    chips: [{ label: '2 pods' }, { label: 'langgraph', variant: 'engine' }],
    faceMetrics: [
      {
        label: 'req/s',
        value: '12.4',
        sparkPoints: [8, 7, 9, 6, 5, 7, 4, 6, 3, 4, 2],
        color: demo.agentAccent,
      },
      {
        label: 'tool/s',
        value: '38.2',
        sparkPoints: [7, 6, 8, 5, 7, 4, 6, 3, 5, 2, 3],
        color: demo.agentAccent,
      },
      {
        label: 'turns',
        value: '4.1 avg',
        sparkPoints: [6, 7, 6, 5, 6, 5, 6, 5, 4, 5, 4],
        color: demo.agentAccent,
      },
    ],
  },

  // ---------- Models lane ----------
  {
    id: 'md-llama',
    kind: 'gpu',
    lane: 'models',
    title: 'llama-3-70b-instruct',
    icon: '▣',
    status: 'ok',
    x: 508,
    y: 52,
    minWidth: 230,
    chips: [
      { label: 'A100 80G ×2', variant: 'gpu' },
      { label: 'vLLM 0.6', variant: 'engine' },
      { label: 'FP8' },
    ],
    faceMetrics: [
      {
        label: 'TTFT',
        value: '340 ms',
        sparkPoints: [7, 6, 7, 8, 6, 7, 5, 6, 6, 5, 5],
        delta: '−5%',
        color: demo.gpuAccent,
      },
      {
        label: 'TPOT',
        value: '38 ms',
        sparkPoints: [6, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5],
        delta: '0',
        color: demo.gpuAccent,
      },
      {
        label: 'tok/s',
        value: '2,140',
        sparkPoints: [8, 7, 7, 5, 6, 4, 5, 3, 4, 3, 2],
        delta: '+4%',
        color: demo.gpuAccent,
      },
    ],
    inlineBars: [
      { label: 'GPU', pct: 78, gradient: true },
      { label: 'KV', pct: 62, gradient: true },
    ],
  },
  {
    id: 'md-phi',
    kind: 'gpu',
    lane: 'models',
    title: 'phi-3-mini-router',
    icon: '▣',
    status: 'ok',
    x: 508,
    y: 240,
    minWidth: 230,
    chips: [
      { label: 'T4 ×1', variant: 'gpu' },
      { label: 'vLLM 0.6', variant: 'engine' },
      { label: 'spec-dec' },
    ],
    faceMetrics: [
      {
        label: 'TTFT',
        value: '62 ms',
        sparkPoints: [7, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6],
        delta: '−1%',
        color: demo.status.ok,
      },
      {
        label: 'TPOT',
        value: '14 ms',
        sparkPoints: [6, 5, 5, 6, 5, 5, 4, 5, 4, 5, 4],
        color: demo.status.ok,
      },
      {
        label: 'tok/s',
        value: '780',
        sparkPoints: [7, 6, 5, 6, 5, 4, 5, 4, 3, 4, 3],
        delta: '+6%',
        color: demo.status.ok,
      },
    ],
    inlineBars: [
      { label: 'GPU', pct: 34, gradient: true },
      { label: 'KV', pct: 18, gradient: true },
    ],
  },
  {
    id: 'md-bge',
    kind: 'gpu',
    lane: 'models',
    title: 'bge-embeddings',
    icon: '▣',
    status: 'warn',
    x: 508,
    y: 410,
    minWidth: 230,
    chips: [
      { label: 'T4 ×1', variant: 'gpu' },
      { label: 'TEI 1.2', variant: 'engine' },
      { label: 'slow', variant: 'warn' },
    ],
    faceMetrics: [
      {
        label: 'p95',
        value: '180 ms',
        sparkPoints: [8, 7, 8, 6, 5, 5, 3, 4, 2, 3, 2],
        delta: '!+22%',
        color: demo.status.warn,
      },
      {
        label: 'emb/s',
        value: '420',
        sparkPoints: [5, 5, 6, 5, 6, 6, 7, 6, 7, 7, 8],
        delta: '−4%',
        color: demo.status.warn,
      },
      {
        label: 'queue',
        value: '4',
        sparkPoints: [9, 9, 9, 8, 8, 7, 7, 5, 4, 3, 2],
        delta: '!+3',
        color: demo.status.warn,
      },
    ],
    inlineBars: [
      { label: 'GPU', pct: 91, gradient: true },
      { label: 'GMEM', pct: 74, gradient: true },
    ],
  },

  // ---------- Memory / Secrets lane ----------
  {
    id: 'vec',
    kind: 'storage',
    lane: 'memory',
    title: 'vector-db',
    icon: '◇',
    status: 'ok',
    x: 864,
    y: 80,
    chips: [{ label: '3 pods' }],
    subtitle: 'qdrant · 1.2M vec',
  },
  {
    id: 'pvc',
    kind: 'storage',
    lane: 'memory',
    title: 'rag-index',
    icon: '▭',
    status: 'ok',
    x: 864,
    y: 170,
    subtitle: '50Gi · managed-csi-premium',
  },
  {
    id: 'aoai',
    kind: 'secret',
    lane: 'memory',
    title: 'aoai-creds',
    icon: '🔒',
    status: 'ok',
    x: 864,
    y: 250,
    subtitle: 'Azure OpenAI · credential helper',
  },
  {
    id: 'hf',
    kind: 'secret',
    lane: 'memory',
    title: 'hf-token',
    icon: '🔒',
    x: 864,
    y: 320,
    subtitle: 'huggingface registry',
  },
];
