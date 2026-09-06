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

import { KubeObjectInterface } from '../../lib/k8s/KubeObject';

export const leaderWorkerSets: KubeObjectInterface[] = [
  {
    apiVersion: 'leaderworkerset.x-k8s.io/v1',
    kind: 'LeaderWorkerSet',
    metadata: {
      name: '',
      creationTimestamp: '2023-07-28T08:00:00Z',
      generation: 1,
      labels: {
        app: 'my-leaderworkerset',
      },
      namespace: 'default',
      resourceVersion: '123456',
      uid: 'abc123',
    },
    spec: {
      replicas: 2,
      leaderWorkerTemplate: {
        size: 3,
        restartPolicy: 'RecreateGroupOnPodRestart',
        leaderTemplate: {
          spec: {
            containers: [
              {
                name: 'leader',
                image: 'nginx:1.27',
                resources: {
                  limits: {
                    cpu: '100m',
                  },
                },
              },
            ],
          },
        },
        workerTemplate: {
          spec: {
            containers: [
              {
                name: 'worker',
                image: 'nginx:1.27',
                resources: {
                  limits: {
                    cpu: '100m',
                  },
                },
              },
            ],
          },
        },
      },
    },
    status: {
      replicas: 2,
      readyReplicas: 2,
      updatedReplicas: 2,
      conditions: [
        {
          type: 'Available',
          status: 'True',
          reason: 'AllGroupsReady',
          message: 'All replicas are ready',
          lastTransitionTime: '2023-07-28T08:01:00Z',
        },
      ],
    },
  },
];
