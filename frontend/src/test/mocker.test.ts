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

import { vi } from 'vitest';

// Breaks mocker → KubeObject → util → node → KubeObject circular dep at module-load time.
vi.mock('../lib/k8s/KubeObject', () => {
  class KubeObject {
    metadata: any;
    constructor(data: any) {
      Object.assign(this, data);
    }
  }
  return { KubeObject };
});

// node.ts imports the k8s barrel, re-triggering the same cycle.
vi.mock('../lib/k8s', () => ({}));

import { generateK8sResourceList } from './mocker';

const baseMeta = { uid: '', creationTimestamp: '' };

describe('generateK8sResourceList', () => {
  it('interpolates {{i}} in namespace', () => {
    const list = generateK8sResourceList({
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: { ...baseMeta, name: 'pod-{{i}}', namespace: 'ns-{{i}}' },
    });

    expect(list[0].metadata.namespace).toBe('ns-0');
    expect(list[1].metadata.namespace).toBe('ns-1');
    expect(list[2].metadata.namespace).toBe('ns-2');
    expect(list[3].metadata.namespace).toBe('ns-3');
    expect(list[4].metadata.namespace).toBe('ns-4');
  });

  it('does not leave literal {{i}} in namespace', () => {
    const list = generateK8sResourceList({
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: { ...baseMeta, name: 'pod', namespace: 'ns-{{i}}' },
    });

    list.forEach(item => {
      expect(item.metadata.namespace).not.toContain('{{i}}');
    });
  });

  it('interpolates {{i}} in name', () => {
    const list = generateK8sResourceList({
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: { ...baseMeta, name: 'pod-{{i}}' },
    });

    expect(list[0].metadata.name).toBe('pod-0');
    expect(list[1].metadata.name).toBe('pod-1');
  });

  it('respects numResults', () => {
    const list = generateK8sResourceList(
      { kind: 'Pod', apiVersion: 'v1', metadata: { ...baseMeta, name: 'pod' } },
      { numResults: 2 }
    );

    expect(list).toHaveLength(2);
  });
});
