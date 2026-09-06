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

import { KubeObject, Workload } from '../../../lib/k8s/cluster';
import Pod from '../../../lib/k8s/pod';
import type PodGroup from '../../../lib/k8s/podGroup';
import { getReadyReplicas, getTotalReplicas } from '../../../lib/util';
import type { GraphNode } from '../graph/graphModel';

export type KubeObjectStatus = 'error' | 'success' | 'warning';

const POD_GROUP_API_GROUP = 'scheduling.k8s.io';

/**
 * Returns a generic status for the given Pod
 * Status is determined based on phase and conditions
 */
function getPodStatus(pod: Pod): KubeObjectStatus {
  const phase = pod.status.phase;

  if (phase === 'Failed') {
    return 'error';
  } else if (phase === 'Succeeded' || phase === 'Running') {
    const readyCondition = pod.status.conditions.find(condition => condition.type === 'Ready');
    if (readyCondition?.status === 'True' || phase === 'Succeeded') {
      return 'success';
    } else {
      return 'warning';
    }
  } else if (phase === 'Pending') {
    return 'warning';
  }
  return 'success';
}

/**
 * Narrows a resource to a PodGroup of the scheduling API
 * The group is checked as well as the kind, so that a custom resource of the same kind,
 * such as the Volcano PodGroup, is not mistaken for one
 */
function isPodGroup(w: KubeObject): w is PodGroup {
  return w.kind === 'PodGroup' && w._class().apiGroupName === POD_GROUP_API_GROUP;
}

/**
 * Returns a generic status for the given PodGroup
 * A group that is not scheduled yet is a warning, so that it stands out on the map
 * without being opened
 */
function getPodGroupStatus(podGroup: PodGroup): KubeObjectStatus {
  return podGroup.schedulingCondition?.status === 'True' ? 'success' : 'warning';
}

/**
 * Returns status for a given Kube resource
 * Not all kinds of resources have a status and/or supported
 */
export function getStatus(w: KubeObject): KubeObjectStatus {
  if (Pod.isClassOf(w)) return getPodStatus(w);

  if (isPodGroup(w)) return getPodGroupStatus(w);

  if (['DaemonSet', 'ReplicaSet', 'StatefulSet', 'Deployment'].includes(w.kind)) {
    const workload = w as Workload;
    const notReady = getReadyReplicas(workload) < getTotalReplicas(workload);
    return notReady ? 'warning' : 'success';
  }

  return 'success';
}

/**
 * Returns status for a graph node.
 * Explicit node status takes precedence over kube object status.
 */
export function getGraphNodeStatus(
  node: Pick<GraphNode, 'kubeObject' | 'status'>
): KubeObjectStatus {
  return node.status ?? (node.kubeObject ? getStatus(node.kubeObject) : 'success');
}
