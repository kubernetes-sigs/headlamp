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

import { describe, expect, it } from 'vitest';
import App from '../../App';
import Node from './node';
import { NODE_POOL_LABEL_KEYS } from './nodeConstants';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeNode(labels?: Record<string, string>) {
  return new Node({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'test-node',
      resourceVersion: '1',
      ...(labels ? { labels } : {}),
    },
    spec: {},
    status: {},
  } as any);
}

describe('Node.getNodePool', () => {
  const poolNames: Record<(typeof NODE_POOL_LABEL_KEYS)[number], string> = {
    'cloud.google.com/gke-nodepool': 'gke-pool',
    'kubernetes.azure.com/agentpool': 'aks-pool',
    'eks.amazonaws.com/nodegroup': 'eks-managed-group',
    'kops.k8s.io/instancegroup': 'kops-group',
    'cluster.x-k8s.io/deployment-name': 'capi-deployment',
    'karpenter.sh/nodepool': 'karpenter-pool',
  };

  it.each(NODE_POOL_LABEL_KEYS)('reads the pool name from %s', key => {
    expect(makeNode({ [key]: poolNames[key] }).getNodePool()).toBe(poolNames[key]);
  });

  it('returns the karpenter pool for an EKS auto mode node', () => {
    const node = makeNode({
      'karpenter.sh/nodepool': 'general-purpose',
      'node.kubernetes.io/instance-type': 'c6g.large',
    });

    expect(node.getNodePool()).toBe('general-purpose');
  });

  it('returns an empty string when no pool label is present', () => {
    expect(makeNode({ 'node.kubernetes.io/instance-type': 'm5.large' }).getNodePool()).toBe('');
  });

  it('returns an empty string when the node has no labels', () => {
    expect(makeNode().getNodePool()).toBe('');
  });

  it('prefers the provider label when a node also carries a karpenter label', () => {
    const node = makeNode({
      'eks.amazonaws.com/nodegroup': 'managed-group',
      'karpenter.sh/nodepool': 'karpenter-pool',
    });

    expect(node.getNodePool()).toBe('managed-group');
  });
});
