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

// Mock the K8s modules to avoid circular import issues in the test environment.
// isRestartableInitContainer is a plain predicate over a container, so the real
// one-liner is used rather than a stub.
vi.mock('../../lib/k8s/node', () => ({ default: {} }));
vi.mock('../../lib/k8s/pod', () => ({
  default: {},
  isRestartableInitContainer: (container?: { restartPolicy?: string }) =>
    container?.restartPolicy === 'Always',
}));

import type { KubeContainer } from '../../lib/k8s/cluster';
import type Node from '../../lib/k8s/node';
import type Pod from '../../lib/k8s/pod';
import type { KubePod } from '../../lib/k8s/pod';
import { getNodeResourceTotals, isNodeCordoned, isNodeDrained } from './utils';

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

function makeContainer(cpu: string, memory: string, restartPolicy?: string): KubeContainer {
  return {
    name: 'c',
    image: 'img',
    resources: { requests: { cpu, memory }, limits: { cpu, memory } },
    ...(restartPolicy ? { restartPolicy } : {}),
  } as KubeContainer;
}

function makeResourcePod(opts: {
  containers?: KubeContainer[];
  initContainers?: KubeContainer[];
}): KubePod {
  return {
    spec: { containers: opts.containers ?? [], initContainers: opts.initContainers },
  } as any;
}

// 1m CPU is 1e6 in the units parseCpu returns, and 1Mi is 1048576 bytes.
const M_CPU = 1000000;
const MI = 1024 * 1024;

describe('getNodeResourceTotals', () => {
  it('is zero for no pods', () => {
    expect(getNodeResourceTotals(null)).toEqual({
      cpuRequests: 0,
      cpuLimits: 0,
      memoryRequests: 0,
      memoryLimits: 0,
    });
    expect(getNodeResourceTotals([])).toEqual({
      cpuRequests: 0,
      cpuLimits: 0,
      memoryRequests: 0,
      memoryLimits: 0,
    });
  });

  it('adds up the containers of a pod, and every pod on the node', () => {
    const pod = makeResourcePod({
      containers: [makeContainer('100m', '128Mi'), makeContainer('200m', '256Mi')],
    });

    expect(getNodeResourceTotals([pod, pod])).toEqual({
      cpuRequests: 600 * M_CPU,
      cpuLimits: 600 * M_CPU,
      memoryRequests: 768 * MI,
      memoryLimits: 768 * MI,
    });
  });

  it('treats a plain init container as a lower bound, not an addition', () => {
    // The init step is smaller than the containers, so it changes nothing.
    const smallInit = makeResourcePod({
      containers: [makeContainer('500m', '512Mi')],
      initContainers: [makeContainer('50m', '64Mi')],
    });
    expect(getNodeResourceTotals([smallInit])).toMatchObject({
      cpuRequests: 500 * M_CPU,
      memoryRequests: 512 * MI,
    });

    // A larger init step raises the pod total to its own size.
    const largeInit = makeResourcePod({
      containers: [makeContainer('500m', '512Mi')],
      initContainers: [makeContainer('2000m', '2048Mi')],
    });
    expect(getNodeResourceTotals([largeInit])).toMatchObject({
      cpuRequests: 2000 * M_CPU,
      memoryRequests: 2048 * MI,
    });
  });

  it('takes the largest of several plain init containers', () => {
    const pod = makeResourcePod({
      containers: [makeContainer('100m', '128Mi')],
      initContainers: [makeContainer('300m', '64Mi'), makeContainer('50m', '512Mi')],
    });

    // CPU and memory are maxed independently, as Kubernetes does.
    expect(getNodeResourceTotals([pod])).toMatchObject({
      cpuRequests: 300 * M_CPU,
      memoryRequests: 512 * MI,
    });
  });

  it('adds a sidecar to the pod total instead of maxing it', () => {
    const pod = makeResourcePod({
      containers: [makeContainer('500m', '512Mi')],
      initContainers: [makeContainer('100m', '128Mi', 'Always')],
    });

    expect(getNodeResourceTotals([pod])).toEqual({
      cpuRequests: 600 * M_CPU,
      cpuLimits: 600 * M_CPU,
      memoryRequests: 640 * MI,
      memoryLimits: 640 * MI,
    });
  });

  it('adds every sidecar and still maxes the plain init containers', () => {
    const pod = makeResourcePod({
      containers: [makeContainer('500m', '512Mi')],
      initContainers: [
        makeContainer('100m', '128Mi', 'Always'),
        makeContainer('200m', '256Mi', 'Always'),
        makeContainer('50m', '64Mi'),
      ],
    });

    // 500m + 100m + 200m of running containers, against an init step of
    // 50m on top of the 300m of sidecars already up.
    expect(getNodeResourceTotals([pod])).toMatchObject({
      cpuRequests: 800 * M_CPU,
      memoryRequests: 896 * MI,
    });
  });

  it('measures a plain init container against the sidecars already started', () => {
    // The init container asks for less than the containers on its own, but more
    // once the sidecar that starts before it is included.
    const pod = makeResourcePod({
      containers: [makeContainer('500m', '512Mi')],
      initContainers: [makeContainer('100m', '128Mi', 'Always'), makeContainer('550m', '1024Mi')],
    });

    // Pod total is max(500m + 100m, 550m + 100m) = 650m,
    // and max(512Mi + 128Mi, 1024Mi + 128Mi) = 1152Mi.
    expect(getNodeResourceTotals([pod])).toMatchObject({
      cpuRequests: 650 * M_CPU,
      memoryRequests: 1152 * MI,
    });
  });

  it('ignores containers without resources', () => {
    const pod = makeResourcePod({
      containers: [{ name: 'c', image: 'img' } as KubeContainer, makeContainer('100m', '128Mi')],
    });

    expect(getNodeResourceTotals([pod])).toMatchObject({
      cpuRequests: 100 * M_CPU,
      memoryRequests: 128 * MI,
    });
  });
});
