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

// Mock the K8s modules to avoid circular import issues in the test environment
vi.mock('../../lib/k8s/node', () => ({ default: {} }));
vi.mock('../../lib/k8s/pod', () => ({ default: {} }));

import type Node from '../../lib/k8s/node';
import type Pod from '../../lib/k8s/pod';
import { isNodeCordoned, isNodeDrained } from './utils';

function makeNode(unschedulable?: boolean): Node {
  return { spec: { unschedulable } } as any;
}

function makePod(opts: { ownerKind?: string; mirror?: boolean; phase?: string } = {}): Pod {
  return {
    metadata: {
      ownerReferences: opts.ownerKind ? [{ kind: opts.ownerKind }] : undefined,
      annotations: opts.mirror ? { 'kubernetes.io/config.mirror': 'true' } : undefined,
    },
    status: opts.phase ? { phase: opts.phase } : undefined,
  } as any;
}

describe('isNodeCordoned', () => {
  it('is true when spec.unschedulable is true', () => {
    expect(isNodeCordoned(makeNode(true))).toBe(true);
  });

  it('is false when spec.unschedulable is false or absent', () => {
    expect(isNodeCordoned(makeNode(false))).toBe(false);
    expect(isNodeCordoned(makeNode(undefined))).toBe(false);
  });
});

describe('isNodeDrained', () => {
  it('is false when the node is not cordoned', () => {
    expect(isNodeDrained(makeNode(false), [])).toBe(false);
  });

  it('is true when cordoned and no pods remain', () => {
    expect(isNodeDrained(makeNode(true), [])).toBe(true);
  });

  it('is true when cordoned and only DaemonSet or mirror pods remain', () => {
    const pods = [makePod({ ownerKind: 'DaemonSet' }), makePod({ mirror: true })];
    expect(isNodeDrained(makeNode(true), pods)).toBe(true);
  });

  it('is false when cordoned and a workload pod remains', () => {
    const pods = [makePod({ ownerKind: 'DaemonSet' }), makePod({ ownerKind: 'ReplicaSet' })];
    expect(isNodeDrained(makeNode(true), pods)).toBe(false);
  });

  it('is true when cordoned and only terminated (Succeeded/Failed) pods remain', () => {
    const pods = [
      makePod({ ownerKind: 'ReplicaSet', phase: 'Succeeded' }),
      makePod({ ownerKind: 'ReplicaSet', phase: 'Failed' }),
    ];
    expect(isNodeDrained(makeNode(true), pods)).toBe(true);
  });
});
