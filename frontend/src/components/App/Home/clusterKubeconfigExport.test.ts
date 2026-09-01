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

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { KubeconfigObject } from '../../../lib/k8s/kubeconfig';
import { filterKubeconfigForCluster } from './clusterKubeconfigExport';

function makeKubeconfig(): KubeconfigObject {
  return {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [
      { name: 'cluster-a', cluster: { server: 'https://a.example.com' } },
      { name: 'cluster-b', cluster: { server: 'https://b.example.com' } },
    ],
    users: [
      { name: 'user-a', user: { token: 'token-a' } },
      { name: 'user-b', user: { token: 'token-b' } },
    ],
    contexts: [
      { name: 'context-a', context: { cluster: 'cluster-a', user: 'user-a' } },
      {
        name: 'context-b',
        context: {
          cluster: 'cluster-b',
          user: 'user-b',
          extensions: [{ name: 'headlamp_info', extension: { customName: 'renamed-cluster' } }],
        },
      },
    ],
  } as KubeconfigObject;
}

describe('filterKubeconfigForCluster', () => {
  it('filters down to only the matching cluster, user, and context', () => {
    const result = filterKubeconfigForCluster(makeKubeconfig(), 'context-a');
    const parsed = yaml.load(result!) as KubeconfigObject;

    expect(parsed.clusters).toEqual([
      { name: 'cluster-a', cluster: { server: 'https://a.example.com' } },
    ]);
    expect(parsed.users).toEqual([{ name: 'user-a', user: { token: 'token-a' } }]);
    expect(parsed.contexts).toHaveLength(1);
    expect(parsed.contexts[0].name).toBe('context-a');
    expect((parsed as any)['current-context']).toBe('context-a');
  });

  it('matches a stateless cluster renamed via headlamp_info.customName', () => {
    const result = filterKubeconfigForCluster(makeKubeconfig(), 'renamed-cluster');
    const parsed = yaml.load(result!) as KubeconfigObject;

    expect(parsed.contexts).toHaveLength(1);
    expect(parsed.contexts[0].name).toBe('context-b');
    expect(parsed.clusters).toEqual([
      { name: 'cluster-b', cluster: { server: 'https://b.example.com' } },
    ]);
  });

  it('preserves the actual context name as current-context, not the custom name', () => {
    const result = filterKubeconfigForCluster(makeKubeconfig(), 'renamed-cluster');
    const parsed = yaml.load(result!) as any;

    expect(parsed['current-context']).toBe('context-b');
    expect(parsed['current-context']).not.toBe('renamed-cluster');
  });

  it('returns null when no context matches the cluster name', () => {
    const result = filterKubeconfigForCluster(makeKubeconfig(), 'does-not-exist');
    expect(result).toBeNull();
  });
});
