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

import type { KubeDeployment } from '../../lib/k8s/deployment';
import type { KubeEvent } from '../../lib/k8s/event';
import type { KubePod } from '../../lib/k8s/pod';
import { podList } from '../pod/storyHelper';

// Reuse the existing, fully-formed pod fixtures so the diagnostics logic (which
// reads detailed container/condition status) runs against realistic data.

/** Looks up a pod fixture by name, throwing immediately if it is missing so a
 * renamed fixture fails loudly here instead of crashing later as `undefined`. */
function getPodFixture(name: string): KubePod {
  const pod = podList.find(pod => pod.metadata.name === name);
  if (!pod) {
    throw new Error(`Pod fixture "${name}" not found in pod/storyHelper podList`);
  }
  return pod;
}

/** A healthy, Running pod. Produces no diagnostics (empty state). */
export const healthyPod: KubePod = getPodFixture('running');

/** A pod stuck in ImagePullBackOff. Produces error and info diagnostics. */
export const failingPod: KubePod = getPodFixture('imagepullbackoff');

/** Warning events used to exercise the warning-event branch of the pod diagnostics. */
export const warningEvents: KubeEvent[] = [
  {
    apiVersion: 'v1',
    kind: 'Event',
    type: 'Warning',
    reason: 'Unhealthy',
    message: 'Readiness probe failed: HTTP probe failed with statuscode: 500',
    count: 7,
    firstTimestamp: '2023-03-25T08:00:00Z',
    lastTimestamp: '2023-04-01T10:00:00Z',
    metadata: {
      name: 'imagepullbackoff.unhealthy',
      namespace: 'default',
      uid: 'event-unhealthy-uid',
      resourceVersion: '301',
      creationTimestamp: '2023-03-25T08:00:00Z',
    },
    involvedObject: {
      kind: 'Pod',
      namespace: 'default',
      name: 'imagepullbackoff',
      uid: '124',
      apiVersion: 'v1',
      resourceVersion: '124',
      fieldPath: 'spec.containers{imagepullbackoff}',
    },
  },
];

const deploymentSpec: KubeDeployment['spec'] = {
  replicas: 3,
  selector: { matchLabels: { app: 'web' } },
  template: {
    metadata: {
      name: 'web',
      uid: 'deployment-web-template-uid',
      creationTimestamp: '2023-04-01T10:00:00Z',
      labels: { app: 'web' },
    },
    spec: {
      nodeName: 'node-1',
      containers: [
        {
          name: 'web',
          image: 'nginx:1.14.2',
          imagePullPolicy: 'IfNotPresent',
        },
      ],
    },
  },
};

/** A healthy Deployment with all replicas available. Produces no diagnostics. */
export const healthyDeployment: KubeDeployment = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: {
    name: 'web',
    namespace: 'default',
    uid: 'deployment-web-uid',
    resourceVersion: '401',
    creationTimestamp: '2023-04-01T10:00:00Z',
  },
  spec: deploymentSpec,
  status: {
    replicas: 3,
    readyReplicas: 3,
    availableReplicas: 3,
    updatedReplicas: 3,
    conditions: [
      {
        type: 'Available',
        status: 'True',
        reason: 'MinimumReplicasAvailable',
        message: 'Deployment has minimum availability.',
      },
    ],
  },
};

/** A Deployment with unavailable replicas and a failing Available condition. */
export const degradedDeployment: KubeDeployment = {
  ...healthyDeployment,
  metadata: {
    ...healthyDeployment.metadata,
    name: 'web-degraded',
    uid: 'deployment-web-degraded-uid',
  },
  status: {
    replicas: 3,
    readyReplicas: 1,
    availableReplicas: 1,
    unavailableReplicas: 2,
    updatedReplicas: 3,
    conditions: [
      {
        type: 'Available',
        status: 'False',
        reason: 'MinimumReplicasUnavailable',
        message: 'Deployment does not have minimum availability.',
      },
    ],
  },
};
