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

import { DemoEdge } from './types';

// 'calls-runtime' is a forward-looking edge kind — see
// docs/superpowers/specs/projects-and-aks-overlay-feedback.md §2.
// Visually rendered like 'routes'.
export const edges: DemoEdge[] = [
  {
    source: 'hr',
    target: 'gw',
    kind: 'refs',
    tooltip: 'HTTPRoute → Gateway · references · spec.parentRefs',
  },
  {
    source: 'hr',
    target: 'agent',
    kind: 'routes',
    tooltip: 'HTTPRoute → Service · routes-to · backendRefs',
  },
  {
    source: 'agent',
    target: 'md-llama',
    kind: 'calls-runtime',
    tooltip: 'agent calls model · reasoning',
  },
  {
    source: 'agent',
    target: 'md-phi',
    kind: 'calls-runtime',
    tooltip: 'agent calls model · routing / fast-path',
  },
  {
    source: 'agent',
    target: 'md-bge',
    kind: 'calls-runtime',
    tooltip: 'agent calls model · embeddings',
  },
  { source: 'agent', target: 'vec', kind: 'calls-runtime', tooltip: 'agent reads vector DB' },
  { source: 'agent', target: 'aoai', kind: 'refs', tooltip: 'envFrom Secret · AOAI fallback' },
  { source: 'md-bge', target: 'pvc', kind: 'mounts', tooltip: 'Pod → PVC · mounts · spec.volumes' },
  { source: 'md-llama', target: 'hf', kind: 'refs', tooltip: 'imagePullSecret · references' },
  { source: 'md-phi', target: 'hf', kind: 'refs', tooltip: 'imagePullSecret · references' },
];
