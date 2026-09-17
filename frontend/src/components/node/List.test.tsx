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

import { describe, expect, it, vi } from 'vitest';
import type Node from '../../lib/k8s/node';
import { filterNode } from './List';

vi.mock('../../lib/k8s', () => ({
  useConnectApi: vi.fn(),
}));

vi.mock('../../lib/k8s/node', () => ({
  default: class Node {
    static useMetrics = vi.fn(() => [null, null]);
    static useList = vi.fn(() => ({ items: [] }));
  },
}));

vi.mock('./Charts', () => ({
  UsageBarChart: () => null,
}));

vi.mock('./Details', () => ({
  NodeReadyLabel: () => null,
}));

vi.mock('./UpgradeVisualizationPanel', () => ({
  default: () => null,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: () => null,
}));

describe('filterNode', () => {
  const readySchedulableNode = {
    spec: { unschedulable: false },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  } as unknown as Node;

  const readyCordonedNode = {
    spec: { unschedulable: true },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  } as unknown as Node;

  const notReadyNode = {
    spec: { unschedulable: false },
    status: {
      conditions: [{ type: 'Ready', status: 'False' }],
    },
  } as unknown as Node;

  const pendingNode = {
    spec: {},
    status: {
      conditions: [],
    },
  } as unknown as Node;

  const notReadyCordonedNode = {
    spec: { unschedulable: true },
    status: {
      conditions: [{ type: 'Ready', status: 'False' }],
    },
  } as unknown as Node;

  it('filters ready schedulable nodes correctly', () => {
    expect(filterNode(readySchedulableNode, 'Ready')).toBe(true);
    expect(filterNode(readySchedulableNode, 'ready')).toBe(true);
    expect(filterNode(readySchedulableNode, 'schedulable')).toBe(true);
    expect(filterNode(readyCordonedNode, 'Ready')).toBe(false);
    expect(filterNode(notReadyNode, 'Ready')).toBe(false);
    expect(filterNode(notReadyCordonedNode, 'Ready')).toBe(false);
    expect(filterNode(pendingNode, 'Ready')).toBe(false);
  });

  it('filters cordoned nodes correctly', () => {
    expect(filterNode(readyCordonedNode, 'Cordoned')).toBe(true);
    expect(filterNode(readyCordonedNode, 'cordoned')).toBe(true);
    expect(filterNode(notReadyCordonedNode, 'Cordoned')).toBe(true);
    expect(filterNode(readySchedulableNode, 'Cordoned')).toBe(false);
    expect(filterNode(notReadyNode, 'Cordoned')).toBe(false);
  });

  it('filters not ready nodes correctly', () => {
    expect(filterNode(notReadyNode, 'NotReady')).toBe(true);
    expect(filterNode(notReadyNode, 'not ready')).toBe(true);
    expect(filterNode(notReadyNode, 'not-ready')).toBe(true);
    expect(filterNode(notReadyCordonedNode, 'NotReady')).toBe(true);
    expect(filterNode(pendingNode, 'NotReady')).toBe(true);
    expect(filterNode(readySchedulableNode, 'NotReady')).toBe(false);
  });

  it('returns undefined for unrelated search terms so default fuzzy column matching applies', () => {
    expect(filterNode(readySchedulableNode, 'node-1')).toBeUndefined();
    expect(filterNode(readyCordonedNode, 'node-1')).toBeUndefined();
    expect(filterNode(notReadyCordonedNode, 'node-1')).toBeUndefined();
  });

  it('returns true when search is undefined to preserve rows for Table prefiltering', () => {
    expect(filterNode(readySchedulableNode, undefined)).toBe(true);
    expect(filterNode(readyCordonedNode, undefined)).toBe(true);
    expect(filterNode(notReadyNode, undefined)).toBe(true);
    expect(filterNode(notReadyCordonedNode, undefined)).toBe(true);
  });
});
