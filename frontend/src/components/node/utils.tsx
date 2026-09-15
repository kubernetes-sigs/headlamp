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

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/system';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { KubeContainer } from '../../lib/k8s/cluster';
import Node from '../../lib/k8s/node';
import type { KubePod } from '../../lib/k8s/pod';
import Pod, { isRestartableInitContainer } from '../../lib/k8s/pod';
import * as units from '../../lib/units';

export function isNodeCordoned(node: Node): boolean {
  return !!node.spec?.unschedulable;
}

// Pods managed by a DaemonSet, mirror pods, and terminated (Succeeded/Failed)
// pods are left behind or removed by `kubectl drain`, so they are ignored when
// deciding whether a node has been drained.
function isWorkloadPod(pod: Pod): boolean {
  const ownedByDaemonSet = pod.metadata.ownerReferences?.some(ref => ref.kind === 'DaemonSet');
  const isMirror = pod.metadata.annotations?.['kubernetes.io/config.mirror'] !== undefined;
  const isTerminal = pod.status?.phase === 'Succeeded' || pod.status?.phase === 'Failed';
  return !ownedByDaemonSet && !isMirror && !isTerminal;
}

// A node is drained when it is cordoned and no workload pods
// remain scheduled on it.
export function isNodeDrained(node: Node, podsOnNode: Pod[]): boolean {
  return isNodeCordoned(node) && !podsOnNode.some(isWorkloadPod);
}

/** CPU and memory totals, in the units returned by {@link units.parseCpu} and {@link units.parseRam}. */
interface ResourceAmount {
  cpu: number;
  memory: number;
}

/** The scheduled CPU and memory of every pod on a node, requests and limits. */
export interface NodeResourceTotals {
  cpuRequests: number;
  cpuLimits: number;
  memoryRequests: number;
  memoryLimits: number;
}

const ZERO: ResourceAmount = { cpu: 0, memory: 0 };

function add(a: ResourceAmount, b: ResourceAmount): ResourceAmount {
  return { cpu: a.cpu + b.cpu, memory: a.memory + b.memory };
}

/** Per-resource maximum, matching Kubernetes' `maxResourceList`. */
function max(a: ResourceAmount, b: ResourceAmount): ResourceAmount {
  return { cpu: Math.max(a.cpu, b.cpu), memory: Math.max(a.memory, b.memory) };
}

function containerAmount(container: KubeContainer, field: 'requests' | 'limits'): ResourceAmount {
  const resources = container.resources?.[field];
  return {
    cpu: units.parseCpu(resources?.cpu || '0'),
    memory: units.parseRam(resources?.memory || '0'),
  };
}

/**
 * The effective requests (or limits) of a single pod, as the scheduler accounts
 * for them and as `kubectl describe node` reports them.
 *
 * Regular containers run side by side, so their amounts add up. Plain init
 * containers run one at a time and finish before the pod's containers start, so
 * they only raise the total to the largest single init step. Sidecars —
 * {@link isRestartableInitContainer} — stay up for the whole pod lifetime, so
 * they add to the total like a regular container *and* raise the baseline that
 * later init containers are measured against.
 *
 * @see {@link https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/#resource-sharing-within-containers} Kubernetes definition of a pod's effective requests
 */
function podAmount(pod: KubePod, field: 'requests' | 'limits'): ResourceAmount {
  let total = ZERO;
  for (const container of pod.spec?.containers ?? []) {
    total = add(total, containerAmount(container, field));
  }

  // The running total of the sidecars seen so far, and the largest single init
  // step, kept separate so a sidecar is never counted twice.
  let sidecars = ZERO;
  let initMax = ZERO;

  for (const container of pod.spec?.initContainers ?? []) {
    const amount = containerAmount(container, field);
    if (isRestartableInitContainer(container)) {
      total = add(total, amount);
      sidecars = add(sidecars, amount);
      initMax = max(initMax, sidecars);
    } else {
      initMax = max(initMax, add(amount, sidecars));
    }
  }

  return max(total, initMax);
}

/**
 * Sums the effective requests and limits of every pod scheduled on a node, for
 * the node details resource allocation summary.
 *
 * Callers are expected to pass only non-terminated pods, since the scheduler
 * releases the resources of Succeeded and Failed pods.
 */
export function getNodeResourceTotals(pods: KubePod[] | null): NodeResourceTotals {
  let requests = ZERO;
  let limits = ZERO;

  for (const pod of pods ?? []) {
    requests = add(requests, podAmount(pod, 'requests'));
    limits = add(limits, podAmount(pod, 'limits'));
  }

  return {
    cpuRequests: requests.cpu,
    cpuLimits: limits.cpu,
    memoryRequests: requests.memory,
    memoryLimits: limits.memory,
  };
}

const WrappingBox = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'left',
  flexWrap: 'wrap',
  overflow: 'hidden',
  '& > *': {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
}));

const PaddedChip = styled(Chip)({
  paddingTop: '2px',
  paddingBottom: '2px',
});

export function formatTaint(taint: { key: string; value?: string; effect: string }) {
  return `${taint.key}${taint.value ? '=' + taint.value : ''}:${taint.effect}`;
}

export function NodeTaintsLabel(props: { node: Node }) {
  const { node } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  if (node.spec?.taints === undefined) {
    return <WrappingBox>{t('translation|None')}</WrappingBox>;
  }
  const limits: ReactNode[] = [];
  node.spec.taints.forEach(taint => {
    const format = formatTaint(taint);
    limits.push(
      <Tooltip title={format} key={taint.key}>
        <PaddedChip label={format} variant="outlined" size="small" />
      </Tooltip>
    );
  });
  return <WrappingBox>{limits}</WrappingBox>;
}
