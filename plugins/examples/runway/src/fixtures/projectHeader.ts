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
