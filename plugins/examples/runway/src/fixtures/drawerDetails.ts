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

import { GpuBlockProps } from '../drawer/GpuBlock';

export type KVRow = { key: string; value: string; tone?: 'ok' | 'warn' };
export type CardData = {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  color?: string;
  wide?: boolean;
};
export type Section =
  | { kind: 'kv'; title: string; tag?: string; rows: KVRow[] }
  | { kind: 'cards'; title: string; tag?: string; cards: CardData[] }
  | { kind: 'gpu'; title: string; tag?: string; gpu: GpuBlockProps }
  | { kind: 'histogram'; title: string; values: number[]; hotFromIndex?: number; labels?: string[] }
  | { kind: 'banner'; title?: string; body: string; tone: 'warn' | 'info' };
export type Action = { label: string; primary?: boolean };

export interface NodeDetail {
  kind: string; // header chip ('ModelDeployment · Reasoning')
  kindAccent?: 'gpu' | 'agent' | 'default';
  name: string;
  ns: string;
  sub: string;
  sections: Section[];
  actions: Action[];
}

const llamaGpu: GpuBlockProps = {
  sku: 'Standard_NC48ads_A100_v4',
  util: 78,
  smOcc: 71,
  memBw: 64,
  power: 612,
  temp: 74,
  ncclBw: 184,
};
const phiGpu: GpuBlockProps = {
  sku: 'Standard_NC4as_T4_v3',
  util: 34,
  smOcc: 30,
  memBw: 28,
  power: 58,
  temp: 52,
};
const bgeGpu: GpuBlockProps = {
  sku: 'Standard_NC4as_T4_v3',
  util: 91,
  smOcc: 88,
  memBw: 74,
  power: 68,
  temp: 71,
};

export const drawerDetails: Record<string, NodeDetail> = {
  gw: {
    kind: 'Gateway',
    name: 'aks-agw-prod',
    ns: 'support',
    sub: 'gateway.networking.k8s.io/v1 · class: AGIC',
    sections: [
      {
        kind: 'kv',
        title: 'Details',
        rows: [
          { key: 'Class', value: 'azure-application-gateway' },
          { key: 'Listeners', value: 'HTTPS :443' },
          { key: 'Address', value: '52.224.84.21' },
          { key: 'Status', value: 'Programmed', tone: 'ok' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Open Portal' }],
  },
  hr: {
    kind: 'HTTPRoute',
    name: 'support-agent',
    ns: 'support',
    sub: 'gateway.networking.k8s.io/v1',
    sections: [
      {
        kind: 'kv',
        title: 'Details',
        rows: [
          { key: 'Hostname', value: 'support-agent.acme.com' },
          { key: 'Parent', value: 'aks-agw-prod' },
          { key: 'Backend', value: 'agent-app:80' },
          { key: 'Status', value: 'Accepted', tone: 'ok' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Edit YAML' }],
  },
  agent: {
    kind: 'Deployment · Agent (forward-looking)',
    kindAccent: 'agent',
    name: 'agent-app',
    ns: 'support',
    sub: 'apps/v1 · langgraph runtime · 2/2 ready · WorkloadIdentity SA',
    sections: [
      {
        kind: 'cards',
        title: 'Agent runtime · live',
        tag: 'langgraph',
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
        kind: 'kv',
        title: 'Routing decisions · last 15m',
        rows: [
          { key: '→ phi-3-mini (fast path)', value: '2,840 (71%)' },
          { key: '→ llama-3-70b (complex)', value: '980 (24%)' },
          { key: '→ AOAI fallback', value: '208 (5%)', tone: 'warn' },
          { key: 'Routing model latency (p95)', value: '62 ms' },
        ],
      },
      {
        kind: 'kv',
        title: 'RAG retrieval',
        rows: [
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
    kind: 'ModelDeployment · Reasoning',
    kindAccent: 'gpu',
    name: 'llama-3-70b-instruct',
    ns: 'support',
    sub: 'airunway.ai/v1alpha1 · vLLM · KAITO preset · FP8',
    sections: [
      {
        kind: 'cards',
        title: 'Inference latency · 15m',
        tag: 'vLLM',
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
        kind: 'cards',
        title: 'Throughput & batching',
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
        kind: 'cards',
        title: 'KV-cache & prefix cache',
        cards: [
          { label: 'KV-cache util', value: '62', unit: '%', delta: '+2%', color: '#fbbf24' },
          { label: 'Prefix cache hit', value: '51', unit: '%', delta: '+4%', color: '#4ade80' },
          { label: 'Cache evictions/min', value: '2.1', delta: '0', color: '#4ade80' },
          {
            label: 'Context length (p95)',
            value: '3,840',
            unit: 'tok',
            delta: '+12%',
            color: '#fbbf24',
          },
        ],
      },
      { kind: 'gpu', title: 'GPU telemetry', tag: 'A100 80GB × 2', gpu: llamaGpu },
      {
        kind: 'histogram',
        title: 'TTFT distribution · 15m',
        values: [8, 22, 38, 64, 88, 72, 52, 38, 24, 14, 8, 5],
        hotFromIndex: 10,
        labels: ['0 ms', '200', '400', '600', '800+'],
      },
      {
        kind: 'kv',
        title: 'Cost · last 24h',
        rows: [
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
    kind: 'ModelDeployment · Router',
    kindAccent: 'gpu',
    name: 'phi-3-mini-router',
    ns: 'support',
    sub: 'airunway.ai/v1alpha1 · vLLM · speculative decoding',
    sections: [
      {
        kind: 'cards',
        title: 'Inference latency · 15m',
        tag: 'vLLM',
        cards: [
          { label: 'TTFT (p50)', value: '42', unit: 'ms', delta: '−1%', color: '#4ade80' },
          { label: 'TTFT (p95)', value: '62', unit: 'ms', delta: '−1%', color: '#4ade80' },
          { label: 'TPOT', value: '14', unit: 'ms', delta: '0', color: '#4ade80' },
          { label: 'E2E (p95)', value: '420', unit: 'ms', delta: '0', color: '#4ade80' },
        ],
      },
      {
        kind: 'cards',
        title: 'Throughput',
        cards: [
          { label: 'Decode tok/s', value: '780', delta: '+6%', color: '#4ade80' },
          { label: 'Running batch', value: '8/32', delta: '0', color: '#4ade80' },
          { label: 'Queue depth', value: '0', delta: '0', color: '#4ade80' },
          { label: 'Spec-decode accept', value: '82', unit: '%', delta: '+1%', color: '#4ade80' },
        ],
      },
      {
        kind: 'cards',
        title: 'KV-cache',
        cards: [
          { label: 'KV-cache util', value: '18', unit: '%', delta: '0', color: '#4ade80' },
          { label: 'Prefix cache hit', value: '64', unit: '%', delta: '+3%', color: '#4ade80' },
        ],
      },
      { kind: 'gpu', title: 'GPU telemetry', tag: 'T4 × 1', gpu: phiGpu },
      {
        kind: 'kv',
        title: 'Cost · last 24h',
        rows: [
          { key: 'Tokens served', value: '68.4 M' },
          { key: 'GPU-hours', value: '24.0' },
          { key: '$/1M tokens', value: '$0.18', tone: 'ok' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Run IG: trace_dns' }],
  },
  'md-bge': {
    kind: 'ModelDeployment · Embeddings',
    kindAccent: 'gpu',
    name: 'bge-embeddings',
    ns: 'support',
    sub: 'airunway.ai/v1alpha1 · HuggingFace TEI · BAAI/bge-large-en-v1.5',
    sections: [
      {
        kind: 'banner',
        tone: 'warn',
        body:
          'GPU util 91% · queue depth 4 (growing) · p95 latency +22% over 15m. ' +
          'Saturation signal — observational, no automatic action taken.',
      },
      {
        kind: 'cards',
        title: 'Embedding latency · 15m',
        tag: 'TEI',
        cards: [
          { label: 'p50', value: '85', unit: 'ms', delta: '+8%', color: '#fbbf24' },
          { label: 'p95', value: '180', unit: 'ms', delta: '!+22%', color: '#fbbf24' },
          { label: 'p99', value: '420', unit: 'ms', delta: '!+34%', color: '#ef4444' },
          { label: 'Embeds/s', value: '420', delta: '−4%', color: '#fbbf24' },
        ],
      },
      {
        kind: 'cards',
        title: 'Saturation',
        cards: [
          { label: 'Queue depth', value: '4', delta: '!+3', color: '#fbbf24' },
          { label: 'Pending batches', value: '2', delta: '+1', color: '#fbbf24' },
          { label: 'Reject rate', value: '0.4', unit: '%', delta: '+0.4', color: '#fbbf24' },
          {
            label: 'Time in queue (p95)',
            value: '38',
            unit: 'ms',
            delta: '!+24',
            color: '#fbbf24',
          },
        ],
      },
      { kind: 'gpu', title: 'GPU telemetry', tag: 'T4 × 1 · saturated', gpu: bgeGpu },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }, { label: 'Run IG: trace_oomkill' }],
  },
  vec: {
    kind: 'Service · StatefulSet',
    name: 'vector-db',
    ns: 'support',
    sub: 'qdrant · 3-pod StatefulSet · ClusterIP :6333',
    sections: [
      {
        kind: 'kv',
        title: 'Vector index',
        rows: [
          { key: 'Vectors', value: '1,243,520' },
          { key: 'Dimensions', value: '1024 (bge-large)' },
          { key: 'Disk on PVC', value: '38.2 / 50 Gi' },
          { key: 'Search QPS', value: '9.8' },
          { key: 'Search p95', value: '12 ms', tone: 'ok' },
          { key: 'Recall@10', value: '0.94', tone: 'ok' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }],
  },
  pvc: {
    kind: 'PersistentVolumeClaim',
    name: 'rag-index',
    ns: 'support',
    sub: 'v1 · 50Gi · managed-csi-premium · intended-use: rag-index',
    sections: [
      {
        kind: 'kv',
        title: 'Storage',
        rows: [
          { key: 'Status', value: 'Bound', tone: 'ok' },
          { key: 'Capacity', value: '50Gi' },
          { key: 'Used', value: '38.2 Gi (76%)' },
          { key: 'StorageClass', value: 'managed-csi-premium' },
          { key: 'IOPS (P30)', value: '5,000' },
          { key: 'Read throughput (avg)', value: '42 MB/s' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }],
  },
  aoai: {
    kind: 'Secret · AOAI credential helper',
    name: 'aoai-creds',
    ns: 'support',
    sub: 'v1/Secret · airunway.ai/managed-by: wizard',
    sections: [
      {
        kind: 'kv',
        title: 'Credentials',
        rows: [
          { key: 'Keys', value: 'api-key, endpoint, deployment-name' },
          { key: 'Endpoint', value: 'aoai-prod-eastus2.openai.azure.com' },
          { key: 'Deployment', value: 'gpt-4o' },
          { key: 'Used by', value: 'agent-app (envFrom)' },
        ],
      },
      {
        kind: 'cards',
        title: 'Fallback traffic · last 15m',
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
    kind: 'Secret · Pull secret',
    name: 'hf-token',
    ns: 'support',
    sub: 'kubernetes.io/dockerconfigjson',
    sections: [
      {
        kind: 'kv',
        title: 'Pull secret',
        rows: [
          { key: 'Registry', value: 'registry.huggingface.co' },
          { key: 'Used by', value: 'llama-3-70b-0, phi-3-mini-router-0' },
        ],
      },
    ],
    actions: [{ label: 'Open in Headlamp', primary: true }],
  },
};
